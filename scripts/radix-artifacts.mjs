import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
import {deliveryMetadata,relativeFile,deliveryName,runtimeName,converterNotices,digestFile,checksumFiles,writeDeliveryZip,verifyDeliveryZip} from './radix-delivery.mjs';

export async function prepareRadixArtifacts(root=path.resolve('.')){
 root=path.resolve(root);
 const metadata=deliveryMetadata(JSON.parse(await fs.readFile(path.join(root,'experimental-release/studio-build.json'),'utf8'))),out=path.join(root,'experimental-artifacts');
 // Prepare and verify a complete set before replacing a previous local delivery.
 // Staging stays in the ignored test-output tree and never touches release/.
 const stagingRoot=path.join(root,'test-output');await fs.mkdir(stagingRoot,{recursive:true});const stage=await fs.mkdtemp(path.join(stagingRoot,'radix-artifacts-staging-'));
 const files=[],copy=async(source,name)=>{relativeFile(name);const destination=path.join(stage,name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(root,source),destination);files.push(name);};
 const write=async(name,text)=>{relativeFile(name);await fs.writeFile(path.join(stage,name),text);files.push(name);};
 async function tree(source,prefix,refs){
  for(const item of await fs.readdir(path.join(root,source),{withFileTypes:true})){const name=relativeFile(prefix+'/'+item.name),input=source+'/'+item.name;if(item.isSymbolicLink())throw Error('Symlink in experimental artifacts: '+input);if(item.isDirectory())await tree(input,name,refs);else if(item.isFile()){if(refs)refs.add(name);else await copy(input,name);}}
 }
 try{
  await copy(path.join('experimental-release',metadata.artifactName),metadata.artifactName);
  await copy('launcher/Launch Tour.exe','Launch-Tour-Experimental.exe');
  // Export the same emitted visitor dependency closure used by authored tours.
  const manifest=JSON.parse(await fs.readFile(path.join(root,'dist/.vite/manifest.json'),'utf8')),seen=new Set(),refs=new Set(['index.html']),entries={};
  function visit(key){if(seen.has(key))return;seen.add(key);const entry=manifest[key];if(!entry)throw Error('Missing visitor dependency '+key);for(const file of [entry.file,...entry.css||[],...entry.assets||[]])refs.add(relativeFile(file));for(const child of [...entry.imports||[],...entry.dynamicImports||[]])visit(child);}
  visit('index.html');await tree('dist/licenses','licenses',refs);await tree('dist/performance-spec','performance-spec',refs);
  for(const ref of refs)entries[ref]=new Uint8Array(await fs.readFile(path.join(root,'dist',ref)));
  const expected=await fs.readFile(path.join(root,'src/rendering/radix/vendor/LICENSE'));
  if(!expected.equals(Buffer.from(entries['licenses/Radix-LICENSE.txt']||[])))throw Error('Full World Labs license missing from visitor template.');
  const runtime=runtimeName(metadata);await fs.writeFile(path.join(stage,runtime),zipSync(entries,{level:6}));files.push(runtime);
  for(const name of ['LICENSE','THIRD_PARTY.md','RADIX_EXPERIMENT.md'])await copy(name,name);
  await copy('experimental-release/studio-build.json','studio-build.json');
  await tree('dist/licenses','licenses');await tree('sogs-tools/licenses','sogs-tools-licenses');
  for(const name of converterNotices)if(!files.includes('sogs-tools-licenses/'+name))throw Error('Missing packaged converter notice: '+name);
  await write('RELEASE_NOTES.md',`Experimental Radix / SOGS build of Studio ${metadata.version}, commit ${metadata.commit}.\n\nWindows x64 portable editor, locally bundled CPU PLY-to-LoD-SOGS tools, tour launcher and web runtime template. This is a prerelease from Experiemental-Radix-SOGS; stable releases remain separate. Use a copy of your project and replace each RAD source with SOGS. See RADIX_EXPERIMENT.md for workflow, known limits and user-test steps.\n\nThe renderer and adapted SOGS LoD examples are Copyright © 2026 WORLD LABS TECHNOLOGIES, INC., MIT; complete notices and provenance accompany Studio and exported sites. Converter components retain separate bundled notices.\n\nCI verifies conversion/import/export, rendering, selection, collision generation and executable startup. Physical Quest compatibility and hardware performance still require testing; no frame-rate or time-to-detail gain is promised.\n`);
  await write('README.txt',`3DGS Perspectives Studio ${metadata.version} - Radix / SOGS Experimental - Windows x64\nBuild ${metadata.commit}\n\nExtract the complete ZIP before running the software.\n\nStudio: run ${metadata.artifactName}. Its converter and dependencies are bundled; Node.js need not be installed. Open a COPY of an existing project and use Replace scene splat to replace RAD sources with SOGS, or queue PLY conversion to streamed LoD SOGS.\n\nTour launcher: Launch-Tour-Experimental.exe serves an existing exported tour. Place it in the exported tour folder; it is not the Studio editor. Normally Studio's Export command supplies the launcher automatically.\n\nWeb runtime: ${runtime} is a developer template, not an authored tour. Use Studio to export your scenes, media and project data into a complete tour.\n\nRADIX_EXPERIMENT.md contains workflow, limitations and test steps. RELEASE_NOTES.md and studio-build.json identify this experimental build. The licenses/ directory retains full visitor notices, World Labs' MIT license, SOGS LoD adapter provenance and modification notes. sogs-tools-licenses/ retains full converter notices and provenance.\n\nThe SHA256SUMS.txt INSIDE this ZIP covers every other contained file. The separately downloadable SHA256SUMS.txt covers the loose files AND this completed ZIP. Neither checksum file hashes itself.\n\nThis is an experimental preview, separate from the stable release. Physical Quest testing and comparative performance measurements remain necessary.\n`);
  for(const name of files)if(!(await fs.stat(path.join(stage,name))).size)throw Error('Empty experimental artifact: '+name);
  await fs.writeFile(path.join(stage,'SHA256SUMS.txt'),await checksumFiles(stage,files));
  const names=[...files,'SHA256SUMS.txt'],expectedHashes={};for(const name of names)expectedHashes[name]=await digestFile(path.join(stage,name));
  const bundle=deliveryName(metadata);await writeDeliveryZip(path.join(stage,bundle),stage,names);
  const verification=await verifyDeliveryZip(path.join(stage,bundle),{expectedHashes});
  // The archive contains its own payload manifest. Only the external manifest
  // adds the now-completed archive hash, avoiding a recursive self-hash cycle.
  const loose=files.filter(name=>!name.includes('/'));
  await fs.writeFile(path.join(stage,'SHA256SUMS.txt'),await checksumFiles(stage,[...loose,bundle]));
  // Release attachments are top-level files. The complete notice trees remain
  // inside the verified bundle and runtime, rather than checksum-only loose
  // paths that GitHub's release attachment glob would not publish.
  await fs.rm(path.join(stage,'licenses'),{recursive:true,force:true});await fs.rm(path.join(stage,'sogs-tools-licenses'),{recursive:true,force:true});
  await fs.rm(out,{recursive:true,force:true});await fs.rename(stage,out);
  console.log('Prepared and verified Windows x64 experimental delivery ZIP, editor, launcher, visitor template, full notices and SHA256SUMS: '+out);
  return {out,bundle,path:path.join(out,bundle),files:[...loose,bundle,'SHA256SUMS.txt'],verification};
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='verify'){const result=await verifyDeliveryZip(path.resolve(process.argv[3]||''));console.log('Verified experimental delivery ZIP: '+result.sha256);}
 else if(process.argv.length===2)await prepareRadixArtifacts();
 else throw Error('Use radix-artifacts.mjs or radix-artifacts.mjs verify <delivery.zip>.');
}

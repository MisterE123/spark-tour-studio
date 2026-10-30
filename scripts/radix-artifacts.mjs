import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';

const metadata=JSON.parse(await fs.readFile('experimental-release/studio-build.json','utf8'));
if(!metadata.experimental||metadata.dirty||metadata.branch!=='Experiemental-Radix-SOGS'||!/^[a-f0-9]{40}$/.test(metadata.commit))throw Error('Only a clean identified Radix experimental build can be published.');
if(path.basename(metadata.artifactName)!==metadata.artifactName||!metadata.artifactName.endsWith('.exe'))throw Error('Invalid experimental artifact name.');
const out=path.resolve('experimental-artifacts');await fs.mkdir(out,{recursive:true});
// Do not accidentally attach an older preview's executable on a local rerun.
for(const item of await fs.readdir(out,{withFileTypes:true}))if(item.isFile())await fs.unlink(path.join(out,item.name));
const files=[],copy=async(source,name)=>{await fs.copyFile(source,path.join(out,name));files.push(name);};
await copy(path.join('experimental-release',metadata.artifactName),metadata.artifactName);
await copy('launcher/Launch Tour.exe','Launch-Tour-Experimental.exe');
// Export the same emitted visitor dependency closure used by authored tours.
const manifest=JSON.parse(await fs.readFile('dist/.vite/manifest.json','utf8')),seen=new Set(),refs=new Set(['index.html']),entries={};
function visit(key){if(seen.has(key))return;seen.add(key);const entry=manifest[key];if(!entry)throw Error('Missing visitor dependency '+key);for(const file of [entry.file,...entry.css||[],...entry.assets||[]])refs.add(file);for(const child of [...entry.imports||[],...entry.dynamicImports||[]])visit(child);}
visit('index.html');
async function tree(dir){for(const item of await fs.readdir(path.join('dist',dir),{withFileTypes:true})){const name=dir+'/'+item.name;if(item.isDirectory())await tree(name);else if(item.isFile())refs.add(name);}}
await tree('licenses');await tree('performance-spec');
for(const ref of refs)entries[ref]=new Uint8Array(await fs.readFile(path.join('dist',ref)));
const expected=await fs.readFile('src/rendering/radix/vendor/LICENSE');if(!expected.equals(Buffer.from(entries['licenses/Radix-LICENSE.txt']||[])))throw Error('Full World Labs license missing from visitor template.');
const runtime=`Radix-SOGS-Web-Runtime-${metadata.shortCommit}.zip`;await fs.writeFile(path.join(out,runtime),zipSync(entries,{level:6}));files.push(runtime);
await copy('LICENSE','LICENSE');await copy('THIRD_PARTY.md','THIRD_PARTY.md');await copy('RADIX_EXPERIMENT.md','RADIX_EXPERIMENT.md');await copy('experimental-release/studio-build.json','studio-build.json');
let checksums='';for(const name of files)checksums+=createHash('sha256').update(await fs.readFile(path.join(out,name))).digest('hex')+'  '+name+'\n';await fs.writeFile(path.join(out,'SHA256SUMS.txt'),checksums);
await fs.writeFile(path.join(out,'RELEASE_NOTES.md'),`Experimental Radix / SOGS build of Studio ${metadata.version}, commit ${metadata.commit}.\n\nWindows x64 portable editor, locally bundled CPU PLY-to-LoD-SOGS tools, tour launcher and web runtime template. This is a prerelease from Experiemental-Radix-SOGS; stable releases remain separate. Use a copy of your project and replace each RAD source with SOGS. See RADIX_EXPERIMENT.md for workflow, known limits and user-test steps.\n\nThe renderer and adapted SOGS LoD examples are Copyright © 2026 WORLD LABS TECHNOLOGIES, INC., MIT; complete notices and provenance accompany Studio and exported sites. Converter components retain separate bundled notices.\n\nCI verifies conversion/import/export, rendering, selection, collision generation and executable startup. Physical Quest compatibility and hardware performance still require testing; no frame-rate or time-to-detail gain is promised.\n`);
console.log('Prepared clean experimental editor, launcher, visitor template, licenses and SHA256SUMS: '+out);

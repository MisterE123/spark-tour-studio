// Produces an offline browser folder; does not build Studio or touch its output.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {zipSync} from 'fflate';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const args=process.argv.slice(2);let output,evidence;
for(let i=0;i<args.length;i++){if(args[i]==='--zip')continue;if(args[i]==='--evidence-dir'){evidence=args[++i];if(!evidence)throw new Error('--evidence-dir requires a directory.');}else if(!output&&!args[i].startsWith('--'))output=args[i];else throw new Error('Unknown build argument: '+args[i]);}
const out=path.resolve(output||path.join(root,'test-output','radix-buffer-growth-standalone'));
if(out===root||out===here||!out.startsWith(root+path.sep)||out===path.join(root,'release')||out.startsWith(path.join(root,'release')+path.sep))throw new Error('Choose a dedicated output directory inside the workspace, outside release/.');
try{if((await fs.readdir(out)).length)throw new Error('Choose a new or empty output directory; stale investigation files must not enter the developer handoff.');}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(out,{recursive:true});
await build({entryPoints:[path.join(here,'app.js')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',sourcemap:true,minify:false,legalComments:'eof',metafile:true}).then(async result=>{
 await fs.writeFile(path.join(out,'bundle-inputs.json'),JSON.stringify({inputs:Object.keys(result.metafile.inputs)},null,2));
 const forbidden=Object.keys(result.metafile.inputs).filter(name=>!name.startsWith('node_modules/three/')&&!name.startsWith('src/rendering/radix/vendor/')&&!name.startsWith('repros/radix-buffer-growth/'));
 if(forbidden.length)throw new Error('Unexpected application input: '+forbidden.join(', '));
});
for(const name of ['index.html','README.md','REPORT.md','server.mjs'])await fs.copyFile(path.join(here,name),path.join(out,name));
// The upstream handoff includes only the standalone allocation reproduction.
// Never copy the directory wholesale: it also retains internal investigations.
await fs.mkdir(path.join(out,'evidence'),{recursive:true});
await fs.copyFile(path.join(here,'evidence/sort-capacity-growth.json'),path.join(out,'evidence/sort-capacity-growth.json'));
if(evidence){
 const folder=path.resolve(evidence),target=path.join(out,'evidence/synthetic');await fs.mkdir(target,{recursive:true});
 for(const name of ['result.json','sort-growth.json','render-growth.json','sort-uninstrumented.json'])await fs.copyFile(path.join(folder,name),path.join(target,name));
 for(const name of ['environment.json','gpu-samples.csv','repeat-sort-growth.json','repeat-gpu-samples.csv','sort-growth.png','render-growth.png','render-growth-active.png','sort-uninstrumented.png','render-growth-cpu.json.gz'])try{await fs.copyFile(path.join(folder,name),path.join(target,name));}catch(error){if(error.code!=='ENOENT')throw error;}
}
await fs.mkdir(path.join(out,'licenses'),{recursive:true});
await fs.copyFile(path.join(root,'src/rendering/radix/vendor/LICENSE'),path.join(out,'licenses/RADIX-MIT.txt'));
await fs.copyFile(path.join(root,'src/rendering/radix/vendor/PROVENANCE.json'),path.join(out,'licenses/RADIX-PROVENANCE.json'));
await fs.copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(out,'licenses/THREE-MIT.txt'));
await fs.copyFile(path.join(root,'LICENSE'),path.join(out,'licenses/REPRO-MIT.txt'));
// Editable handoff source uses the exact published npm package instead of this
// checkout's pinned copy. The shipped offline bundle still uses the verified
// module above; source rebuild requires only these two runtime dependencies.
const source=path.join(out,'source');await fs.mkdir(source,{recursive:true});
await fs.writeFile(path.join(source,'app.js'),(await fs.readFile(path.join(here,'app.js'),'utf8')).replace("'../../src/rendering/radix/vendor/radix.module.js'","'@sparkjsdev/radix'"));
for(const name of ['metrics.mjs','metrics.test.mjs'])await fs.copyFile(path.join(here,name),path.join(source,name));
await fs.copyFile(path.join(root,'LICENSE'),path.join(source,'LICENSE'));
await fs.writeFile(path.join(source,'package.json'),JSON.stringify({name:'radix-buffer-growth-repro',version:'1.0.0',private:true,type:'module',license:'MIT',scripts:{build:'esbuild app.js --bundle --format=esm --platform=browser --target=es2022 --sourcemap --outfile=../app.js',test:'node --test metrics.test.mjs'},dependencies:{'@sparkjsdev/radix':'0.0.1',three:'0.186.1'},devDependencies:{esbuild:'0.28.2'}},null,2));
const module=await fs.readFile(path.join(root,'src/rendering/radix/vendor/radix.module.js'));
const sha256=createHash('sha256').update(module).digest('hex');
if(sha256!=='8633fa532e88358df44b907dc2d01d7cc6206c4f0fa5ceed7f56bf26161442e6')throw new Error('Pinned published Radix module changed unexpectedly.');
await fs.writeFile(path.join(out,'BUILD.json'),JSON.stringify({radix:'0.0.1',radixModuleSha256:sha256,three:JSON.parse(await fs.readFile(path.join(root,'node_modules/three/package.json'),'utf8')).version,created:new Date().toISOString(),offline:true},null,2));
console.log(out);
if(args.includes('--zip')){
 const files={};const visit=async(directory,prefix='')=>{for(const entry of await fs.readdir(directory,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())await visit(path.join(directory,entry.name),relative+'/');else files[relative]=new Uint8Array(await fs.readFile(path.join(directory,entry.name)));}};await visit(out);
 await fs.writeFile(out+'.zip',zipSync(files,{level:6}));console.log(out+'.zip');
}

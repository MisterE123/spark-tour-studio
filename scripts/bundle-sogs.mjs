import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
import {unzipSync} from 'fflate';

// These editor-only tools are not copied by the visitor build/export manifest.
// Download exact immutable archives, verify before extraction, and bundle only
// the CPU library path. Native Dawn/WebGPU is neither required nor distributed.
const pins={
 node:{version:'24.21.0',url:'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip',algorithm:'sha256',hash:'158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'},
 transform:{version:'3.10.3',url:'https://registry.npmjs.org/@playcanvas/splat-transform/-/splat-transform-3.10.3.tgz',algorithm:'sha512',hash:'+jzoQtM1EHDwE2WKuEcaX9RGCGzk6VKnSAmOAiTB2TiNwB1kx2RhesXoSzrGvjKSKEPx6Pr/8kJhcl2WY70Ffg==',encoding:'base64'},
 playcanvas:{version:'2.23.3',url:'https://registry.npmjs.org/playcanvas/-/playcanvas-2.23.3.tgz',algorithm:'sha512',hash:'hjDdo5yFtVr/WmDh59pRrT1LC+Rfpq4VXB8Xt3AMB8GfWXj9JzOMq3x+3FTmq/2L2gN37q9V1LMZaLuYshzMXQ==',encoding:'base64'},
 webpLicense:{url:'https://raw.githubusercontent.com/webmproject/libwebp/v1.6.0/COPYING',algorithm:'sha256',hash:'5aec868f669e384a22372a4e8a1a6cd7d44c64cd451f960ca69cc170d1e13acf'},
 viewerLicense:{version:'1.39.0',url:'https://raw.githubusercontent.com/playcanvas/supersplat-viewer/v1.39.0/LICENSE',algorithm:'sha256',hash:'44716a2a1040df078772702d677d46f7d97f40c2375bf8221d4b3b741143f823'}
};
const cache=path.resolve('.build/sogs-tools'),out=path.resolve('sogs-tools'),notices=path.join(out,'licenses');
await fs.mkdir(cache,{recursive:true});await fs.mkdir(notices,{recursive:true});
async function archive(name,pin){const file=path.join(cache,name);let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}const valid=data=>createHash(pin.algorithm).update(data).digest(pin.encoding||'hex')===pin.hash;if(!bytes||!valid(bytes)){console.log('Bundling SOG tools: '+name);const response=await fetch(pin.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('SOG tool download failed: '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw Error('SOG tool checksum mismatch: '+name);await fs.writeFile(file,bytes);}return {file,bytes};}
const execute=promisify(execFile);
async function extract(name,pin){const {file}=await archive(name+'.tgz',pin),dir=path.join(cache,name+'-'+pin.version);await fs.mkdir(dir,{recursive:true});await execute('tar',['-xzf',file,'-C',dir],{windowsHide:true});return path.join(dir,'package');}
const transform=await extract('splat-transform',pins.transform),engine=await extract('playcanvas',pins.playcanvas),node=await archive('node-'+pins.node.version+'.zip',pins.node);
const nodeFiles=unzipSync(node.bytes,{filter:file=>/(?:^|\/)(?:node\.exe|LICENSE)$/.test(file.name)}),nodeEntry=Object.keys(nodeFiles).find(name=>name.endsWith('/node.exe')),nodeLicense=Object.keys(nodeFiles).find(name=>name.endsWith('/LICENSE'));
if(!nodeEntry||!nodeLicense)throw Error('Node archive lacks executable or full license.');await fs.writeFile(path.join(out,'node.exe'),nodeFiles[nodeEntry]);await fs.writeFile(path.join(notices,'Node.txt'),nodeFiles[nodeLicense]);
const enginePackage=JSON.parse(await fs.readFile(path.join(engine,'package.json'),'utf8'));
const bundled=await build({entryPoints:['scripts/sogs-tool.mjs'],outfile:path.join(out,'convert.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',minify:true,legalComments:'eof',metafile:true,plugins:[{name:'pinned-sogs-libraries',setup(build){build.onResolve({filter:/^@playcanvas\/splat-transform$/},()=>({path:path.join(transform,'dist/index.mjs')}));build.onResolve({filter:/^playcanvas$/},()=>({path:path.join(engine,enginePackage.module)}));}}]});
const external=Object.values(bundled.metafile.outputs).flatMap(output=>output.imports).filter(entry=>entry.external&&!entry.path.startsWith('node:')&&!['crypto','fs','path','os','util','module','process','stream'].includes(entry.path));if(external.length)throw Error('Unexpected external SOG tool dependency: '+external.map(x=>x.path).join(', '));
await fs.copyFile(path.join(transform,'dist/worker.mjs'),path.join(out,'worker.mjs'));await fs.copyFile(path.join(transform,'lib/webp.wasm'),path.join(out,'webp.wasm'));
await fs.copyFile(path.join(transform,'LICENSE'),path.join(notices,'PlayCanvas-splat-transform.txt'));await fs.copyFile(path.join(engine,'LICENSE'),path.join(notices,'PlayCanvas-engine.txt'));
const webp=await archive('libwebp-COPYING.txt',pins.webpLicense);await fs.writeFile(path.join(notices,'libwebp.txt'),webp.bytes);
const viewerLicense=await archive('SuperSplat-Viewer-LICENSE.txt',pins.viewerLicense);await fs.writeFile(path.join(notices,'PlayCanvas-SuperSplat-Viewer.txt'),viewerLicense.bytes);
await fs.writeFile(path.join(notices,'PROVENANCE.txt'),'PlayCanvas splat-transform 3.10.3 (MIT), CPU-only application wrapper.\nNode filesystem adapter adapted from src/cli/node-file-system.ts in that exact package source map; only imports are changed.\nPlayCanvas engine 2.23.3 (MIT) is compiled into the CPU tool; it does not create a graphics device.\nlibwebp WASM is copied unmodified from splat-transform 3.10.3; BSD license text from upstream libwebp.\nNode.js 24.21.0 Windows x64 is copied unmodified from the official Node release with its complete third-party notices.\nNo native WebGPU/Dawn package is distributed.\n');
const files=[];for(const name of ['node.exe','convert.mjs','worker.mjs','webp.wasm']){const bytes=await fs.readFile(path.join(out,name));files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.writeFile(path.join(out,'dependencies.json'),JSON.stringify({converter:'PlayCanvas splat-transform CPU library',version:pins.transform.version,pins,files},null,2));
console.log('Bundled offline CPU SOG converter, local worker and WebP WASM.');

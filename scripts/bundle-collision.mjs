import fs from 'node:fs/promises';import path from 'node:path';
const packages=['@playcanvas/splat-transform','webgpu','@adobe/spz','debug','ms','@webgpu/types'];
await fs.mkdir('collision-tools',{recursive:true});
await fs.copyFile(process.execPath,'collision-tools/node.exe');
if(process.version!=='v24.21.0')throw Error('Collision runtime is pinned to Node 24.21.0; update its license and tests before changing.');
await fs.access('collision-tools/Node-LICENSE.txt');
for(const name of packages){const from=path.resolve('node_modules',name),to=path.resolve('collision-tools/node_modules',name);await fs.cp(from,to,{recursive:true,filter:file=>{const rel=path.relative(from,file).replaceAll('\\','/');if(name==='webgpu'&&rel.startsWith('dist/')&&!/win32-x64|d3dcompiler_47\.dll/.test(rel))return false;return !/^(test|build|\.github)(\/|$)/.test(rel);}});}
await fs.writeFile('collision-tools/README.txt','Bundled @playcanvas/splat-transform 3.7.0. Package licenses are included in node_modules. Runs locally using the bundled Node 24.21.0 runtime. GPU required.\n');

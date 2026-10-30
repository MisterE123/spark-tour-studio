import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{FileMatcher,copyFiles}=require('app-builder-lib/out/fileMatcher.js');
const configuration=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).build;
const toolFiles={
 'node.exe':Buffer.from([0x4d,0x5a,0x00,0xff,0x23,0x31]),
 'convert.mjs':Buffer.from("export const converter = 'synthetic conversion entry';\n"),
 'worker.mjs':Buffer.from("export const worker = 'synthetic worker';\n"),
 'webp.wasm':Buffer.from([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00]),
 'dependencies.json':Buffer.from('{"version":"3.10.3","native":"webgpu@0.6.2"}\n'),
 'licenses/Node.txt':Buffer.from('Synthetic bundled Node notice\r\n'),
 'licenses/NodeWebGPU-Dawn.txt':Buffer.from('Synthetic complete Dawn BSD notice\r\n'),
 'licenses/DirectXShaderCompiler-LICENSE.txt':Buffer.from('Synthetic DXC license\r\n'),
 'licenses/DirectXShaderCompiler-ThirdPartyNotices.txt':Buffer.from('Synthetic DXC third-party notices\r\n'),
 'node_modules/webgpu/index.js':Buffer.from("export const create = () => 'synthetic native entry';\n"),
 'node_modules/webgpu/package.json':Buffer.from('{"name":"webgpu","version":"0.6.2","type":"module"}\n'),
 'node_modules/webgpu/LICENSE.md':Buffer.from('Synthetic Dawn & Tint BSD notice\r\n'),
 'node_modules/webgpu/dist/win32-x64/dawn.node':Buffer.from([0x4d,0x5a,0xff,0x00,0x44,0x41,0x57,0x4e]),
 'node_modules/webgpu/dist/win32-x64/d3dcompiler_47.dll':Buffer.from([0x4d,0x5a,0x00,0xfe,0x44,0x33,0x44]),
 'node_modules/webgpu/dist/win32-x64/dxcompiler.dll':Buffer.from([0x4d,0x5a,0xfd,0x00,0x44,0x58,0x43]),
 'node_modules/webgpu/dist/win32-x64/dxcompiler-LICENSE.TXT':Buffer.from('Synthetic original DLL-adjacent DXC license\r\n'),
 'node_modules/webgpu/dist/win32-x64/dxcompiler-ThirdPartyNotices.txt':Buffer.from('Synthetic original DLL-adjacent DXC notices\r\n')
};

async function fixture(run){
 const parent=path.resolve(os.tmpdir()),prefix='sogs packaging #100%20 東 ',root=await fs.mkdtemp(path.join(parent,prefix)),source=path.join(root,'source');
 try{
  for(const [relative,bytes]of Object.entries({...toolFiles,'not-shipped-input.ply':Buffer.from('Private authoring input must not enter the tool package.')})){
   const file=path.join(source,'sogs-tools',relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
  }
  await run({root,source});
 }finally{
  assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith(prefix));await fs.rm(root,{recursive:true,force:true});
 }
}

function matcher(source,destination,mapping){
 const from=path.resolve(source,mapping.from),to=path.resolve(destination,mapping.to);
 assert.ok(from.startsWith(source+path.sep));assert.ok(to.startsWith(destination+path.sep));
 return new FileMatcher(from,to,value=>value,mapping.filter);
}

test('Electron Builder root node_modules exclusion cannot be repaired by an inclusion glob',async()=>fixture(async({root,source})=>{
 const destination=path.join(root,'old resource layout');
 const oldMapping={from:'sogs-tools',to:'sogs-tools',filter:['node.exe','convert.mjs','worker.mjs','webp.wasm','dependencies.json','node_modules/webgpu/**/*','licenses/**/*']};
 // Exercise the installed copy implementation, including directory traversal.
 // Matching a descendant path alone misses its excluded node_modules parent.
 await copyFiles([matcher(source,destination,oldMapping)],undefined,false);
 assert.deepEqual(await fs.readFile(path.join(destination,'sogs-tools/convert.mjs')),toolFiles['convert.mjs']);
 assert.deepEqual(await fs.readFile(path.join(destination,'sogs-tools/licenses/NodeWebGPU-Dawn.txt')),toolFiles['licenses/NodeWebGPU-Dawn.txt']);
 for(const relative of Object.keys(toolFiles).filter(name=>name.startsWith('node_modules/')))await assert.rejects(fs.access(path.join(destination,'sogs-tools',relative)),error=>error.code==='ENOENT');
}));

test('actual Studio resource mappings copy every SOG native dependency and notice byte for byte',async()=>fixture(async({root,source})=>{
 const destination=path.join(root,'actual configured resources'),mappings=configuration.extraResources.filter(mapping=>typeof mapping==='object'&&mapping.to?.replaceAll('\\','/').split('/')[0]==='sogs-tools');
 assert.ok(mappings.length,'Studio config includes its conversion tools');
 await copyFiles(mappings.map(mapping=>matcher(source,destination,mapping)),undefined,false);
 for(const [relative,bytes]of Object.entries(toolFiles)){
  const file=path.join(destination,'sogs-tools',relative);
  assert.deepEqual(await fs.readFile(file),bytes,'Actual package resource copy retains '+relative);
  assert.deepEqual(await fs.readFile(path.join(source,'sogs-tools',relative)),bytes,'Copy leaves source bytes unchanged: '+relative);
 }
 await assert.rejects(fs.access(path.join(destination,'sogs-tools/not-shipped-input.ply')),error=>error.code==='ENOENT');
}));

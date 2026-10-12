import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';

// The engine is an editor resource. It is deliberately outside the visitor's
// build manifest, so exporting a website does not copy Python or meshing tools.
const root='node_modules/pyodide',pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(await fs.readFile(path.join(root,'pyodide-lock.json'),'utf8'));
const out='dist/editor-engine',cache='.build/meshing/'+pkg.version;
await fs.mkdir(out,{recursive:true});await fs.mkdir(cache,{recursive:true});await fs.mkdir(path.join(out,'licenses'),{recursive:true});
for(const name of ['pyodide.mjs','pyodide.asm.mjs','pyodide.asm.wasm','python_stdlib.zip'])await fs.copyFile(path.join(root,name),path.join(out,name));
const packages={};
function visit(name){name=name.toLowerCase().replaceAll('_','-');if(packages[name])return;const entry=lock.packages[name];if(!entry)throw Error('Missing meshing dependency: '+name);packages[name]=entry;for(const dep of entry.depends)visit(dep);}
visit('scikit-image');visit('scipy');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inventory=[];
for(const [name,entry] of Object.entries(packages)){
 const file=path.join(cache,entry.file_name);let bytes;
 try{bytes=await fs.readFile(file);if(hash(bytes)!==entry.sha256)bytes=undefined;}catch{}
 if(!bytes){console.log('Bundling local mesh engine: '+name+' '+entry.version);const response=await fetch('https://cdn.jsdelivr.net/pyodide/v'+pkg.version+'/full/'+entry.file_name,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Meshing dependency download failed: '+response.status+' '+name);bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==entry.sha256)throw Error('Meshing dependency checksum failed: '+name);await fs.writeFile(file,bytes);}
 await fs.copyFile(file,path.join(out,entry.file_name));
 const archive=unzipSync(bytes,{filter:file=>/(?:licen[sc]e|copying|notice|copyright)/i.test(file.name)&&!file.name.endsWith('/')});
 let notices='';for(const [filename,data] of Object.entries(archive)){if(data.length>2000000)throw Error('Unexpectedly large license: '+filename);notices+='\n\n--- '+filename+' ---\n'+strFromU8(data);}
 if(!notices)throw Error('No license notice in meshing package: '+name);
 await fs.writeFile(path.join(out,'licenses',name+'.txt'),name+' '+entry.version+notices);
 inventory.push({name,version:entry.version,file:entry.file_name,sha256:entry.sha256,bytes:bytes.length});
}
// Preserve the original pinned lock metadata and only the bundled dependency
// closure. loadPackage will never need a package from a remote index.
await fs.writeFile(path.join(out,'pyodide-lock.json'),JSON.stringify({...lock,packages}));
const licenseFile=path.join(cache,'Pyodide-LICENSE.txt');let license;
try{license=await fs.readFile(licenseFile,'utf8');}catch{const r=await fetch('https://raw.githubusercontent.com/pyodide/pyodide/'+pkg.version+'/LICENSE',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Pyodide license download failed: '+r.status);license=await r.text();if(!license.includes('Mozilla Public License'))throw Error('Unexpected Pyodide license');await fs.writeFile(licenseFile,license);}
await fs.writeFile(path.join(out,'licenses','Pyodide.txt'),`Pyodide ${pkg.version}\nMPL-2.0\nSource: https://github.com/pyodide/pyodide/tree/${pkg.version}\nUnmodified distributed runtime.\n\n${license}`);
const pythonFile=path.join(cache,'Python-LICENSE.txt');let pythonLicense;
try{pythonLicense=await fs.readFile(pythonFile,'utf8');}catch{const r=await fetch('https://raw.githubusercontent.com/python/cpython/v'+lock.info.python+'/LICENSE',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Python license download failed: '+r.status);pythonLicense=await r.text();if(!pythonLicense.includes('PYTHON SOFTWARE FOUNDATION'))throw Error('Unexpected Python license');await fs.writeFile(pythonFile,pythonLicense);}
await fs.writeFile(path.join(out,'licenses','Python.txt'),'Python '+lock.info.python+'\n\n'+pythonLicense);
await fs.writeFile(path.join(out,'dependencies.json'),JSON.stringify({engine:'Pyodide',version:pkg.version,packages:inventory},null,2));
console.log('Local mesh engine ready: '+inventory.length+' packages.');

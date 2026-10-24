import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
const [mode,target,version]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version||''))throw Error('Invalid release version.');
// Old tested artifacts remain recoverable without renaming their contents.
const layouts=[{product:'3DGS Perspectives Studio',editor:'3DGS-Perspectives-Studio',runtime:'3DGS-Perspectives-Web-Runtime'},{product:'Spark Tour Studio',editor:'Spark-Tour-Studio',runtime:'Spark-Tour-Web-Runtime'}];
const binariesFor=layout=>[`${layout.editor}-${version}.exe`,'Launch-Tour.exe',`${layout.runtime}-${version}.zip`];
function layoutFor(entries){const layout=layouts.find(layout=>binariesFor(layout).every(name=>Object.hasOwn(entries,name)));if(!layout)throw Error('Missing release file: expected a complete current or legacy editor, launcher and web runtime set.');return layout;}
function verify(entries){
 const layout=layoutFor(entries),binaries=binariesFor(layout),names=[...binaries,'LICENSE','THIRD_PARTY.md','SHA256SUMS.txt'];
 for(const name of names)if(!entries[name])throw Error('Missing release file: '+name);
 if(Object.keys(entries).some(name=>!names.includes(name)&&name!=='README.txt'))throw Error('Unexpected release ZIP entry.');
 const lines=strFromU8(entries['SHA256SUMS.txt']).trim().split(/\r?\n/),seen=new Set();
 if(lines.length!==binaries.length)throw Error('Invalid checksum manifest.');
 for(const line of lines){const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match||!binaries.includes(match[2])||seen.has(match[2]))throw Error('Invalid checksum entry.');seen.add(match[2]);if(createHash('sha256').update(entries[match[2]]).digest('hex')!==match[1])throw Error('Checksum mismatch: '+match[2]);}
 return layout;
}
if(mode==='pack'){
 const existing=Object.fromEntries((await fs.readdir(target)).map(name=>[name,true])),layout=layoutFor(existing),binaries=binariesFor(layout),names=[...binaries,'LICENSE','THIRD_PARTY.md','SHA256SUMS.txt'];
 const entries={};for(const name of names)entries[name]=new Uint8Array(await fs.readFile(path.join(target,name)));verify(entries);
 entries['README.txt']=strToU8(`${layout.product} ${version} - Windows x64\n\nExtract this ZIP before running the software.\n\nEditor: run ${binaries[0]}. No Node.js installation is needed.\nTour launcher: Launch-Tour.exe serves an existing exported tour; place it in the tour folder.\nWeb runtime: ${binaries[2]} is a developer template, not an authored tour. Use the editor to export a tour with your scenes.\nLicenses and checksums are included.\n`);
 // The portable editor is already compressed. Store files to avoid repacking it.
 const output=path.join(target,`${layout.editor}-${version}-windows-x64.zip`);await fs.writeFile(output,zipSync(entries,{level:0}));console.log('Created '+output);
}else if(mode==='verify'){verify(unzipSync(new Uint8Array(await fs.readFile(target))));console.log('Verified release ZIP contents and checksums.');}
else throw Error('Use pack <folder> <version> or verify <zip> <version>.');

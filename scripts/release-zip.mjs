import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
const [mode,target,version]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version||''))throw Error('Invalid release version.');
const binaries=[`Spark-Tour-Studio-${version}.exe`,'Launch-Tour.exe',`Spark-Tour-Web-Runtime-${version}.zip`];
const names=[...binaries,'LICENSE','THIRD_PARTY.md','SHA256SUMS.txt'];
function verify(entries){
 for(const name of names)if(!entries[name])throw Error('Missing release file: '+name);
 if(Object.keys(entries).some(name=>!names.includes(name)&&name!=='README.txt'))throw Error('Unexpected release ZIP entry.');
 const lines=strFromU8(entries['SHA256SUMS.txt']).trim().split(/\r?\n/),seen=new Set();
 if(lines.length!==binaries.length)throw Error('Invalid checksum manifest.');
 for(const line of lines){const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match||!binaries.includes(match[2])||seen.has(match[2]))throw Error('Invalid checksum entry.');seen.add(match[2]);if(createHash('sha256').update(entries[match[2]]).digest('hex')!==match[1])throw Error('Checksum mismatch: '+match[2]);}
}
if(mode==='pack'){
 const entries={};for(const name of names)entries[name]=new Uint8Array(await fs.readFile(path.join(target,name)));verify(entries);
 entries['README.txt']=strToU8(`Spark Tour Studio ${version} - Windows x64\n\nExtract this ZIP before running the software.\n\nEditor: run Spark-Tour-Studio-${version}.exe. No Node.js installation is needed.\nTour launcher: Launch-Tour.exe serves an existing exported tour; place it in the tour folder.\nWeb runtime: Spark-Tour-Web-Runtime-${version}.zip is a developer template, not an authored tour. Use the editor to export a tour with your scenes.\nLicenses and checksums are included.\n`);
 // The portable editor is already compressed. Store files to avoid repacking it.
 const output=path.join(target,`Spark-Tour-Studio-${version}-windows-x64.zip`);await fs.writeFile(output,zipSync(entries,{level:0}));console.log('Created '+output);
}else if(mode==='verify'){verify(unzipSync(new Uint8Array(await fs.readFile(target))));console.log('Verified release ZIP contents and checksums.');}
else throw Error('Use pack <folder> <version> or verify <zip> <version>.');

import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {zipSync} from 'fflate';
if(process.platform!=='win32')throw Error('Build release archives on Windows.');
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))throw Error('Invalid package version.');
await fs.mkdir('artifacts',{recursive:true});
await fs.copyFile(`release/Spark Tour Studio ${version}.exe`,`artifacts/Spark-Tour-Studio-${version}.exe`);
await fs.copyFile('launcher/Launch Tour.exe','artifacts/Launch-Tour.exe');
// The runtime archive is the editor's bundled site template, not an authored tour.
const archive=path.resolve(`artifacts/Spark-Tour-Web-Runtime-${version}.zip`);
const entries={};
async function collect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await collect(file);else if(item.isFile())entries[path.relative('dist',file).replaceAll('\\','/')]=new Uint8Array(await fs.readFile(file));}}
await collect('dist');await fs.writeFile(archive,zipSync(entries,{level:6}));
const names=[`Spark-Tour-Studio-${version}.exe`,'Launch-Tour.exe',path.basename(archive)];
let checksums='';for(const name of names){const bytes=await fs.readFile(path.join('artifacts',name));checksums+=createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n';}
await fs.writeFile('artifacts/SHA256SUMS.txt',checksums);
await fs.copyFile('LICENSE','artifacts/LICENSE');await fs.copyFile('THIRD_PARTY.md','artifacts/THIRD_PARTY.md');
console.log('Prepared Windows editor, launcher, web runtime and SHA-256 checksums.');

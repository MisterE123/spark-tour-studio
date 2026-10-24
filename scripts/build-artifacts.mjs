import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {zipSync} from 'fflate';
import {execFileSync} from 'node:child_process';
if(process.platform!=='win32')throw Error('Build release archives on Windows.');
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))throw Error('Invalid package version.');
await fs.mkdir('artifacts',{recursive:true});
await fs.copyFile(`release/3DGS Perspectives Studio ${version}.exe`,`artifacts/3DGS-Perspectives-Studio-${version}.exe`);
await fs.copyFile('launcher/Launch Tour.exe','artifacts/Launch-Tour.exe');
// The runtime archive is the editor's bundled site template, not an authored tour.
const archive=path.resolve(`artifacts/3DGS-Perspectives-Web-Runtime-${version}.zip`);
const entries={};
async function collect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await collect(file);else if(item.isFile())entries[path.relative('dist',file).replaceAll('\\','/')]=new Uint8Array(await fs.readFile(file));}}
const manifest=JSON.parse(await fs.readFile('dist/.vite/manifest.json','utf8')),seen=new Set(),visitorFiles=new Set(['index.html']);
function visit(key){if(seen.has(key))return;seen.add(key);const entry=manifest[key];if(!entry)throw Error('Missing viewer build entry: '+key);for(const file of [entry.file,...entry.css||[],...entry.assets||[]])visitorFiles.add(file);for(const dependency of [...entry.imports||[],...entry.dynamicImports||[]])visit(dependency);}
visit('index.html');for(const file of visitorFiles)entries[file]=new Uint8Array(await fs.readFile(path.join('dist',file)));await collect('dist/licenses');await collect('dist/performance-spec');await fs.writeFile(archive,zipSync(entries,{level:6}));
const names=[`3DGS-Perspectives-Studio-${version}.exe`,'Launch-Tour.exe',path.basename(archive)];
let checksums='';for(const name of names){const bytes=await fs.readFile(path.join('artifacts',name));checksums+=createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n';}
await fs.writeFile('artifacts/SHA256SUMS.txt',checksums);
await fs.copyFile('LICENSE','artifacts/LICENSE');await fs.copyFile('THIRD_PARTY.md','artifacts/THIRD_PARTY.md');
execFileSync(process.execPath,['scripts/release-zip.mjs','pack','artifacts',version],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/release-zip.mjs','verify',`artifacts/3DGS-Perspectives-Studio-${version}-windows-x64.zip`,version],{stdio:'inherit'});
console.log('Prepared Windows editor, launcher, web runtime and SHA-256 checksums.');

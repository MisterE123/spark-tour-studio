import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const tag='v2.3.1', expected='dd7e1f052c6259940e3ef11426b9b234928be180a1be85170121530287cb51f0';
const root=path.resolve('.build'), archive=path.join(root,'spark-v2.3.1.tar.gz'), source=path.join(root,'spark-2.3.1');
await fs.mkdir(root,{recursive:true});
if(!existsSync(archive)){const r=await fetch(`https://github.com/sparkjsdev/spark/archive/refs/tags/${tag}.tar.gz`);if(!r.ok)throw Error('Spark source download failed: '+r.status);await fs.writeFile(archive,Buffer.from(await r.arrayBuffer()));}
if(createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==expected)throw Error('Spark source archive checksum mismatch.');
if(!existsSync(path.join(source,'rust/Cargo.toml')))execFileSync('tar',['-xzf',archive,'-C',root,'spark-2.3.1/rust','spark-2.3.1/LICENSE']);
const cargoHome=process.env.CARGO_HOME||path.join(root,'cargo'),rustupHome=process.env.RUSTUP_HOME||path.join(root,'rustup');
const cargo=path.join(cargoHome,'bin/cargo.exe'),rustc=path.join(cargoHome,'bin/rustc.exe');
const env={...process.env,CARGO_HOME:cargoHome,RUSTUP_HOME:rustupHome,PATH:path.join(cargoHome,'bin')+';'+process.env.PATH};
const rustVersion=execFileSync(rustc,['--version'],{env,encoding:'utf8'}).trim();if(!rustVersion.startsWith('rustc 1.98.1 '))throw Error('Use Rust 1.98.1 for this pinned converter build.');
execFileSync(cargo,['build','--manifest-path',path.join(source,'rust/build-lod/Cargo.toml'),'--release','--locked','--no-default-features'],{env,stdio:'inherit'});
await fs.mkdir('converter',{recursive:true});const binary=await fs.readFile(path.join(source,'rust/target/release/build-lod.exe'));await fs.writeFile('converter/build-lod.exe',binary);await fs.copyFile(path.join(source,'LICENSE'),'converter/LICENSE-Spark.txt');
let notices='Spark build-lod: Rust crate license texts distributed with the build.\n';const registry=path.join(cargoHome,'registry/src');
for(const index of await fs.readdir(registry)){for(const crate of await fs.readdir(path.join(registry,index))){const dir=path.join(registry,index,crate);const entries=await fs.readdir(dir);const licenses=entries.filter(n=>/^(license|licence|copying|notice|copyright)/i.test(n));for(const file of licenses){if((await fs.stat(path.join(dir,file))).isFile())notices+=`\n\n=== ${crate}: ${file} ===\n`+await fs.readFile(path.join(dir,file),'utf8');}}}
await fs.writeFile('converter/THIRD-PARTY.txt',notices);
const sysroot=execFileSync(rustc,['--print','sysroot'],{env,encoding:'utf8'}).trim();await fs.copyFile(path.join(sysroot,'share/doc/rust/COPYRIGHT-library.html'),'converter/RUST-LIBRARY-NOTICES.txt');
await fs.writeFile('converter/build-info.json',JSON.stringify({spark:tag,sourceArchiveSha256:expected,rust:rustVersion,features:'CPU, no default build-lod GPU features',sha256:createHash('sha256').update(binary).digest('hex')},null,2));
console.log('Built bundled converter: '+binary.length+' bytes');

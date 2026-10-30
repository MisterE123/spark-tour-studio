import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';
import {Zip,ZipPassThrough} from 'fflate';

export function deliveryMetadata(value){
 if(!value?.experimental||value.dirty!==false||value.branch!=='Experiemental-Radix-SOGS'||!/^[a-f0-9]{40}$/.test(value.commit||'')||value.shortCommit!==value.commit.slice(0,8)||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version||''))throw Error('Only a clean identified Radix experimental build can be published.');
 if(value.artifactName!==`3DGS Perspectives Studio ${value.version} Experimental ${value.shortCommit}.exe`)throw Error('Invalid experimental artifact name.');
 return value;
}

export function relativeFile(name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||name.includes(':')||path.posix.isAbsolute(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe experimental artifact path: '+name);
 return name;
}

export const deliveryName=metadata=>`3DGS-Perspectives-Studio-${deliveryMetadata(metadata).version}-Radix-SOGS-Experimental-${metadata.shortCommit}-windows-x64.zip`;
export const runtimeName=metadata=>`Radix-SOGS-Web-Runtime-${deliveryMetadata(metadata).shortCommit}.zip`;
export const converterNotices=['Node.txt','PlayCanvas-splat-transform.txt','PlayCanvas-engine.txt','PlayCanvas-SuperSplat-Viewer.txt','libwebp.txt','PROVENANCE.txt'];

export async function digestFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

export async function checksumFiles(root,names){
 const lines=[];for(const name of [...names].sort())lines.push(await digestFile(path.join(root,relativeFile(name)))+'  '+name);
 return lines.join('\n')+'\n';
}

// The editor and nested runtime ZIP are already compressed. Store the outer
// bundle, streaming each file, instead of retaining another entire EXE in RAM.
export async function writeDeliveryZip(destination,root,names){
 const writer=createWriteStream(destination,{flags:'wx'}),completion=finished(writer);void completion.catch(()=>{});
 let outputError,needsDrain=false;
 writer.on('error',error=>{outputError=error;});
 const zip=new Zip((error,data,final)=>{if(error){outputError=error;writer.destroy(error);return;}if(!writer.write(data))needsDrain=true;if(final)writer.end();});
 const drain=async()=>{if(outputError)throw outputError;if(needsDrain){needsDrain=false;await once(writer,'drain');}if(outputError)throw outputError;};
 try{
  for(const name of names){const entry=new ZipPassThrough(relativeFile(name));zip.add(entry);await drain();for await(const data of createReadStream(path.join(root,name))){entry.push(data);await drain();}entry.push(new Uint8Array(),true);await drain();}
  zip.end();await completion;
 }catch(error){zip.terminate();writer.destroy();await completion.catch(()=>{});await fs.rm(destination,{force:true});throw error;}
}

function checksumEntries(text,names){
 const expected=new Map(),payload=new Set(names.filter(name=>name!=='SHA256SUMS.txt'));
 for(const line of text.trim().split(/\r?\n/)){const match=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!match||!payload.has(match[2])||expected.has(match[2]))throw Error('Invalid experimental checksum manifest.');expected.set(match[2],match[1]);}
 if(expected.size!==payload.size)throw Error('Incomplete experimental checksum manifest.');return expected;
}

const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let bit=0;bit<8;bit++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
const crcChunk=(state,bytes)=>{for(const byte of bytes)state=crcTable[(state^byte)&255]^(state>>>8);return state>>>0;};

async function deliveryDirectory(file){
 // Read the authoritative central-directory sizes before streaming stored
 // payloads. A portable EXE and the nested runtime ZIP contain ZIP signatures;
 // scanning unknown-length stored streams for PK markers would misread those.
 const handle=await fs.open(file,'r');
 const read=async(size,offset)=>{const bytes=Buffer.alloc(size),result=await handle.read(bytes,0,size,offset);if(result.bytesRead!==size)throw Error('Incomplete experimental ZIP.');return bytes;};
 try{
  const stat=await handle.stat();if(stat.size<22)throw Error('Incomplete experimental ZIP.');const tail=await read(22,stat.size-22),count=tail.readUInt16LE(10),length=tail.readUInt32LE(12),offset=tail.readUInt32LE(16);
  if(tail.readUInt32LE(0)!==0x06054b50||tail.readUInt16LE(4)!==0||tail.readUInt16LE(6)!==0||tail.readUInt16LE(8)!==count||tail.readUInt16LE(20)!==0||length+offset!==stat.size-22||count>10000||length>16*1024*1024)throw Error('Incomplete experimental ZIP end record.');
  const central=await read(length,offset),entries=[],names=new Set();let cursor=0;
  for(let i=0;i<count;i++){
   if(cursor+46>central.length||central.readUInt32LE(cursor)!==0x02014b50)throw Error('Incomplete experimental ZIP directory.');
   const flags=central.readUInt16LE(cursor+8),method=central.readUInt16LE(cursor+10),crc=central.readUInt32LE(cursor+16),size=central.readUInt32LE(cursor+20),rawSize=central.readUInt32LE(cursor+24),nameLength=central.readUInt16LE(cursor+28),extraLength=central.readUInt16LE(cursor+30),commentLength=central.readUInt16LE(cursor+32),disk=central.readUInt16LE(cursor+34),attributes=central.readUInt32LE(cursor+38),localOffset=central.readUInt32LE(cursor+42),end=cursor+46+nameLength+extraLength+commentLength;
   if(end>central.length||method!==0||size!==rawSize||flags&1||disk!==0||(attributes>>>16&0xf000)===0xa000)throw Error('Invalid stored experimental ZIP entry.');
   const nameBytes=central.subarray(cursor+46,cursor+46+nameLength),name=relativeFile(new TextDecoder('utf-8',{fatal:true}).decode(nameBytes));if(names.has(name))throw Error('Duplicate experimental ZIP entry: '+name);names.add(name);
   const local=await read(30,localOffset),localNameLength=local.readUInt16LE(26),localExtraLength=local.readUInt16LE(28),start=localOffset+30+localNameLength+localExtraLength;
   if(local.readUInt32LE(0)!==0x04034b50||local.readUInt16LE(6)!==flags||local.readUInt16LE(8)!==method||localNameLength!==nameLength||!(await read(localNameLength,localOffset+30)).equals(nameBytes)||start+size>offset)throw Error('Invalid experimental ZIP local entry.');
   let entryEnd=start+size;
   if(flags&8){const descriptor=await read(16,entryEnd);if(descriptor.readUInt32LE(0)!==0x08074b50||descriptor.readUInt32LE(4)!==crc||descriptor.readUInt32LE(8)!==size||descriptor.readUInt32LE(12)!==size)throw Error('Invalid experimental ZIP data descriptor.');entryEnd+=16;}
   else if(local.readUInt32LE(14)!==crc||local.readUInt32LE(18)!==size||local.readUInt32LE(22)!==size)throw Error('Invalid experimental ZIP local sizes.');
   if(entryEnd>offset)throw Error('Incomplete experimental ZIP data.');entries.push({name,start,size,crc,localOffset,end:entryEnd});cursor=end;
  }
  if(cursor!==central.length)throw Error('Unexpected experimental ZIP directory bytes.');
  let end=0;for(const entry of [...entries].sort((a,b)=>a.localOffset-b.localOffset)){if(entry.localOffset!==end)throw Error('Overlapping or unexpected experimental ZIP bytes.');end=entry.end;}if(end!==offset)throw Error('Incomplete experimental ZIP payload.');
  return entries;
 }finally{await handle.close();}
}

export async function verifyDeliveryZip(file,{expectedHashes}={}){
 const directory=await deliveryDirectory(file),entries=new Map(),texts=new Map(),capture=new Set(['studio-build.json','SHA256SUMS.txt','README.txt','licenses/Radix-LICENSE.txt','licenses/Radix-PROVENANCE.json']);
 for(const entry of directory){
  const {name,start,size}=entry;if(!size)throw Error('Empty experimental ZIP entry: '+name);if(expectedHashes&&!Object.hasOwn(expectedHashes,name))throw Error('Unexpected experimental ZIP entry: '+name);
  const hash=createHash('sha256'),chunks=[];let crc=0xffffffff,read=0;
  for await(const data of createReadStream(file,{start,end:start+size-1})){hash.update(data);crc=crcChunk(crc,data);read+=data.length;if(capture.has(name)){if(read>1024*1024)throw Error('Oversized experimental metadata: '+name);chunks.push(Buffer.from(data));}}
  if(read!==size||((crc^0xffffffff)>>>0)!==entry.crc)throw Error('Experimental ZIP CRC mismatch: '+name);entries.set(name,hash.digest('hex'));if(capture.has(name))texts.set(name,Buffer.concat(chunks).toString('utf8'));
 }
 let metadata;try{metadata=deliveryMetadata(JSON.parse(texts.get('studio-build.json')||''));}catch(error){throw Error('Invalid experimental ZIP metadata: '+error.message);}
 const required=[metadata.artifactName,'Launch-Tour-Experimental.exe',runtimeName(metadata),'LICENSE','THIRD_PARTY.md','RADIX_EXPERIMENT.md','studio-build.json','README.txt','RELEASE_NOTES.md','SHA256SUMS.txt','licenses/Radix-LICENSE.txt','licenses/Radix-PROVENANCE.json','licenses/Radix-SOGS-ADAPTER.md',...converterNotices.map(name=>'sogs-tools-licenses/'+name)];
 for(const name of required)if(!entries.has(name))throw Error('Missing experimental ZIP entry: '+name);
 const manifest=checksumEntries(texts.get('SHA256SUMS.txt')||'',[...entries.keys()]);for(const [name,hash]of manifest)if(entries.get(name)!==hash)throw Error('Experimental checksum mismatch: '+name);
 if(expectedHashes){if(Object.keys(expectedHashes).length!==entries.size)throw Error('Incomplete experimental ZIP contents.');for(const [name,hash]of Object.entries(expectedHashes))if(entries.get(name)!==hash)throw Error('Experimental source checksum mismatch: '+name);}
 const license=texts.get('licenses/Radix-LICENSE.txt')||'';if(!license.includes('WORLD LABS TECHNOLOGIES, INC.')||!license.includes('Permission is hereby granted, free of charge')||!license.includes('THE SOFTWARE IS PROVIDED "AS IS"'))throw Error('Full World Labs MIT license missing from experimental ZIP.');
 try{const provenance=JSON.parse(texts.get('licenses/Radix-PROVENANCE.json')||'');if(!provenance||typeof provenance!=='object'||!Object.keys(provenance).length)throw Error();}catch{throw Error('Invalid Radix provenance in experimental ZIP.');}
 const readme=texts.get('README.txt')||'';if(!readme.includes(metadata.artifactName)||!readme.includes('Launch-Tour-Experimental.exe')||!readme.includes(runtimeName(metadata)))throw Error('Incomplete experimental ZIP instructions.');
 return {metadata,entries:[...entries.keys()].sort(),sha256:await digestFile(file)};
}

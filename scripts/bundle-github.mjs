import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {unzipSync} from 'fflate';
const pin=JSON.parse(await fs.readFile('github-tools/tool.json','utf8')),cache=path.resolve('.build/github-cli/archive.zip');
let archive;try{archive=await fs.readFile(cache);}catch(error){if(error.code!=='ENOENT')throw error;}
const hash=value=>createHash('sha256').update(value).digest('hex');
if(!archive||hash(archive)!==pin.sha256){const response=await fetch(pin.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('GitHub CLI download failed: '+response.status);archive=Buffer.from(await response.arrayBuffer());if(hash(archive)!==pin.sha256)throw Error('GitHub CLI archive checksum mismatch.');await fs.mkdir(path.dirname(cache),{recursive:true});await fs.writeFile(cache,archive);}
const files=unzipSync(archive),exe=Object.keys(files).find(name=>/(?:^|\/)bin\/gh\.exe$/.test(name)),license=Object.keys(files).find(name=>/(?:^|\/)LICENSE$/.test(name));
if(!exe||!license)throw Error('GitHub CLI archive is missing its executable or license.');
await fs.mkdir('github-tools',{recursive:true});await fs.writeFile('github-tools/gh.exe',files[exe]);await fs.writeFile('github-tools/LICENSE.txt',files[license]);
console.log('Bundled checksum-verified GitHub CLI '+pin.version+'.');

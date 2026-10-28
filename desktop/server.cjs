const {readTourBranding,launcherHead,launcherIdentity,launcherFooter}=require('./branding.cjs');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {createGzip}=require('node:zlib');const {pipeline}=require('node:stream');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.pdf':'application/pdf','.svg':'image/svg+xml','.mp4':'video/mp4','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.aac':'audio/aac','.flac':'audio/flac','.webm':'video/webm','.woff2':'font/woff2'};
function contained(root,file){const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function privateStateFile(file){const parts=file.replaceAll('\\','/').split('/').map(p=>p.replace(/[. ]+$/,'').toLowerCase()),name=parts.at(-1);return parts.some(part=>/^\.[a-f0-9-]+\.staging$/.test(part)||part==='.spool')||parts.includes('.git')||parts.includes('.spark-viewer-backups')||parts.includes('.spark-tour-diagnostics')||['autosave.json','autosave.json.tmp','.sources.json','.sources.json.tmp','.spark-tour-history.json','.spark-tour-history.json.tmp','.spark-tour-publish.json','.spark-tour-publish.json.tmp'].includes(name);}
function rangeFor(header,size){if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2]))throw Error('range');let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));let end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size||start<0)throw Error('range');return {start,end};}
const compressibleExtensions=new Set(['.html','.htm','.js','.mjs','.css','.json','.svg','.txt']);
function acceptsGzip(header){
 if(!header)return false;const weights=new Map();
 for(const part of String(header).split(',')){const [name,...params]=part.trim().split(';');let quality=1;for(const param of params)if(/^\s*q\s*=/i.test(param)){const value=param.split('=')[1]?.trim()||'';quality=/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)?Number(value):0;}weights.set(name.trim().toLowerCase(),quality);}
 const quality=weights.get('gzip')??weights.get('*')??0;return quality>0&&(!weights.has('identity')||quality>=weights.get('identity'));
}
function notModified(req,etag,mtime){
 const match=req.headers['if-none-match'];
 if(match!==undefined)return String(match).split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
 const since=Date.parse(req.headers['if-modified-since']);return Number.isFinite(since)&&Math.floor(mtime/1000)*1000<=since;
}
async function fileResponse(req,res,root,relative){
 try{if(relative.includes('\0')||relative.includes('\\'))throw Error('path');if(privateStateFile(relative)){res.writeHead(403).end();return;}const file=path.resolve(root,relative||'index.html');if(!contained(path.resolve(root),file)){res.writeHead(403).end();return;}const real=await fs.promises.realpath(file);if(privateStateFile(real)||!contained(await fs.promises.realpath(root),real)){res.writeHead(403).end();return;}const stat=await fs.promises.stat(real);if(!stat.isFile()){res.writeHead(404).end();return;}
  const extension=path.extname(real).toLowerCase(),canCompress=stat.size>=1024&&compressibleExtensions.has(extension),identity=crypto.createHash('sha256').update(real).digest('hex').slice(0,16),etag=`W/"${identity}-${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs*1000).toString(16)}"`;
  const headers={'Content-Type':types[extension]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',ETag:etag,'Last-Modified':stat.mtime.toUTCString()};if(canCompress)headers.Vary='Accept-Encoding';
  if(notModified(req,etag,stat.mtimeMs)){res.writeHead(304,headers).end();return;}
  let range;try{range=rangeFor(req.headers.range,stat.size);}catch{res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
  // Byte ranges always refer to original file offsets. RAD/RADC, collision data
  // and already compressed media never enter the text compression pipeline.
  const gzip=!range&&canCompress&&acceptsGzip(req.headers['accept-encoding']);
  if(range){headers['Content-Range']=`bytes ${range.start}-${range.end}/${stat.size}`;headers['Content-Length']=range.end-range.start+1;}else if(!gzip)headers['Content-Length']=stat.size;
  if(gzip)headers['Content-Encoding']='gzip';res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}
  const stream=fs.createReadStream(real,range||{});if(gzip)pipeline(stream,createGzip({level:6}),res,()=>{});else pipeline(stream,res,()=>{});
 }catch{if(!res.headersSent)res.writeHead(404).end('File not found');else res.destroy();}
}
function startServer({root,resolve,control,shutdown=false,onShutdown=()=>{}}){return new Promise((ok,fail)=>{const token=crypto.randomBytes(24).toString('hex');const server=http.createServer(async(req,res)=>{
 const local=`127.0.0.1:${server.address().port}`;if(req.headers.host!==local&&req.headers.host!==`localhost:${server.address().port}`){res.writeHead(403).end();return;}
 let name;try{name=decodeURIComponent(new URL(req.url,`http://${local}`).pathname).slice(1);}catch{res.writeHead(400).end();return;}
 if(control){try{if(await control({name,req,res,token}))return;}catch{res.writeHead(500).end('Launcher control failed.');return;}}
 if(shutdown&&name==='__launcher'){const branding=await readTourBranding(root);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(`<html>${launcherHead(branding)}<body style="font:20px system-ui;padding:50px;background:#11232b;color:white">${launcherIdentity(branding)}<p>Keep this launcher running while viewing.</p><p><a style="color:#a8f5dc" target="_blank" href="/">Open tour</a></p><form method="post" action="/__shutdown"><input type="hidden" name="token" value="${token}"><button>Stop tour server</button></form>${launcherFooter(branding)}</body></html>`);return;}
 if(shutdown&&name==='__shutdown'&&req.method==='POST'){let body='';req.on('data',c=>{body+=c;if(body.length>512)req.destroy();});req.on('end',()=>{if(body!==`token=${token}`){res.writeHead(403).end();return;}res.end('Tour stopped. You can close this tab.');server.close();setTimeout(onShutdown,100);});return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const target=resolve?.(name);if(target===false){res.writeHead(404).end();return;}await fileResponse(req,res,target?.root||root,target?.relative??name);
 });server.on('error',fail);server.listen(0,'127.0.0.1',()=>ok({server,url:`http://127.0.0.1:${server.address().port}/`}));});}
module.exports={contained,privateStateFile,rangeFor,fileResponse,startServer};

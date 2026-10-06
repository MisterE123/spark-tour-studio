const path=require('node:path');const {spawn}=require('node:child_process');const {startServer}=require('../desktop/server.cjs');const sea=require('node:sea');
const root=sea.isSea()?path.dirname(process.execPath):path.resolve(process.argv[2]||'.');
const {createSharingControl}=require('./sharing.cjs');
startServer({root,shutdown:true,control:createSharingControl(root),onShutdown:()=>process.exit(0)}).then(({url})=>{console.log('Spark Tour is running at '+url+'\nOpen '+url+'__launcher to share on Wi-Fi or stop the tour.');const open=u=>spawn('rundll32.exe',['url.dll,FileProtocolHandler',u],{windowsHide:true,stdio:'ignore'}).unref();if(!process.argv.includes('--no-open')){open(url);open(url+'__launcher');}}).catch(e=>{console.error('Unable to launch tour:',e.message);process.exitCode=1;});

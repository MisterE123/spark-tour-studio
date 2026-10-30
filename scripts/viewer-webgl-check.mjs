import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,expect} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';

const output=path.resolve('test-output','viewer webgl '+Date.now());await fs.mkdir(output,{recursive:true});
const project=blankProject();project.title='Museum tour';project.description='Explore the collection.';project.scenes=[newScene('gallery','Gallery','gallery.rad')];project.startScene='gallery';
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs'),{server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist')});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']});
try{
 for(const unavailable of [true,false]){
  const context=await browser.newContext({viewport:{width:1200,height:850}}),page=await context.newPage(),external=[],errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  try{
   await context.route('**/*',route=>{const request=route.request().url();if(request===new URL('config/tour.json',url).href)return route.fulfill({json:project});if(request===new URL('config/hosting.json',url).href)return route.fulfill({json:{}});if(request.startsWith(url)||request.startsWith('blob:')||request.startsWith('data:'))return route.continue();external.push(request);return route.abort();});
   if(unavailable)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...options){return /webgl/i.test(type)?null:original.call(this,type,...options);};});
   await page.goto(url);await expect(page.locator('body')).toHaveCSS('font-family',/Segoe UI/);const enter=page.getByRole('button',{name:'Enter tour',exact:true});await enter.waitFor();
   if(unavailable){
    const message=page.getByRole('alert');await expect(message.locator('span')).toHaveText('WebGL is unavailable. Open this tour on a device and browser that support WebGL 2.');await expect(message.getByRole('button',{name:'Retry 3D viewer',exact:true})).toBeVisible();await expect(message).toHaveCSS('font-size','12px');await expect(enter).toBeDisabled();await expect(enter).toHaveAttribute('aria-describedby',await message.getAttribute('id'));
    await expect(page.getByLabel('Start exploring',{exact:true})).toBeEnabled();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Viewing settings'})).toBeVisible();await page.getByRole('button',{name:'Close settings',exact:true}).click();
    for(const [name,viewport]of [['desktop',{width:1200,height:850}],['landscape',{width:915,height:412}],['portrait',{width:390,height:844}]]){
     await page.setViewportSize(viewport);await message.scrollIntoViewIfNeeded();await expect(message).toBeVisible();const bounds=await message.evaluate(element=>{const rect=element.getBoundingClientRect(),panel=element.closest('.title-copy').getBoundingClientRect();return {left:rect.left,right:rect.right,panelLeft:panel.left,panelRight:panel.right,viewport:innerWidth,scroll:document.documentElement.scrollWidth};});assert.ok(bounds.left>=bounds.panelLeft&&bounds.right<=bounds.panelRight+1&&bounds.scroll<=bounds.viewport+1,'startup message stays inside the landing panel at '+name);await page.screenshot({path:path.join(output,'webgl-unavailable-'+name+'.png')});
    }
   }else{await expect(enter).toBeEnabled();await expect(page.locator('#viewer-startup-error')).toHaveCount(0);}
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await context.close();}
 }
 console.log('PASS visible linked WebGL-unavailable message, usable scene/settings controls, responsive bounds and healthy WebGL startup. '+output);
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=path.resolve('test-output','package-'+Date.now(),'profile');
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),args:[],env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:profile},timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.studio');
 assert.equal(await page.getByRole('button',{name:'Export tour',exact:true}).count(),1);
 assert.equal(await page.getByRole('tab',{name:'Scenes',exact:true}).count(),1);
 await page.getByRole('button',{name:'File',exact:true}).click();
 assert.equal(await page.getByRole('menuitem',{name:'Open project',exact:true}).count(),1);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.editor-menu-popup').count(),0);
 assert.equal(await page.getByRole('button',{name:'Export tour',exact:true}).locator('svg.material-icon').count(),1);
 console.log('PASS: packaged Windows editor starts with its menus, browser and bundled icons');
}finally{await app.close();}

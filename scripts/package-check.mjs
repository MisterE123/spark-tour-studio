import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),args:[],env:{...process.env,SPARK_TEST:'1'},timeout:60000});
try{const page=await app.firstWindow();await page.waitForSelector('.studio');assert.equal(await page.getByRole('button',{name:'Export tour ↗'}).count(),1);console.log('PASS: packaged Windows editor starts and renders its authoring UI');}finally{await app.close();}

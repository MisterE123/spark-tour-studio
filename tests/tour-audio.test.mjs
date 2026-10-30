import test from 'node:test';
import assert from 'node:assert/strict';
import {TourAudio} from '../src/tour-audio.ts';

function fixture(t){
 const prior=globalThis.Audio,created=[];
 class AudioFixture{paused=true;ended=false;plays=0;loads=0;currentTime=0;constructor(source){this.src=source;created.push(this);}play(){this.paused=false;this.plays++;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(name){if(name==='src')this.src='';}load(){this.loads++;}}
 globalThis.Audio=AudioFixture;t.after(()=>{if(prior)globalThis.Audio=prior;else delete globalThis.Audio;});
 return {audio:new TourAudio(),created};
}
const base='https://tour.example/folder/',track=(source,loop=false)=>({source,loop,volume:.4});

test('title suspension suppresses late scene/view audio and gesture retries until resumed',t=>{
 const {audio,created}=fixture(t);audio.unlock();audio.setSuspended(true);audio.setScene(track('scene.wav',true),base);audio.setViewpoint(track('view.wav'),base);audio.unlock();
 assert.equal(created.length,2);assert.ok(created.every(a=>a.paused&&a.plays===0));
 audio.setSuspended(false);assert.ok(created.every(a=>!a.paused&&a.plays===1));created[0].currentTime=12;audio.setSuspended(true);assert.ok(created.every(a=>a.paused));audio.unlock();assert.ok(created.every(a=>a.plays===1));audio.setSuspended(false);assert.equal(created[0].currentTime,12);assert.ok(created.every(a=>a.plays===2));
 created[1].paused=true;created[1].ended=true;audio.setSuspended(true);audio.setSuspended(false);assert.equal(created[1].plays,2,'completed narration is not restarted on Home/Enter');
});
test('replacement/disposal releases retired audio without resuming it through later gestures',t=>{
 const {audio,created}=fixture(t);audio.unlock();audio.setScene(track('first.wav',true),base);audio.setViewpoint(track('old.wav'),base);audio.setViewpoint(track('next.wav'),base);assert.equal(created[1].src,'');assert.equal(created[1].loads,1);audio.setScene(track('second.wav',true),base);assert.equal(created[0].src,'');assert.equal(created[2].src,'');audio.stop();audio.setSuspended(true);audio.setSuspended(false);audio.unlock();assert.ok(created.every(a=>a.paused&&!a.src&&a.plays===1));
});
test('mute subscriptions are independent, idempotent and removable across current and future tracks',t=>{
 const {audio,created}=fixture(t),first=[],second=[];const off=audio.subscribeMuted(value=>first.push(value));audio.subscribeMuted(value=>second.push(value));audio.setScene(track('scene.wav'),base);audio.setMuted(true);audio.setMuted(true);audio.setViewpoint(track('view.wav'),base);assert.ok(created.every(a=>a.muted));assert.deepEqual(first,[true]);assert.deepEqual(second,[true]);off();off();audio.setMuted(false);assert.ok(created.every(a=>!a.muted));assert.deepEqual(first,[true]);assert.deepEqual(second,[true,false]);
});

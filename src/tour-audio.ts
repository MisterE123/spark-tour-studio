import type {AudioTrack} from './model';
export class TourAudio {
 private scene?:HTMLAudioElement;private viewpoint?:HTMLAudioElement;muted=false;unlocked=false;
 unlock(){this.unlocked=true;for(const a of [this.scene,this.viewpoint])if(a?.paused&&!a.ended)void a.play().catch(()=>{});}
 private release(audio?:HTMLAudioElement){if(audio){audio.pause();audio.removeAttribute('src');audio.load();}}
 private make(track:AudioTrack|undefined,base:string){if(!track?.source)return;const a=new Audio(new URL(track.source,base).href);a.loop=track.loop;a.volume=track.volume;a.muted=this.muted;a.preload='auto';if(this.unlocked)void a.play().catch(()=>{});return a;}
 setScene(track:AudioTrack|undefined,base:string){this.release(this.scene);this.release(this.viewpoint);this.viewpoint=undefined;this.scene=this.make(track,base);}
 setViewpoint(track:AudioTrack|undefined,base:string){this.release(this.viewpoint);this.viewpoint=this.make(track,base);}
 setMuted(value:boolean){this.muted=value;for(const a of [this.scene,this.viewpoint])if(a)a.muted=value;}
 stop(){this.release(this.scene);this.release(this.viewpoint);this.scene=this.viewpoint=undefined;}
}

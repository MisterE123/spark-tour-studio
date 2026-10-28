import type {AudioTrack} from './model';
export class TourAudio {
 private scene?:HTMLAudioElement;private viewpoint?:HTMLAudioElement;muted=false;unlocked=false;suspended=false;
 private mutedListeners=new Set<(muted:boolean)=>void>();
 subscribeMuted(listener:(muted:boolean)=>void){this.mutedListeners.add(listener);return()=>{this.mutedListeners.delete(listener);};}
 private play(audio?:HTMLAudioElement){if(this.unlocked&&!this.suspended&&audio?.paused&&!audio.ended)void audio.play().catch(()=>{});}
 unlock(){this.unlocked=true;this.play(this.scene);this.play(this.viewpoint);}
 setSuspended(value:boolean){this.suspended=value;for(const audio of [this.scene,this.viewpoint]){if(value)audio?.pause();else this.play(audio);}}
 private release(audio?:HTMLAudioElement){if(audio){audio.pause();audio.removeAttribute('src');audio.load();}}
 private make(track:AudioTrack|undefined,base:string){if(!track?.source)return;const a=new Audio(new URL(track.source,base).href);a.loop=track.loop;a.volume=track.volume;a.muted=this.muted;a.preload='auto';this.play(a);return a;}
 setScene(track:AudioTrack|undefined,base:string){this.release(this.scene);this.release(this.viewpoint);this.viewpoint=undefined;this.scene=this.make(track,base);}
 setViewpoint(track:AudioTrack|undefined,base:string){this.release(this.viewpoint);this.viewpoint=this.make(track,base);}
 setMuted(value:boolean){if(this.muted===value)return;this.muted=value;for(const a of [this.scene,this.viewpoint])if(a)a.muted=value;for(const listener of this.mutedListeners)listener(value);}
 stop(){this.release(this.scene);this.release(this.viewpoint);this.scene=this.viewpoint=undefined;}
}

import {movementSpeed,vrWorldScale,walkingSettings} from '../shared/navigation-settings.mjs';
import {scaleTrackedRig,rigidXRViews} from '../shared/xr-scale.mjs';
import {richTextPlainText} from '../shared/rich-text.mjs';
import {repairLodBounds} from '../shared/lod-bounds.mjs';
import {moveViewGeometry,viewFromCamera} from '../shared/view-authoring.mjs';
import {WalkMotion} from '../shared/walk-motion.mjs';
import {keyboardMotion,isJumpKey,lookRotation} from '../shared/navigation-input.mjs';
import {bubbleAppearance,resolveBubbleSettings,bubbleLabel,bubbleOcclusionLimit,pathYaw} from '../shared/bubbles.mjs';
import {BackgroundLayer} from './background';
import {PerformanceSettingsSchema} from '../shared/performance.mjs';
import {AdaptiveDetailController} from '../shared/adaptive-detail.mjs';
import type {PerformanceSettings} from './model';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type Rapier from '@dimforge/rapier3d-compat';
import {physics as RAPIER} from '../shared/physics.mjs';
import {loadPhysics} from '../shared/physics-loader.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Project,TourScene,Hosting,Mode,Viewpoint,Hotspot,Page,Transform,Vec3,TourDestination,CollisionVolume,SceneLink } from './model';
import {CollisionSelectionLayer} from './collision-selection';
import {flyMovement,nearbyFlyPosition} from '../shared/flying.mjs';
import { WalkingMotor,nearbyWalkingFeet,clickedWalkingFeet,teleportWalkingFeet,configureWalkingController,normalizeStepHeight,DEFAULT_STEP_HEIGHT } from '../shared/walking.mjs';
import { WalkCamera } from '../shared/walk-camera.mjs';
import {collisionVertices} from '../shared/collision-vertices.mjs';
import { sceneUrl,colliderUrl } from '../shared/project.mjs';
import {isPagedCollision,validatePagedCollisionManifest} from '../shared/paged-collision.mjs';
import {PagedCollider} from './paged-collider';
import {readCollisionResponse} from '../shared/collision-stream.mjs';
import { assertPagedRad } from '../shared/rad.mjs';
import {xrMotion,stick} from '../shared/xr-controls.mjs';
import {badge,updateBadge,badgeVisibility,panel,imagePanel,releaseUI} from './spatial-ui';
import {XRContent} from './xr-content';
import {TourAudio} from './tour-audio';
import {ViewNavigation,listedViewpoints,sceneThumbnail} from '../shared/viewpoints.mjs';
import {ViewGeometry} from './view-geometry';
import {WalkingRoutes} from './walking-routes';
import type {IconName} from './material-symbols';

export interface SceneLoadState {sceneId:string;name:string;cover:string;fallbackCover:string;phase:string;completed:number;total:number}
const v=(a:Vec3)=>new THREE.Vector3(...a);
function apply(o:THREE.Object3D,t:Transform){o.position.fromArray(t.position);o.rotation.set(...t.rotation,'YXZ');o.scale.setScalar(t.scale);o.updateMatrixWorld(true);}
function release(o:THREE.Object3D){o.traverse(c=>{if(c instanceof THREE.Mesh){c.geometry.dispose();for(const m of Array.isArray(c.material)?c.material:[c.material]){(m as THREE.MeshBasicMaterial).map?.dispose();m.dispose();}}});o.removeFromParent();}
function label(text:string,width=768,height=128,bg='#16323a'){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d')!;
 c.fillStyle=bg;c.fillRect(0,0,width,height);c.strokeStyle='#579e94';c.lineWidth=3;c.strokeRect(2,2,width-4,height-4);c.fillStyle='#ecf7f3';c.font='32px system-ui';
 const words=text.split(/\s+/);let line='',y=48;for(const w of words){if(c.measureText(line+w).width>width-40){c.fillText(line,20,y);line='';y+=42;}line+=w+' ';}c.fillText(line,20,y);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
export class TourRuntime {
 readonly collisionSelection=new CollisionSelectionLayer();private selectionRequest?:{sceneId:string;volumes:CollisionVolume[];selected:string;mode:'translate'|'rotate'|'scale'};private collisionPick?:{type:'ball'|'box';operation:'add'|'remove'};private lastSelectionTint=0;private gizmoDragged=false;private directWallAxis:'X'|'Y'|'Z'|undefined;private viewPick='';private geometryTool:'translate'|'rotate'='translate';readonly walkMotion=new WalkMotion();readonly walking=new WalkingMotor();private walkCamera=new WalkCamera();onViewPickCancel=()=>{};
 onCollisionVolume=(volume:CollisionVolume)=>{};onCollisionSelect=(id:string)=>{};onCollisionPlace=(point:Vec3,type:'ball'|'box',operation:'add'|'remove')=>{};onCollisionPickCancel=()=>{};
 readonly viewGeometry=new ViewGeometry();private navigator?:ViewNavigation;private viewXROffset=new THREE.Vector3();private thumbnailPending?:{id:string;after:number};onViewpointThumbnail=(id:string,data:string)=>{};onViewGeometry=(id:string,patch:Partial<Viewpoint>)=>{};
 readonly audio=new TourAudio();private flight?:{start:number;duration:number;from:THREE.Vector3;to:THREE.Vector3;fromYaw:THREE.Quaternion;toYaw:THREE.Quaternion;pitch:number;targetPitch:number};private descriptionLabel?:THREE.Mesh;
 readonly overlay=new THREE.Scene();readonly viewMarkers=new THREE.Group();readonly routes=new WalkingRoutes(this.overlay);readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(65,1,.05,20000);readonly rig=new THREE.Group();readonly content=new THREE.Group();readonly bubbles=new THREE.Group();readonly hud=new THREE.Group();spark:SparkRenderer;readonly gizmo:TransformControls;
 performanceTransition:Promise<void>=Promise.resolve();
 onPointerCapture=(captured:boolean)=>{};
 get pointerCaptured(){return document.pointerLockElement===this.renderer.domElement;}
 async capturePointer(){
  if(this.editing||this.blocked||this.renderer.xr.isPresenting||this.mode==='jumps'||!this.ready||this.collisionMovementBlocked)return false;
  this.audio.unlock();this.renderer.domElement.focus();
  try{await this.renderer.domElement.requestPointerLock();return this.pointerCaptured;}catch{return false;}
 }
 releasePointer(){if(this.pointerCaptured)document.exitPointerLock();}
 private performanceListeners=new Set<(settings:PerformanceSettings)=>void>();
 private adaptiveDetail=new AdaptiveDetailController();
 get adaptiveDetailScale(){return this.adaptiveDetail.scale;}
 subscribePerformance(listener:(settings:PerformanceSettings)=>void){this.performanceListeners.add(listener);return()=>{this.performanceListeners.delete(listener);};}
 private precisionRestore?:ReturnType<TourRuntime['precisionSnapshot']>;private pendingDestination?:{id:string;viewpoint?:string};private precisionCleanup:Promise<void>=Promise.resolve();
 private lastViewpoints=new Map<string,string>();currentViewpoint='';showViewpoints=false;swapSticks=false;xrFly=false;onViewpoint=(id:string)=>{};
 private bubbleOcclusion=new WeakMap<THREE.Object3D,{at:number;eye:THREE.Vector3;point:THREE.Vector3;hidden:boolean;blockedCount:number}>();private occlusionCursor=0;private occlusionRay=new THREE.Raycaster();
 private menuRecenterFrames=0;private menuOpen=false;private menuTab:'move'|'scenes'|'views'|'options'='move';private menuPage=0;private confirmExit=false;private held=new Map<THREE.Object3D,THREE.Object3D|null>();private teleportController?:THREE.XRTargetRaySpace;private teleportPoint?:THREE.Vector3;private aimTime=0;private hovered?:THREE.Object3D;private routeStall=0;private lastSafeHead?:THREE.Vector3;private menuAnchor=new THREE.Vector3();private wristMenu=badge('menu','Tour menu');private teleportRing=new THREE.Mesh(new THREE.RingGeometry(.17,.25,48),new THREE.MeshBasicMaterial({color:0x9fffc8,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
 project:Project|null=null;hosting:Hosting={assetBaseUrl:'./',sceneUrls:{}};base=location.href;active:TourScene|null=null;mode:Mode='jumps';viewHeight=1.7;stepHeight=DEFAULT_STEP_HEIGHT;private visitorSpeed=1;onSpeed=(value:number)=>{};get speedMultiplier(){return this.visitorSpeed;}set speedMultiplier(value:number){if(!Number.isFinite(value)||value<.05||value>20)return;this.visitorSpeed=value;this.onSpeed(value);}private appliedXRScale=1;get speed(){return movementSpeed(this.project,this.active,this.speedMultiplier);}set speed(value:number){this.speedMultiplier=value/movementSpeed(this.project,this.active,1);}quality=1;performanceSettings:PerformanceSettings=PerformanceSettingsSchema.parse({});frameMs=16;snap=true;editing=false;blocked=false;
 private firstDisplay?:{mesh:SplatMesh;started:number;minimum:number;frame:number};
 loading:SceneLoadState|null=null;onLoading=(state:SceneLoadState|null)=>{};
 private loadingListeners=new Set<()=>void>();
 subscribeLoading=(listener:()=>void)=>{this.loadingListeners.add(listener);return()=>{this.loadingListeners.delete(listener);};};
 getLoadingSnapshot=()=>this.loading;
 onStatus=(text:string,error=false)=>{};onScene=(id:string)=>{};onMode=(mode:Mode)=>{};onPage=(page:Page)=>{};onPick=(point:Vec3)=>{};onSelect=(id:string)=>{};onMove=(id:string,point:Vec3)=>{};
 private backgroundLayer=new BackgroundLayer(this.scene,message=>this.report(message,true));private mesh?:SplatMesh;private collider?:THREE.Group;private world?:Rapier.World;private body?:Rapier.RigidBody;private character?:Rapier.KinematicCharacterController;private capsule?:Rapier.Collider;private generation=0;private dead=false;private keys=new Set<string>();private observers:ResizeObserver;private cleanup:(()=>void)[]=[];private ray=new THREE.Raycaster();private touch=new THREE.Vector2();private pointerMove=new THREE.Vector3();private last=0;private crouched=false;private touchCrouch=false;private touchLift=0;private jumpRequested=false;private turnReady=true;private status='';private currentPage:Page|null=null;private selected?:THREE.Object3D;private fade:THREE.Mesh;private fadeUntil=0;private controllers:THREE.XRTargetRaySpace[]=[];private pendingPick=false;
 private colliderGeneration=0;private colliderSource='';private colliderVisible=false;private transformKey='';private colliderTransformKey='';colliderTransition:Promise<void>=Promise.resolve();private xrContent=new XRContent();
 private initialColliderLoad?:{generation:number;sceneId:string;promise:Promise<void>};private sceneResourcesReady=false;private colliderLoading=false;private colliderFailure='';private navigationFailure=false;private statusScope:'scene'|'navigation'|'xr'='scene';
 private get collisionMovementBlocked(){return !this.editing&&this.mode!=='jumps'&&!!this.active?.collider&&(this.colliderLoading||!this.world);}
 private pagedCollider?:PagedCollider;private colliderAbort?:AbortController;private modeRequest=0;private preparingMode=false;private modeTransition:Promise<void>=Promise.resolve();private fallbackNavigationDirty=false;private pagedNavigationAligned=true;private teleportPreparation='';private teleportRequest=0;private teleportLease?:{release():void};private teleportQuery?:{id:number;controller:THREE.XRTargetRaySpace;abort:AbortController};private teleportAim?:{origin:THREE.Vector3;direction:THREE.Vector3;point?:THREE.Vector3;landing?:THREE.Vector3;state:'pending'|'ready'|'invalid';retryAt:number};
 private get teleportAimPending(){return !!this.teleportQuery;}
 private headSafetyTrackingCleanup?:()=>void;
 constructor(readonly host:HTMLElement){
  this.cleanup.push(()=>this.headSafetyTrackingCleanup?.());
  this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:true});this.renderer.localClippingEnabled=true;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.xr.enabled=true;this.renderer.xr.cameraAutoUpdate=false;this.renderer.xr.setReferenceSpaceType('local-floor');this.renderer.setClearColor('#0b151d');this.renderer.domElement.tabIndex=0;host.appendChild(this.renderer.domElement);
  this.spark=new SparkRenderer({renderer:this.renderer,lodSplatScale:1,maxPagedSplats:8388608});this.applyPerformance(this.performanceSettings);this.scene.add(this.spark,this.content,this.rig);this.content.add(this.viewGeometry.group);this.overlay.add(this.bubbles,this.viewMarkers,this.hud,this.wristMenu,this.teleportRing);this.wristMenu.visible=false;this.wristMenu.userData.action=()=>this.toggleMenu();this.teleportRing.rotation.x=-Math.PI/2;this.teleportRing.visible=false;this.routes.onNotice=text=>this.onStatus(text,false);this.rig.rotation.order='YXZ';this.rig.add(this.camera);this.rig.position.set(0,1.7,3);
  const grid=new THREE.GridHelper(30,30,0x2d706e,0x18333c);grid.name='empty-grid';this.scene.add(grid);
  this.fade=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));this.fade.renderOrder=10000;this.overlay.add(this.fade);
  this.content.add(this.collisionSelection.group);this.collisionSelection.mountHandles(this.overlay);
  this.gizmo=new TransformControls(this.camera,this.renderer.domElement);this.scene.add(this.gizmo.getHelper());
  const hover=this.gizmo.pointerHover.bind(this.gizmo);this.gizmo.pointerHover=pointer=>{if(this.directWallAxis&&!this.gizmo.dragging){this.gizmo.axis=this.directWallAxis;this.gizmo.getHelper().updateMatrixWorld(true);}else hover(pointer);};this.gizmo.addEventListener('mouseDown',()=>{this.directWallAxis=undefined;});
  this.gizmo.addEventListener('dragging-changed',e=>{this.blocked=!!e.value;if(e.value)this.gizmoDragged=true;});this.gizmo.addEventListener('mouseUp',()=>{if(this.selected?.userData.collisionVolume){this.onCollisionVolume(this.collisionSelection.patch(this.selected));return;}if(this.selected?.userData.geometryHandle&&this.viewGeometry.view){this.onViewGeometry(this.viewGeometry.view.id,this.viewGeometry.patch(this.selected));return;}if(this.selected)this.onMove(this.selected.userData.id,this.selected.position.toArray() as Vec3);});
  this.gizmo.addEventListener('objectChange',()=>{if(this.selected?.userData.geometryHandle)this.viewGeometry.preview(this.selected);if(this.selected?.userData.collisionVolume){const tint=performance.now()-this.lastSelectionTint>100;if(tint)this.lastSelectionTint=performance.now();this.collisionSelection.preview(this.selected,tint);}});
  const on=(target:EventTarget,name:string,fn:EventListener)=>{target.addEventListener(name,fn);this.cleanup.push(()=>target.removeEventListener(name,fn));};
  on(window,'keydown',((e:KeyboardEvent)=>{this.audio.unlock();if(this.blocked||e.defaultPrevented||(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],[role=menu],[role=tablist],[role=separator]')||e.code==='Space'&&(e.target as HTMLElement)?.closest('button'))return;if(!e.repeat&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','Space'].includes(e.code))this.navigator?.takeControl();if(isJumpKey(e.code)&&!e.repeat)this.requestJump();this.keys.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){++this.modeRequest;this.preparingMode=false;this.cancelCollisionShapePick();this.cancelViewGeometryPick();this.walkMotion.reset();this.pendingPick=false;this.gizmo.enabled=true;if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();this.stopFlight();this.keys.clear();this.routes.cancel();this.currentPage=null;this.menuOpen=false;this.refreshHud();}}) as EventListener);
  on(window,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.code);}) as EventListener);on(window,'blur',()=>{this.keys.clear();this.walkMotion.reset();this.setTouch(0,0);this.touchLift=0;this.touchCrouch=false;this.jumpRequested=false;});
  let start={x:0,y:0},down=false,moved=false,dragDistance=0,dragButton=0,dragPointer=-1;
  const endDrag=()=>{down=false;dragPointer=-1;};on(window,'blur',()=>{endDrag();this.pointerMove.set(0,0,0);});on(window,'pointercancel',endDrag);
  on(this.renderer.domElement,'contextmenu',e=>e.preventDefault());
  const reticle=document.createElement('div');reticle.style.cssText='position:absolute;left:50%;top:50%;width:5px;height:5px;border:1px solid white;border-radius:50%;background:#0005;pointer-events:none;transform:translate(-50%,-50%);z-index:25;display:none';this.host.append(reticle);this.renderer.domElement.dataset.pointerMode='free';on(document,'pointerlockchange',()=>{const captured=this.pointerCaptured;reticle.style.display=captured?'block':'none';this.renderer.domElement.dataset.pointerMode=captured?'captured':'free';this.keys.clear();this.pointerMove.set(0,0,0);this.walkMotion.reset();endDrag();this.onPointerCapture(captured);});this.cleanup.push(()=>reticle.remove());

  // Pick a face before TransformControls handles the press, so its square node
  // can be dragged directly instead of requiring a separate arrow selection.
  const startWall=(e:PointerEvent)=>{if(e.button!==0||!this.editing||!this.gizmo.enabled||!this.selectionRequest||this.pendingPick||this.viewPick||this.collisionPick)return;this.scene.updateMatrixWorld(true);this.collisionSelection.syncHandles();this.pointerRay(e);const hit=this.ray.intersectObjects(this.collisionSelection.wallHandles(),false)[0];if(!hit)return;const axis=hit.object.userData.collisionFace.axis;this.attachGizmo(hit.object,'translate',axis);this.directWallAxis=(['X','Y','Z'] as const)[axis];this.gizmo.axis=this.directWallAxis;this.scene.updateMatrixWorld(true);this.onCollisionSelect(hit.object.userData.collisionVolume.id);};this.renderer.domElement.addEventListener('pointerdown',startWall,true);this.cleanup.push(()=>this.renderer.domElement.removeEventListener('pointerdown',startWall,true));
  on(this.renderer.domElement,'pointerdown',((e:PointerEvent)=>{if(down||(e.button!==0&&e.button!==2))return;if(e.button===2)e.preventDefault();this.audio.unlock();this.renderer.domElement.focus();start={x:e.clientX,y:e.clientY};down=true;moved=false;this.gizmoDragged=this.gizmo.dragging;dragDistance=0;dragButton=e.button;dragPointer=e.pointerId;}) as EventListener);
  on(window,'pointermove',((e:PointerEvent)=>{if(document.pointerLockElement===this.renderer.domElement){if(this.blocked||this.renderer.xr.isPresenting||this.editing)return;this.pointerRay(e);this.highlight(this.hitUI());if(e.buttons&2){const scale=2*this.speed/Math.max(1,this.host.clientHeight);this.pointerMove.add(new THREE.Vector3(-e.movementX,e.movementY,0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(scale));}else{if(this.mode==='explore')this.routes.look(e.movementX,e.movementY);const look=lookRotation(this.rig.rotation.y,this.camera.rotation.x,e.movementX,e.movementY,true);this.rig.rotation.y=look.yaw;this.camera.rotation.x=look.pitch;}return;}if(e.target===this.renderer.domElement&&!this.renderer.xr.isPresenting){this.pointerRay(e);this.highlight(this.hitUI());}if(!down||e.pointerId!==dragPointer||this.blocked||this.renderer.xr.isPresenting||this.gizmo.dragging)return;if(!(e.buttons&(dragButton===2?2:1))){endDrag();return;}const dx=e.clientX-start.x,dy=e.clientY-start.y;dragDistance+=Math.hypot(dx,dy);if(dragDistance>2){moved=true;if(!(this.mode==='jumps'&&!this.editing&&this.navigator))this.stopFlight();}start={x:e.clientX,y:e.clientY};if(this.mode==='jumps'&&!this.editing&&this.navigator){this.steerView(this.navigator.drag(dx,dy));return;}if(dragButton===2){const scale=2*this.speed/Math.max(1,this.host.clientHeight);this.pointerMove.add(new THREE.Vector3(-dx,dy,0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(scale));}else{if(this.mode==='explore')this.routes.look(dx,dy);const look=lookRotation(this.rig.rotation.y,this.camera.rotation.x,dx,dy,false);this.rig.rotation.y=look.yaw;this.camera.rotation.x=look.pitch;}}) as EventListener);
  on(window,'pointerup',((e:PointerEvent)=>{if(!down||e.pointerId!==dragPointer||e.button!==dragButton)return;if(dragButton===0&&!moved&&!this.gizmoDragged&&!this.gizmo.dragging&&e.target===this.renderer.domElement)this.click(e);endDrag();}) as EventListener);
  const wheel=(e:WheelEvent)=>{e.preventDefault();if(this.blocked||this.gizmo.dragging||this.renderer.xr.isPresenting)return;this.audio.unlock();this.navigator?.takeControl();if(this.mode==='jumps'&&!this.editing)return;const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.host.clientHeight:1);this.pointerMove.add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-THREE.MathUtils.clamp(pixels,-300,300)*this.speed*.002));};this.renderer.domElement.addEventListener('wheel',wheel,{passive:false});this.cleanup.push(()=>this.renderer.domElement.removeEventListener('wheel',wheel));
  for(let i=0;i<2;i++){const controller=this.renderer.xr.getController(i);this.rig.add(controller);this.controllers.push(controller);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-12)]),new THREE.LineBasicMaterial({color:0xa8e6d4,transparent:true,opacity:.65}));this.overlay.add(line);line.visible=false;controller.userData.rayLine=line;const tip=new THREE.Mesh(new THREE.SphereGeometry(.008,12,8),new THREE.MeshBasicMaterial({color:0x669ab5,depthTest:false,depthWrite:false}));tip.renderOrder=200;tip.visible=false;controller.userData.tip=tip;this.overlay.add(tip);controller.addEventListener('connected',event=>{controller.userData.handedness=event.data.handedness;});controller.addEventListener('squeezestart',()=>this.toggleMenu());controller.addEventListener('selectstart',()=>this.triggerStart(controller));controller.addEventListener('selectend',()=>this.triggerEnd(controller));}
  this.renderer.xr.addEventListener('sessionstart',()=>{this.renderer.xr.setFoveation(this.performanceSettings.xrFoveation);this.navigator?.takeControl();this.viewXROffset.set(0,0,0);this.stopFlight();this.walkMotion.reset();this.keys.clear();this.blocked=false;this.routes.cancel();this.watchHeadSafetyTracking();this.fadeUntil=0;this.camera.position.set(0,0,0);this.camera.rotation.set(0,0,0);this.syncXRScale();this.walkCamera.reset();this.walking.reset();if(this.mode==='explore'&&this.body)this.rig.position.y=this.body.translation().y-(this.crouched?.57:.87);else this.rig.position.y-=this.xrEyeHeight;this.currentPage=null;this.menuOpen=false;this.menuRecenterFrames=2;this.menuTab='move';this.confirmExit=false;this.refreshHud(true);this.onMode(this.mode);});
  this.renderer.xr.addEventListener('sessionend',()=>{this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.performanceSettings.pixelRatio));this.walkCamera.reset();this.walking.reset();this.stopFlight();this.walkMotion.reset();const head=this.camera;const pos=head.getWorldPosition(new THREE.Vector3()),e=new THREE.Euler().setFromQuaternion(head.getWorldQuaternion(new THREE.Quaternion()),'YXZ');this.rig.scale.setScalar(1);this.appliedXRScale=1;this.camera.near=.05;this.camera.updateProjectionMatrix();this.rig.position.copy(pos);this.rig.rotation.set(0,e.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(e.x,0,0);this.menuOpen=false;this.hud.visible=false;this.wristMenu.visible=false;this.cancelTeleport();this.held.clear();this.routes.cancel();if(this.body){if(this.mode==='explore'){const body=this.body.translation();this.rig.position.y=body.y-(this.crouched?.55:.85)+this.walkEyeHeight;}else this.body.setTranslation({x:pos.x,y:pos.y-.85,z:pos.z},true);}});
  this.observers=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();});this.observers.observe(host);
  this.renderer.setAnimationLoop((t,frame)=>this.frame(t,frame));
  if(new URLSearchParams(location.search).has('diagnostics'))(window as unknown as {tourRuntime:TourRuntime}).tourRuntime=this;
 }
 async load(project:Project,hosting:Hosting,base:string,sceneId?:string){this.project=project;this.hosting=hosting;this.base=base;await this.selectScene(sceneId||project.startScene);}
 async visit(destination:TourDestination){
  const scene=this.project?.scenes.find(s=>s.id===destination.sceneId);if(!scene)return false;
  if(destination.kind==='viewpoint'&&!scene.viewpoints.some(v=>v.id===destination.id))return false;
  if(destination.kind==='bubble'&&!scene.hotspots.some(h=>h.id===destination.id))return false;
  this.currentPage=null;this.menuOpen=false;this.refreshHud();
  this.audio.unlock();if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();
  if(this.active?.id!==scene.id||!this.resourcesAvailable){const loading=this.selectScene(scene.id,destination.kind==='viewpoint'?destination.id:undefined),generation=this.generation;await loading;if(this.dead||generation!==this.generation||!this.resourcesAvailable)return false;}
  if(destination.kind==='scene')return true;
  if(destination.kind==='viewpoint'){
   if(scene.modes.includes('jumps'))this.setMode('jumps');
   this.jump(destination.id,false);
   // A scene without Viewpoints still needs a valid body/camera placement.
   if(this.mode!=='jumps')this.setMode(this.mode,true,false);
   this.fadeUntil=performance.now()+220;return !this.status;
  }
  return this.visitBubble(destination.id);
 }
 private async visitBubble(id:string){
  const bubble=this.active?.hotspots.find(h=>h.id===id);if(!bubble||this.collisionMovementBlocked)return false;const generation=this.generation,colliderGeneration=this.colliderGeneration,paged=this.pagedCollider,mode=this.mode;
  let lease:{release():void}|undefined,placementLease:{release():void}|undefined;this.focusCollision(paged);
  try{
  this.scene.updateMatrixWorld(true);const target=this.content.localToWorld(v(bubble.position)),eye=this.trackedHeadPosition();
  if(paged)lease=await paged.prepare(target,6);if(this.dead||generation!==this.generation||colliderGeneration!==this.colliderGeneration||paged!==this.pagedCollider||mode!==this.mode||this.collisionMovementBlocked)return false;
  const away=eye.clone().sub(target);away.y=0;if(away.lengthSq()<.001)away.set(0,0,1);away.normalize();
  const candidates=[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI].map(angle=>target.clone().add(away.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle).multiplyScalar(2.5)).add(new THREE.Vector3(0,.9,0)));
  let position:THREE.Vector3|undefined,feet:THREE.Vector3|undefined;
  for(const candidate of candidates){
   this.focusCollision(paged);placementLease?.release();placementLease=undefined;if(paged)placementLease=await paged.prepare(candidate,1);
   if(this.dead||generation!==this.generation||colliderGeneration!==this.colliderGeneration||paged!==this.pagedCollider||mode!==this.mode||this.collisionMovementBlocked)return false;
   if((this.mode==='explore'||this.renderer.xr.isPresenting)&&this.world){const height=this.renderer.xr.isPresenting?Math.max(.5,eye.y-this.rig.position.y):this.viewHeight,found=nearbyWalkingFeet(this.world,candidate,height,this.capsule,1,p=>this.validWalkingPlacement(p));if(!found)continue;const nextFeet=new THREE.Vector3(found.x,found.y,found.z),next=nextFeet.clone().add(new THREE.Vector3(0,height,0));if(this.checkBubbleOcclusion(target,next))continue;position=next;feet=nextFeet;break;}
   const found=this.world?nearbyFlyPosition(this.world,candidate,this.capsule,p=>this.allowedPosition(p,0,this.flyRadius),this.flyRadius):candidate;if(!found)continue;const next=new THREE.Vector3(found.x,found.y,found.z);if(this.checkBubbleOcclusion(target,next))continue;position=next;break;
  }
  if(!position){this.onStatus('No clear position near this bubble.',false);return false;}
  this.stopFlight();this.routes.cancel();this.cancelTeleport();this.pointerMove.set(0,0,0);this.navigator=undefined;this.thumbnailPending=undefined;this.updateCrouch(false,true);
  if(feet)this.placeFeet(feet);else this.rig.position.add(position.clone().sub(eye));
  this.facePoint(target);
  if(this.body&&this.mode!=='explore')this.body.setTranslation({x:position.x,y:position.y-.85,z:position.z},true);
  this.currentViewpoint='';this.onViewpoint('');this.descriptionLabel&&releaseUI(this.descriptionLabel);this.descriptionLabel=undefined;this.audio.setViewpoint(undefined,this.base);this.fadeUntil=performance.now()+220;
  const object=this.bubbles.children.find(o=>o.userData.id===id);if(object)this.bubbleOcclusion.delete(object);
  // Directory visits to a link bubble take the visitor to that marker. Its
  // destination activates only when the visitor subsequently selects it.
  if(bubble.kind==='page'){const page=this.project?.pages.find(p=>p.id===bubble.target);if(page){this.currentPage={...page,title:bubble.label};if(this.renderer.xr.isPresenting){this.menuOpen=true;this.refreshHud(true);}else this.onPage(this.currentPage);}}
  return true;
  }catch(error){if(generation===this.generation&&paged===this.pagedCollider)this.report('Nearby navigation data: '+String(error),true,'navigation');return false;}
  finally{this.focusCollision(paged);placementLease?.release();lease?.release();}
 }
 unload(){this.precisionRestore=undefined;this.pendingDestination=undefined;++this.generation;this.clearScene();this.active=null;this.status='';this.scene.getObjectByName('empty-grid')!.visible=true;}
 private setLoading(value:SceneLoadState|null){this.loading=value;this.onLoading(value);for(const listener of this.loadingListeners)listener();if(this.renderer.xr.isPresenting)this.refreshHud();}
 private report(text:string,error=false,scope:'scene'|'navigation'|'xr'='scene'){this.statusScope=scope;if(scope==='navigation'){this.navigationFailure=error;this.onStatus(text,false);if(this.renderer.xr.isPresenting)this.refreshHud();return;}if(error){this.firstDisplay=undefined;this.setLoading(null);}this.status=text;this.onStatus(text,error);if(this.renderer.xr.isPresenting){if(error)this.menuOpen=true;this.refreshHud(error);}}
 private clearScene(){this.pendingPick=false;this.firstDisplay=undefined;this.sceneResourcesReady=false;this.releasePointer();this.keys.clear();this.collisionPick=undefined;this.cancelViewGeometryPick();this.walkMotion.reset();this.collisionSelection.clear();this.setLoading(null);this.backgroundLayer.clear();this.navigator=undefined;this.thumbnailPending=undefined;this.viewGeometry.clear();this.crouched=false;this.jumpRequested=false;this.touchCrouch=false;this.touchLift=0;this.setTouch(0,0);this.pointerMove.set(0,0,0);this.flight=undefined;this.fadeUntil=0;this.audio.stop();this.descriptionLabel&&releaseUI(this.descriptionLabel);this.descriptionLabel=undefined;this.lastSafeHead=undefined;this.clearCollider();this.transformKey='';this.colliderTransformKey='';this.cancelTeleport();this.held.clear();this.currentViewpoint='';this.onViewpoint('');for(const c of [...this.viewMarkers.children])releaseUI(c);this.gizmo.detach();this.selected=undefined;if(this.mesh){this.mesh.removeFromParent();this.mesh.dispose();this.mesh=undefined;}for(const c of [...this.bubbles.children])release(c);}
 /** Prepare destination resources; ready also waits for its first rendered view. */
 async selectScene(id:string,viewpoint?:string,preservePrecision=false){
  if(!preservePrecision){this.precisionRestore=undefined;this.pendingDestination={id,viewpoint};}
  const s=this.project?.scenes.find(x=>x.id===id);if(!s){this.report('Choose a scene to begin.',true);return;}
  const previousMode=this.mode,token=++this.generation;this.clearScene();this.active=s;this.mode=s.modes.includes(previousMode)?previousMode:s.modes.includes('jumps')?'jumps':s.modes[0]||'fly';const walkingDefaults=walkingSettings(this.project,s);this.setViewHeight(walkingDefaults.height);this.setStepHeight(walkingDefaults.stepHeight);this.onMode(this.mode);this.currentPage=null;this.report(`Loading ${s.name}…`);this.onScene(id);const total=2+(s.background?.type&&s.background.type!=='solid'?1:0)+(s.collider?1:0);let completed=0;const progress=(phase:string)=>{if(token!==this.generation||this.dead)return;const reference=sceneThumbnail(s)||this.project?.cover||'',fallback=this.project?.cover||'',resolve=(value:string)=>{try{return value?new URL(value,this.base).href:'';}catch{return '';}};this.setLoading({sceneId:id,name:s.name,cover:resolve(reference),fallbackCover:resolve(fallback),phase,completed,total});};progress('Reading scene…');this.scene.getObjectByName('empty-grid')!.visible=false;apply(this.content,s.transform);this.bubbles.position.copy(this.content.position);this.bubbles.quaternion.copy(this.content.quaternion);this.bubbles.scale.copy(this.content.scale);this.viewMarkers.position.copy(this.content.position);this.viewMarkers.quaternion.copy(this.content.quaternion);this.viewMarkers.scale.copy(this.content.scale);
  try{
   if(!s.source)throw new Error('Choose a RAD file or URL for this scene.');
   let streamError:unknown;const mesh=new SplatMesh({url:sceneUrl(s,this.hosting,this.base),paged:true});this.mesh=mesh;mesh.maxSh=this.performanceSettings.maxSh;
   if(mesh.paged){const paged=mesh.paged,decode=paged.fetchDecodeChunk.bind(paged);let reported=false;paged.fetchDecodeChunk=async chunk=>{try{const data=await decode(chunk),repaired=repairLodBounds(data.extra?.lodTree);if(repaired){if(!mesh.userData.lodBoundsRepairs)console.warn('[Spark Tour] Corrected non-finite LoD bounds', {chunk,nodes:repaired});mesh.userData.lodBoundsRepairs=(mesh.userData.lodBoundsRepairs||0)+repaired;}return data;}catch(e){if(!reported&&token===this.generation&&!this.dead){reported=true;streamError=e;paged.abortController.abort();mesh.visible=false;this.report(`Streaming failed: ${String(e)}. Retry the scene.`,true);}throw e;}};}
   // Fetch/decode an ordinary panorama while RAD metadata is being read. Keep
   // splat backgrounds sequential so they do not compete with the destination
   // pager. Observe rejection now, even if metadata fails or this load is retired.
   const initialBackground=s.background,panorama=initialBackground?.type==='panorama'?this.setBackground(initialBackground).then(()=>({ok:true as const}),error=>({ok:false as const,error})):undefined;
   await mesh.initialized;const rad=await mesh.paged?.getRadMeta();if(token!==this.generation||this.dead)return;if(rad)assertPagedRad(rad.meta);this.jump(viewpoint||s.entry,false,true,true);this.thumbnailPending=undefined;this.content.add(mesh);completed++;progress('Preparing background…');
   const background=this.active?.id===s.id?this.active.background:s.background;
   if(panorama&&background===initialBackground){const result=await panorama;if(!result.ok)throw result.error;}
   else await this.setBackground(background);
   if(token!==this.generation||this.dead)return;
   if(s.background?.type&&s.background.type!=='solid')completed++;if(this.editing||this.mode!=='jumps')await this.loadInitialCollider(s.id,token,progress);if(this.active?.collider)completed++;if(token!==this.generation||this.dead)return;progress('Opening scene…');
   if(streamError)throw streamError;this.rebuildHotspots();if(!this.editing)this.audio.setScene(s.audio,this.base);this.jump(viewpoint||s.entry,false,true);this.report('');const available=s.modes;
   const mode=available.includes(previousMode)?previousMode:available.includes('jumps')?'jumps':available[0];
   if(mode==='jumps'){this.mode=mode;this.onMode(mode);this.refreshHud();}
   else if(mode){
    // Reinitialize physics even when the mode name is unchanged. Explicit scene-link
    // entry points ground locally; ordinary Walk arrivals use the walking start.
    this.setMode(mode,true,!viewpoint);
    if(this.pagedCollider)await this.modeTransition;
    if(token!==this.generation||this.dead)return;
    if(this.navigationFailure&&mode==='explore'){
     const fallback=available.find(m=>m!=='explore');
     if(fallback==='jumps'){this.mode=fallback;this.onMode(fallback);this.jump(viewpoint||s.entry,false,true);this.report('');this.refreshHud();}
     else if(fallback)this.setMode(fallback,true);
    }
   }else throw new Error('No usable navigation mode for this scene.');
   this.sceneResourcesReady=true;this.updateScene(this.active!);this.refreshCollisionSelection();if(this.editing)this.setLoading(null);else{completed=total-1;progress('Preparing first view…');this.firstDisplay={mesh,started:performance.now(),minimum:Math.max(1,Math.min(8192,rad?.meta.count||1)),frame:this.renderer.info.render.frame};}
  }catch(e){if(token===this.generation&&!this.dead){this.clearScene();this.report(`${s.name}: ${e instanceof Error?e.message:e}`,true);}}
 }
 get vrScale(){return vrWorldScale(this.active,this.active?.viewpoints.find(view=>view.id===this.currentViewpoint));}
 private get xrUnit(){return this.rig.scale.x;}
 private get xrInputSuspended(){const state=this.renderer.xr.getSession()?.visibilityState;return this.renderer.xr.isPresenting&&!!state&&state!=='visible';}
 private get xrHeadRadius(){return .1*this.xrUnit;}
 private get flyRadius(){return this.renderer.xr.isPresenting?Math.max(.2,this.xrHeadRadius+.015):.2;}
 /** XR's user camera is a culling-frustum proxy, behind the physical eyes. */
 private trackedHeadPosition(){
  const views=this.renderer.xr.isPresenting?this.renderer.xr.getCamera().cameras:undefined;
  if(!views?.length)return this.camera.getWorldPosition(new THREE.Vector3());
  this.rig.updateWorldMatrix(true,false);const point=new THREE.Vector3(),eye=new THREE.Vector3();
  for(const view of views)point.add(eye.setFromMatrixPosition(view.matrix).applyMatrix4(this.rig.matrixWorld));
  return point.multiplyScalar(1/views.length);
 }
 private get xrEyeHeight(){return 1.7*this.xrUnit;}
 private syncXRScale(viewId=this.currentViewpoint){const scale=this.renderer.xr.isPresenting?vrWorldScale(this.active,this.active?.viewpoints.find(view=>view.id===viewId)):1;if(scale===this.appliedXRScale)return;scaleTrackedRig(this.rig,this.camera,scale,()=>this.trackedHeadPosition());this.appliedXRScale=scale;this.camera.near=.05/scale;this.lastSafeHead=undefined;this.viewXROffset.copy(this.trackedHeadPosition().sub(this.rig.position)).applyQuaternion(this.rig.quaternion.clone().invert());this.viewXROffset.y=0;if(this.renderer.xr.isPresenting){this.fadeUntil=performance.now()+220;this.refreshHud(true);}}
 followSceneLink(link:SceneLink){const scene=this.project?.scenes.find(scene=>scene.id===link.sceneId);if(!scene||link.viewpointId&&!scene.viewpoints.some(view=>view.id===link.viewpointId))return;this.currentPage=null;this.menuOpen=false;void this.selectScene(scene.id,link.viewpointId);}
 openViewDetails(){const view=this.active?.viewpoints.find(view=>view.id===this.currentViewpoint),details=view?.extendedDescription;if(!view)return;this.currentPage=details?.enabled?{id:'view-details-'+view.id,title:view.name,html:'',blocks:[{type:'text',text:richTextPlainText(details.richText),richText:details.richText,url:''}],sceneLinks:details.links}:{id:'view-description',title:view.name,html:'',blocks:[{type:'text',text:view.description||'',url:''}]};this.menuOpen=true;this.refreshHud(true);}
 private get velocityY(){return this.walking.velocityY;}
 private set velocityY(value:number){this.walking.velocityY=value;}
 private clearPhysics(){this.walking.reset();this.walkCamera.reset();this.routes.dispose();this.world?.free();this.world=undefined;this.body=undefined;this.character=undefined;this.capsule=undefined;this.lastSafeHead=undefined;this.bubbleOcclusion=new WeakMap();}
 private clearCollider(){this.colliderLoading=false;this.colliderFailure='';++this.colliderGeneration;++this.modeRequest;this.preparingMode=false;this.colliderAbort?.abort();this.colliderAbort=undefined;this.pagedCollider?.dispose();this.pagedCollider=undefined;this.fallbackNavigationDirty=false;this.colliderSource='';this.clearPhysics();if(this.collider){release(this.collider);this.collider=undefined;}}
 private loadInitialCollider(sceneId:string,token:number,progress:(phase:string)=>void):Promise<void>{
  const pending=this.initialColliderLoad;if(pending?.generation===token&&pending.sceneId===sceneId)return pending.promise;
  const task={generation:token,sceneId,promise:this.loadColliderLoop(sceneId,token,progress)};this.initialColliderLoad=task;
  return task.promise.finally(()=>{if(this.initialColliderLoad===task)this.initialColliderLoad=undefined;});
 }
 private async loadColliderLoop(sceneId:string,token:number,progress:(phase:string)=>void){
  while(token===this.generation&&!this.dead&&this.active?.id===sceneId){
   const scene=this.active,source=scene.collider;this.colliderLoading=!!source;this.colliderFailure='';
   try{if(source)await this.loadCollider(scene,token,progress);}catch(error){if(token!==this.generation||this.dead)return;if(this.active?.collider===source){this.clearCollider();this.colliderSource=source;this.colliderFailure=String(error);this.report('Navigation area: '+this.colliderFailure,true,'navigation');return;}}
   if(token!==this.generation||this.dead)return;this.colliderLoading=false;
   if(this.active?.collider===source)return;this.clearCollider();
  }
 }
 private async loadCollider(s:TourScene,token:number,progress:(phase:string)=>void=()=>{}){
  const colliderToken=++this.colliderGeneration;this.colliderSource=s.collider;
  // Engine initialization and collider I/O are independent. A stale scene drops
  // its own result; it never aborts the engine shared by the next destination.
  const initializingPhysics=loadPhysics();void initializingPhysics.catch(()=>{});
  const url=colliderUrl(s,this.hosting,this.base);
  if(isPagedCollision(s.collider)){
   progress('Loading navigation coverage…');const abort=this.colliderAbort=new AbortController(),response=await fetch(url,{signal:abort.signal});if(!response.ok)throw Error(`Collision manifest request failed (${response.status}).`);const text=new TextDecoder().decode(await readCollisionResponse(response,32*1024*1024)),manifest=validatePagedCollisionManifest(JSON.parse(text));await initializingPhysics;if(token!==this.generation||colliderToken!==this.colliderGeneration||this.dead)return;
   this.world=new RAPIER.World({x:0,y:-9.81,z:0});const root=new THREE.Group();apply(root,this.active!.colliderTransform);this.content.add(root);this.collider=root;root.visible=this.colliderVisible;
   const paged=this.pagedCollider=new PagedCollider(manifest,url,this.world);root.add(paged.group);this.overlay.add(paged.overview.group);paged.overview.setVisible(this.colliderVisible);this.createCharacter();paged.onError=message=>{this.report('Nearby navigation data: '+message,true,'navigation');};paged.onChange=()=>{this.bubbleOcclusion=new WeakMap();if(!this.pagedNavigationAligned)this.fallbackNavigationDirty=true;};
   const entry=s.viewpoints.find(view=>view.id===(this.pendingDestination?.id===s.id&&this.pendingDestination.viewpoint||s.entry));progress('Opening nearby navigation tiles…');if(this.editing&&entry)await paged.ensure(this.content.localToWorld(v(entry.position)),4);
   if(token!==this.generation||colliderToken!==this.colliderGeneration||this.dead)return;this.configurePagedNavigation();this.transformKey=JSON.stringify(s.transform);this.colliderTransformKey=JSON.stringify(s.colliderTransform);return;
  }
  progress('Loading collision mesh…');const gltf=await new GLTFLoader().loadAsync(url,event=>progress(event.lengthComputable?'Loading collision mesh · '+Math.round(event.loaded/event.total*100)+'%':'Loading collision mesh…'));if(token!==this.generation||colliderToken!==this.colliderGeneration||this.dead){release(gltf.scene);return;}
  progress('Preparing collision physics…');try{await initializingPhysics;}catch(error){release(gltf.scene);throw error;}if(token!==this.generation||colliderToken!==this.colliderGeneration||this.dead){release(gltf.scene);return;}await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(token!==this.generation||colliderToken!==this.colliderGeneration||this.dead){release(gltf.scene);return;}
  const root=gltf.scene;apply(root,this.active!.colliderTransform);this.content.add(root);this.collider=root;
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();o.material=new THREE.MeshBasicMaterial({color:0x77efd3,wireframe:true,transparent:true,opacity:.45});});root.visible=this.colliderVisible;this.rebuildPhysics();
 }
 private rebuildPhysics(){
  if(this.pagedCollider){const paged=this.pagedCollider,realigned=paged.realign().then(()=>{if(this.pagedCollider===paged)this.configurePagedNavigation();}).catch(error=>{if(this.pagedCollider===paged)this.onStatus(String(error),true);});if(!this.colliderLoading)this.colliderTransition=realigned;return;}
  const position=this.body?.translation()||{x:this.rig.position.x,y:this.rig.position.y-.85,z:this.rig.position.z},root=this.collider;if(!root)return;this.clearPhysics();this.content.updateMatrixWorld(true);this.world=new RAPIER.World({x:0,y:-9.81,z:0});
  const navigationParts:{positions:Float32Array;indices:Uint32Array}[]=[];root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const pos=o.geometry.getAttribute('position');if(!pos)return;const verts=collisionVertices(pos,o.matrixWorld);const indices=o.geometry.index?new Uint32Array(o.geometry.index.array):Uint32Array.from({length:pos.count},(_,i)=>i);this.world!.createCollider(RAPIER.ColliderDesc.trimesh(verts,indices));navigationParts.push({positions:verts,indices});});
  this.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x,position.y,position.z));this.capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(this.crouched?.3:.6,.25),this.body);this.character=this.world.createCharacterController(.015);configureWalkingController(this.character);this.walking.reset();this.walkCamera.reset();this.world.step();this.routes.build(navigationParts,{stepHeight:this.stepHeight});
 }
 private createCharacter(){const world=this.world!;this.body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.rig.position.x,this.rig.position.y-.85,this.rig.position.z));this.capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.6,.25),this.body);this.character=world.createCharacterController(.015);configureWalkingController(this.character);this.walking.reset();this.walkCamera.reset();world.step();}
 private configurePagedNavigation(){
  const paged=this.pagedCollider;if(!paged)return;paged.group.updateWorldMatrix(true,false);const matrix=paged.group.matrixWorld,scale=new THREE.Vector3(),rotation=new THREE.Quaternion();matrix.decompose(new THREE.Vector3(),rotation,scale);this.pagedNavigationAligned=scale.distanceTo(new THREE.Vector3(1,1,1))<1e-5&&new THREE.Vector3(0,1,0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(0,1,0))<1e-5;
  const navigation=paged.manifest.navigation;this.pagedNavigationAligned=this.pagedNavigationAligned&&!!navigation&&(navigation.stepHeight??.25)*Math.abs(scale.y)<=this.stepHeight+1e-5;if(navigation&&this.pagedNavigationAligned)this.routes.buildPaged(navigation,{loadTile:async(entry:any,signal:AbortSignal)=>{const response=await fetch(new URL(entry.url,paged.url),{signal});if(!response.ok)throw Error('Navigation tile request failed ('+response.status+').');const bytes=await readCollisionResponse(response,entry.bytes);if(bytes.length!==entry.bytes)throw Error('Navigation tile is incomplete.');return bytes;},toNavigation:(point:any)=>paged.toGeneration(point),fromNavigation:(point:any)=>paged.fromGeneration(point),stepHeight:this.stepHeight,localFallback:()=>paged.navigationParts(),refineRoute:(start,end,signal)=>paged.routeParts(start,end,signal)});
  else this.routes.build(paged.navigationParts(),{stepHeight:this.stepHeight});this.fallbackNavigationDirty=false;
 }
 private allowedPosition(point:{x:number;y:number;z:number},halfHeight=0,radius=.19){return !this.pagedCollider||this.pagedCollider.allows(point,halfHeight,radius);}
 private focusCollision(paged=this.pagedCollider){if(paged&&paged===this.pagedCollider&&!this.dead)paged.focus(this.trackedHeadPosition(),this.mode==='explore'?this.body?.translation():undefined);}
 private allowedWalkingPosition(center:{x:number;y:number;z:number},crouched=false){return this.allowedPosition(center,crouched?.3:.6,.24)&&(this.renderer.xr.isPresenting||this.allowedPosition({x:center.x,y:center.y+this.viewHeight-(crouched?1.17:.87),z:center.z},0,.095));}
 private validWalkingPlacement(center:{x:number;y:number;z:number}){
  return this.allowedWalkingPosition(center)&&this.clearXRFeetPosition({x:center.x,y:center.y-.87,z:center.z});
 }
 private clearXRFeetPosition(feet:{x:number;y:number;z:number},radius=this.xrHeadRadius){
  if(!this.renderer.xr.isPresenting)return true;
  const height=this.trackedHeadPosition().y-this.rig.position.y,head={x:feet.x,y:feet.y+height,z:feet.z};
  return this.allowedPosition(head,0,radius)&&!this.world?.intersectionWithShape(head,{x:0,y:0,z:0,w:1},new RAPIER.Ball(radius),undefined,undefined,this.capsule);
 }
 private allowedWalkingHeadMotion(origin:THREE.Vector3,body:{x:number;y:number;z:number},from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}){
  const start=origin.clone().add(new THREE.Vector3(from.x-body.x,from.y-body.y,from.z-body.z)),end=origin.clone().add(new THREE.Vector3(to.x-body.x,to.y-body.y,to.z-body.z)),delta=end.clone().sub(start);
  if(this.pagedCollider&&!this.pagedCollider.allowsMotion(start,end,this.xrHeadRadius))return false;
  if(delta.lengthSq()<1e-12)return true;
  const hit=this.world!.castShape(start,{x:0,y:0,z:0,w:1},delta,new RAPIER.Ball(this.xrHeadRadius),.005,1,false,undefined,undefined,this.capsule);
  return !hit||hit.time_of_impact>=1;
 }
 updateScene(scene:TourScene){
  if(this.active?.id!==scene.id)return;this.active=scene;
  const transform=JSON.stringify(scene.transform),colliderTransform=JSON.stringify(scene.colliderTransform),changed=transform!==this.transformKey||colliderTransform!==this.colliderTransformKey;
  if(changed){if(transform!==this.transformKey){this.spark.lodDirty=true;this.spark.lastPixelLimit=undefined;}apply(this.content,scene.transform);if(this.navigator?.type==='orbit')this.navigator.orbitFrame.copy(this.orbitFrame());for(const group of [this.bubbles,this.viewMarkers]){group.position.copy(this.content.position);group.quaternion.copy(this.content.quaternion);group.scale.copy(this.content.scale);}if(this.collider)apply(this.collider,scene.colliderTransform);this.transformKey=transform;this.colliderTransformKey=colliderTransform;this.rebuildPhysics();this.spark.dirty=true;}
  if(this.sceneResourcesReady&&(this.editing||this.mode!=='jumps')&&scene.collider!==this.colliderSource)this.replaceCollider(scene);
 }
 private replaceCollider(scene:TourScene){
  this.clearCollider();const token=this.generation;this.colliderSource=scene.collider;this.colliderLoading=!!scene.collider;
  const loading=scene.collider?this.loadCollider(scene,token):Promise.resolve(),request=this.colliderGeneration,current=()=>token===this.generation&&request===this.colliderGeneration&&!this.dead;
  this.colliderTransition=(async()=>{
   try{await loading;if(!current())return;if(this.statusScope==='navigation')this.report('');
    if(this.mode==='explore'&&!this.status){if(this.world){this.setMode('explore',true,false);await this.modeTransition;}else{const mode=this.active?.modes.find(mode=>mode!=='explore');if(mode)this.setMode(mode);}}
   }catch(error){if(!current())return;this.clearCollider();this.colliderFailure=error instanceof Error?error.message:String(error);this.report('Collision mesh: '+this.colliderFailure,true,'navigation');}
   finally{if(current())this.colliderLoading=false;}
  })();
 }
 async activateCollider(scene:TourScene){
  this.updateScene(scene);await this.colliderTransition;
  if(this.active?.id!==scene.id||!this.sceneResourcesReady||this.colliderLoading||this.colliderSource!==scene.collider||!this.world||!this.collider||isPagedCollision(scene.collider)&&!this.pagedCollider)throw Error('Collision saved, but could not be activated: '+(this.colliderFailure||'the scene is not ready. Retry loading the scene.'));
 }
 setBackground(value:TourScene['background']){return this.backgroundLayer.load(value,this.base,this.hosting,this.performanceSettings.maxSh);}
 showCollider(show:boolean){this.colliderVisible=show;if(this.collider)this.collider.visible=show;this.pagedCollider?.overview.setVisible(show);if(show)this.pagedCollider?.updateOverview(this.camera,this.host.clientHeight);}
 private facePoint(target:THREE.Vector3){
  const eye=this.camera.getWorldPosition(new THREE.Vector3()),rotation=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye,target,new THREE.Vector3(0,1,0)),'YXZ');
  if(this.renderer.xr.isPresenting){const yaw=new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()),'YXZ').y,angle=rotation.y-yaw,offset=eye.clone().sub(this.rig.position);this.rig.position.add(offset.clone().sub(offset.applyAxisAngle(new THREE.Vector3(0,1,0),angle)));this.rig.rotation.y+=angle;}
  else{this.rig.rotation.set(0,rotation.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(rotation.x,0,0,'YXZ');}
  this.lastSafeHead=undefined;
 }
 applyPerformance(value:PerformanceSettings){const s=PerformanceSettingsSchema.parse(value);this.performanceSettings=s;this.adaptiveDetail.reset();if(this.spark.pagedExtSplats!==s.pagedExtSplats)this.rebuildPrecision(s);const {pixelRatio,maxSh,xrFoveation,lodSplatCount,adaptiveDetail,adaptiveTargetFps,...sparkSettings}=s;Object.assign(this.spark,sparkSettings);this.spark.lodSplatCount=lodSplatCount||undefined;this.quality=s.lodSplatScale;if(!this.renderer.xr.isPresenting)this.renderer.setPixelRatio(Math.min(devicePixelRatio,pixelRatio));this.renderer.xr.setFoveation(xrFoveation);if(this.mesh&&this.mesh.maxSh!==maxSh){this.mesh.maxSh=maxSh;this.mesh.generatorDirty=true;}this.mesh?.updateVersion();this.backgroundLayer.performance(maxSh);this.spark.dirty=true;for(const listener of this.performanceListeners)listener(s);}
 private updateAdaptivePerformance(time:number,frameMs:number,xr:boolean,suspended:boolean,opacity:number){
  if(!this.performanceSettings.adaptiveDetail)return;
  const refresh=(this.renderer.xr.getSession() as (XRSession&{frameRate?:number})|null)?.frameRate,targetFps=xr?(refresh||72):(this.performanceSettings.adaptiveTargetFps??60);
  // Continuous camera refinement can keep the pager busy indefinitely. Judge
  // sustained visible frame cadence, never elapsed download time or pager idle.
  const eligible=this.ready&&!this.loading&&!!this.active&&this.spark.display.numSplats>0&&!document.hidden&&!this.editing&&!this.blocked&&!this.flight&&!this.preparingMode&&!this.colliderLoading&&!suspended&&!this.menuOpen&&!this.currentPage&&opacity===0;
  const scale=this.adaptiveDetail.sample({time,frameMs,targetFps,eligible,context:this.generation+':'+(xr?'xr:'+targetFps:'desktop')});
  const effective=this.performanceSettings.lodSplatScale*scale;if(this.spark.lodSplatScale!==effective){this.spark.lodSplatScale=effective;this.spark.dirty=true;}
 }
 private precisionSnapshot(){return {xrScale:this.appliedXRScale,sceneId:this.active!.id,position:this.rig.position.clone(),quaternion:this.rig.quaternion.clone(),cameraPosition:this.camera.position.clone(),cameraQuaternion:this.camera.quaternion.clone(),mode:this.mode,viewpoint:this.currentViewpoint,navigator:this.navigator,xrOffset:this.viewXROffset.clone(),body:this.body?.translation(),crouched:this.crouched,velocityY:this.velocityY,walkGrounded:this.walking.grounded,walkJumping:this.walking.jumping,walkCameraY:this.walkCamera.y,walkX:this.walkMotion.x,walkZ:this.walkMotion.z,flight:this.flight,at:performance.now(),selected:this.selected?.userData.id,geometry:this.viewGeometry.view,geometryVisible:this.viewGeometry.group.visible,geometryHandle:this.selected?.userData.geometryHandle,wireframe:this.collider?.visible,page:this.currentPage,contentScroll:this.xrContent.offset,contentImage:this.xrContent.focus,menuOpen:this.menuOpen};}
 private async retireSpark(spark:SparkRenderer){
  // Spark's scheduled update/sort promises do not handle worker termination.
  // Stop new work and drain its public worker queue before releasing resources.
  spark.autoUpdate=false;spark.enableDriveLod=false;spark.sortDirty=false;
  if(spark.updateTimeoutId!==undefined){clearTimeout(spark.updateTimeoutId);spark.updateTimeoutId=undefined;}
  if(spark.sortTimeoutId!==undefined){clearTimeout(spark.sortTimeoutId);spark.sortTimeoutId=undefined;}
  const deadline=performance.now()+10000;let deadlineTimer:ReturnType<typeof setTimeout>|undefined;
  await Promise.race([spark.lodWorker?.exclusive(async()=>{}),new Promise(resolve=>{deadlineTimer=setTimeout(resolve,10000);})]);clearTimeout(deadlineTimer);
  while(spark.sorting&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  spark.dispose();
 }
 private rebuildPrecision(settings:PerformanceSettings){
  const sceneId=this.active?.id;let saved=this.precisionRestore;if(saved?.sceneId!==sceneId)saved=undefined;if(!saved&&this.resourcesAvailable&&sceneId)saved=this.precisionSnapshot();this.precisionRestore=saved;
  // The pool encoding is selected when Spark creates its pager. Rebuild Spark's
  // resource owner, while retaining the WebGL renderer, canvas and XR session.
  const generation=++this.generation;this.clearScene();const previousSpark=this.spark;previousSpark.removeFromParent();this.precisionCleanup=Promise.all([this.precisionCleanup,this.retireSpark(previousSpark)]).then(()=>{});this.spark=new SparkRenderer({renderer:this.renderer,maxPagedSplats:8388608,pagedExtSplats:settings.pagedExtSplats});this.scene.add(this.spark);
  if(!sceneId||!this.project){this.performanceTransition=this.precisionCleanup;return;}
  this.report(`Loading ${this.active!.name}…`);const token=generation+1;
  this.performanceTransition=this.precisionCleanup.then(async()=>{if(this.dead||this.generation!==generation)return false;await this.selectScene(sceneId,saved?.viewpoint||this.pendingDestination?.viewpoint,true);return true;}).then(started=>{
   if(!started)return;
   if(this.dead||this.generation!==token||this.active?.id!==sceneId)return;
   if(!saved||!this.resourcesAvailable||this.precisionRestore!==saved){this.precisionRestore=undefined;return;}this.precisionRestore=undefined;
   if(saved.crouched)this.updateCrouch(true,true);this.rig.scale.setScalar(1/saved.xrScale);this.appliedXRScale=saved.xrScale;this.camera.near=.05/saved.xrScale;this.rig.position.copy(saved.position);this.rig.quaternion.copy(saved.quaternion);
   // WebXR owns the tracked camera pose. Only its locomotion rig is restored.
   if(!this.renderer.xr.isPresenting){this.camera.position.copy(saved.cameraPosition);this.camera.quaternion.copy(saved.cameraQuaternion);}
   if(this.body&&saved.body){this.body.setTranslation(saved.body,true);this.world?.step();}this.velocityY=saved.velocityY;this.walking.grounded=saved.walkGrounded;this.walking.jumping=saved.walkJumping;this.walkCamera.reset(saved.walkCameraY);this.walkMotion.x=saved.walkX;this.walkMotion.z=saved.walkZ;this.mode=saved.mode;this.onMode(this.mode);this.currentViewpoint=saved.viewpoint;this.navigator=saved.navigator;this.viewXROffset.copy(saved.xrOffset);this.onViewpoint(this.currentViewpoint);
   this.flight=saved.flight;if(this.flight)this.flight.start+=performance.now()-saved.at;this.showCollider(!!saved.wireframe);this.showViewGeometry(saved.geometryVisible?saved.geometry:undefined);if(saved.geometryHandle){const handle=this.viewGeometry.handles().find(object=>object.userData.geometryHandle===saved.geometryHandle);if(handle){this.selected=handle;this.gizmo.attach(handle);}}else if(saved.selected)this.selectHotspot(saved.selected);
   this.currentPage=saved.page;this.xrContent.page=saved.page;this.xrContent.offset=saved.contentScroll;this.xrContent.focus=saved.contentImage;this.menuOpen=saved.menuOpen;this.refreshHud();
  }).catch(error=>{if(this.generation===token&&!this.dead)this.report(String(error),true);});
 }
 setQuality(q:number){this.applyPerformance({...this.performanceSettings,lodSplatScale:q});}
 setTouch(x:number,y:number){if(Math.abs(x)+Math.abs(y)>.01)this.navigator?.takeControl();this.touch.set(THREE.MathUtils.clamp(x,-1,1),THREE.MathUtils.clamp(y,-1,1));}
 private get walkEyeHeight(){return this.viewHeight-(this.crouched?.6:0);}
 setViewHeight(value:number){if(!Number.isFinite(value))return;const next=THREE.MathUtils.clamp(value,1,2.4),delta=next-this.viewHeight;this.viewHeight=next;if(this.mode==='explore'&&!this.renderer.xr.isPresenting){this.rig.position.y+=delta;this.walkCamera.reset(this.rig.position.y);}}
 setStepHeight(value?:number){const height=normalizeStepHeight(value);if(height===this.stepHeight)return;this.stepHeight=height;this.walking.reset();if(this.character)configureWalkingController(this.character);if(this.pagedCollider)this.configurePagedNavigation();else if(this.collider){this.content.updateMatrixWorld(true);const parts:{positions:Float32Array;indices:Uint32Array}[]=[];this.collider.traverse(o=>{if(o instanceof THREE.Mesh){const position=o.geometry.getAttribute('position');if(position)parts.push({positions:collisionVertices(position,o.matrixWorld),indices:o.geometry.index?new Uint32Array(o.geometry.index.array):Uint32Array.from({length:position.count},(_,i)=>i)});}});this.routes.build(parts,{stepHeight:height});}}
 setTouchLift(value:number){this.touchLift=value;}
 setTouchCrouch(value:boolean){this.touchCrouch=value;}
 requestJump(){if(this.mode==='explore'&&!this.blocked){this.jumpRequested=true;this.routes.cancel();}}
 private updateCrouch(wanted:boolean,force=false){if(wanted===this.crouched||!this.world||!this.body||!this.capsule)return;const old=this.body.translation(),delta=wanted?-.3:.3,center={x:old.x,y:old.y+delta,z:old.z};if(!wanted&&!force&&(!this.allowedWalkingPosition(center)||this.world.intersectionWithShape(center,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.58,.24),undefined,undefined,this.capsule)))return;this.capsule.setShape(new RAPIER.Capsule(wanted?.3:.6,.25));this.body.setTranslation(center,true);this.world.step();this.rig.position.y+=wanted?-.6:.6;this.crouched=wanted;this.walking.reset();this.walkCamera.reset(this.rig.position.y);}

 setEditing(editing:boolean){if(this.editing===editing)return;if(!editing){this.pendingPick=false;this.cancelCollisionShapePick();this.cancelViewGeometryPick();}this.stopFlight();this.walkMotion.reset();if(!editing&&this.navigator){const pose=this.navigator.pose(),point=this.content.localToWorld(new THREE.Vector3(...pose.position)),rotation=this.content.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotation[0],pose.rotation[1],pose.rotation[2],'YXZ')));if(point.distanceTo(this.camera.getWorldPosition(new THREE.Vector3()))>.03||rotation.angleTo(this.camera.getWorldQuaternion(new THREE.Quaternion()))>.03){this.navigator=undefined;this.currentViewpoint='';this.onViewpoint('');}}this.editing=editing;}
 setMode(mode:Mode,reset=false,walkingStart=reset,prepared=false){
  if(!this.active?.modes.includes(mode)){this.report('This navigation mode is disabled for this scene.',true,'navigation');return;}
  this.navigationFailure=false;
  if(mode!=='jumps'&&this.active.collider&&!this.world&&!this.editing&&!prepared){this.modeTransition=this.prepareColliderMode(mode,reset,walkingStart);return;}
  if(this.pagedCollider&&!this.editing&&mode!=='jumps'&&!prepared){this.modeTransition=this.prepareMovement(mode,reset,walkingStart);return;}
  if(mode==='jumps'){++this.modeRequest;this.preparingMode=false;}
  if(mode===this.mode&&!reset){this.report('');this.refreshHud();return;}
  if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();this.pointerMove.set(0,0,0);this.stopFlight();this.walking.reset();this.walkCamera.reset();this.walkMotion.reset();this.routes.cancel();this.cancelTeleport();this.jumpRequested=false;this.navigator?.takeControl();
  const previousView=this.currentViewpoint;
  if(mode==='explore'){
   if(!this.world||!this.character||!this.body||!this.capsule){this.report('Walk requires a loaded collision mesh.',true,'navigation');return;}
   this.syncXRScale('');const start=this.active.viewpoints.find(p=>p.id===this.active!.walkStart),fallback=start?this.content.localToWorld(v(start.position)):undefined;
   const eye=this.trackedHeadPosition();let feet=nearbyWalkingFeet(this.world,walkingStart&&fallback?fallback:eye,this.viewHeight,this.capsule,3,p=>this.validWalkingPlacement(p));
   if(!feet&&fallback)feet=nearbyWalkingFeet(this.world,fallback,this.viewHeight,this.capsule,3,p=>this.validWalkingPlacement(p));
   if(!feet){this.syncXRScale(previousView);this.report('No valid walking position nearby or at the walking start.',true,'navigation');return;}
   this.updateCrouch(false,true);this.placeFeet(new THREE.Vector3(feet.x,feet.y,feet.z));this.currentViewpoint='';this.onViewpoint('');
  }else if(mode==='fly'){
   this.syncXRScale('');const eye=this.trackedHeadPosition();this.crouched=false;this.capsule?.setShape(new RAPIER.Capsule(.6,.25));this.velocityY=0;this.lastSafeHead=undefined;
   const destination=this.world?nearbyFlyPosition(this.world,eye,this.capsule,p=>this.editing||this.allowedPosition(p,0,this.flyRadius),this.flyRadius):eye;if(!destination&&this.world){this.syncXRScale(previousView);this.report('Choose a view inside the navigable area before entering Drone.',true,'navigation');return;}if(destination)this.rig.position.add(new THREE.Vector3(destination.x-eye.x,destination.y-eye.y,destination.z-eye.z));this.navigator=undefined;this.currentViewpoint='';this.onViewpoint('');
  }else{this.updateCrouch(false,true);this.velocityY=0;this.lastSafeHead=undefined;}
  this.mode=mode;this.onMode(mode);this.report('');
  if(mode==='jumps'){const remembered=this.lastViewpoints.get(this.active.id),target=this.active.viewpoints.find(p=>p.id===remembered)||this.active.viewpoints.find(p=>p.id===this.active!.entry)||this.active.viewpoints[0];if(target)this.jump(target.id);}
  this.refreshHud();
 }
 private async prepareColliderMode(mode:Mode,reset:boolean,walkingStart:boolean){
  const generation=this.generation,request=++this.modeRequest;this.preparingMode=true;
  try{await this.loadInitialCollider(this.active!.id,generation,()=>{});if(generation!==this.generation||request!==this.modeRequest||this.dead)return;if(!this.world){this.report('Navigation area: '+(this.colliderFailure||'Collision data is unavailable.'),true,'navigation');return;}if(this.pagedCollider)await this.prepareMovement(mode,reset,walkingStart);else this.setMode(mode,reset,walkingStart,true);}
  finally{if(generation===this.generation&&request===this.modeRequest)this.preparingMode=false;}
 }
 private async prepareMovement(mode:Mode,reset:boolean,walkingStart:boolean){
  const paged=this.pagedCollider!,token=++this.modeRequest,leases:{release():void}[]=[];this.preparingMode=true;this.focusCollision(paged);
  try{const eye=this.trackedHeadPosition(),start=this.active?.viewpoints.find(view=>view.id===this.active?.walkStart),fallback=start?this.content.localToWorld(v(start.position)):undefined;leases.push(await paged.prepare(eye,4));if(mode==='explore'&&fallback&&(walkingStart||!nearbyWalkingFeet(this.world!,eye,this.viewHeight,this.capsule,3,p=>this.validWalkingPlacement(p))))leases.push(await paged.prepare(fallback,4));if(token!==this.modeRequest||paged!==this.pagedCollider||this.dead)return;this.setMode(mode,reset,walkingStart,true);}
  catch(error){if(token===this.modeRequest&&!this.dead)this.report('Navigation area: '+String(error),true,'navigation');}
  finally{this.focusCollision(paged);for(const lease of leases)lease.release();if(token===this.modeRequest)this.preparingMode=false;}
 }
 private stopFlight(){if(!this.flight)return;this.flight=undefined;this.navigator=undefined;this.thumbnailPending=undefined;const eye=this.camera.getWorldPosition(new THREE.Vector3());if(this.body)this.body.setTranslation({x:eye.x,y:eye.y-.85,z:eye.z},true);}
 private placeFeet(point:THREE.Vector3){this.walking.reset();this.walkCamera.reset();this.walkMotion.reset();this.stopFlight();this.navigator=undefined;this.lastSafeHead=undefined;const xr=this.renderer.xr.isPresenting;const offset=xr?this.trackedHeadPosition().sub(this.rig.position):new THREE.Vector3();this.rig.position.set(point.x-(xr?offset.x:0),point.y+(xr?0:this.walkEyeHeight),point.z-(xr?offset.z:0));if(this.body){this.body.setTranslation({x:point.x,y:point.y+(this.crouched?.57:.87),z:point.z},true);this.world?.step();}this.velocityY=0;this.focusCollision();}
 jump(id:string,animate=true,coverageReady=false,silent=false){if(this.collisionMovementBlocked&&!coverageReady)return;if(this.pagedCollider&&!this.editing&&this.resourcesAvailable&&this.mode!=='jumps'&&!coverageReady){void this.jumpInMovement(id);return;}this.walking.reset();this.walkCamera.reset();this.walkMotion.reset();this.lastSafeHead=undefined;const saved=this.active?.viewpoints.find(x=>x.id===id);if(!saved)return;this.navigator=(this.mode==='jumps'&&this.active?.modes.includes('jumps')||this.editing)?new ViewNavigation(saved,this.orbitFrame()):undefined;if(this.renderer.xr.isPresenting)this.navigator?.takeControl();const pose=this.navigator?.pose()||saved;const p={...saved,...pose} as Viewpoint;this.thumbnailPending=this.editing?{id,after:performance.now()+1100}:undefined;this.updateCrouch(false,true);this.routes.cancel();this.cancelTeleport();this.syncXRScale(id);const pt=this.content.localToWorld(v(p.position));const q=this.content.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation,'YXZ')));const e=new THREE.Euler().setFromQuaternion(q,'YXZ');const xr=this.renderer.xr.isPresenting,offset=xr?this.trackedHeadPosition().sub(this.rig.position):new THREE.Vector3();const to=pt.clone();if(xr){this.viewXROffset.copy(offset).applyQuaternion(this.rig.quaternion.clone().invert());this.viewXROffset.y=0;const anchor=this.viewXROffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),e.y);to.x-=anchor.x;to.z-=anchor.z;to.y-=this.xrEyeHeight;}animate=animate&&(!xr||this.xrFly);if(xr&&!animate)this.fadeUntil=performance.now()+220;const toYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),e.y);this.flight=animate?{start:performance.now(),duration:THREE.MathUtils.clamp(this.rig.position.distanceTo(to)*100,850,2600),from:this.rig.position.clone(),to,fromYaw:this.rig.quaternion.clone(),toYaw,pitch:this.camera.rotation.x,targetPitch:e.x}:undefined;if(!animate){this.rig.position.copy(to);this.rig.quaternion.copy(toYaw);if(!xr){this.camera.position.set(0,0,0);this.camera.rotation.set(e.x,0,0,'YXZ');}if(this.body)this.body.setTranslation({x:pt.x,y:pt.y-.85,z:pt.z},true);}this.currentViewpoint=id;if(this.active)this.lastViewpoints.set(this.active.id,id);this.onViewpoint(id);this.descriptionLabel&&releaseUI(this.descriptionLabel);this.descriptionLabel=(p.description||p.extendedDescription?.enabled)?panel(p.extendedDescription?.enabled?'About this view · '+p.name:p.description!.length>180?p.description!.slice(0,160)+'… · Read more':p.description!,1.8,.4):undefined;if(this.descriptionLabel){this.descriptionLabel.renderOrder=110;this.descriptionLabel.userData.action=()=>this.openViewDetails();this.overlay.add(this.descriptionLabel);}if(!this.editing&&!silent)this.audio.setViewpoint(p.audio,this.base);}

 private async jumpInMovement(id:string){
  const saved=this.active?.viewpoints.find(view=>view.id===id),paged=this.pagedCollider;if(!saved||!paged)return;const token=++this.modeRequest,mode=this.mode;let lease:{release():void}|undefined;this.preparingMode=true;this.routes.cancel();this.stopFlight();this.focusCollision(paged);
  try{const pose=new ViewNavigation(saved,this.orbitFrame()).pose(),eye=this.content.localToWorld(new THREE.Vector3(...pose.position));lease=await paged.prepare(eye,4);if(token!==this.modeRequest||paged!==this.pagedCollider||mode!==this.mode||this.dead)return;
   const feet=mode==='explore'?nearbyWalkingFeet(this.world!,eye,this.viewHeight,this.capsule,3,p=>this.validWalkingPlacement(p)):undefined;
   const destination=mode==='fly'?nearbyFlyPosition(this.world!,eye,this.capsule,p=>this.allowedPosition(p,0,this.flyRadius),this.flyRadius):undefined;if(!feet&&!destination)return;
   this.jump(id,false,true);if(feet)this.placeFeet(new THREE.Vector3(feet.x,feet.y,feet.z));else if(destination){const current=this.trackedHeadPosition();this.rig.position.add(new THREE.Vector3(destination.x-current.x,destination.y-current.y,destination.z-current.z));}this.fadeUntil=performance.now()+220;
  }catch(error){if(token===this.modeRequest&&!this.dead)this.report('View navigation: '+String(error),true,'navigation');}finally{this.focusCollision(paged);lease?.release();if(token===this.modeRequest)this.preparingMode=false;}
 }
 private orbitFrame(){return this.content.getWorldQuaternion(new THREE.Quaternion()).invert();}
 private steerView(pose:{position:number[];rotation:number[]}){if(!this.flight){this.applyViewPose(pose);return;}const point=this.content.localToWorld(new THREE.Vector3(...pose.position)),q=this.content.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotation[0],pose.rotation[1],pose.rotation[2],'YXZ'))),e=new THREE.Euler().setFromQuaternion(q,'YXZ');if(this.renderer.xr.isPresenting){const offset=this.viewXROffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),e.y);point.x-=offset.x;point.z-=offset.z;point.y-=this.xrEyeHeight;}this.flight.to.copy(point);this.flight.toYaw.setFromAxisAngle(new THREE.Vector3(0,1,0),e.y);this.flight.targetPitch=e.x;}
 private applyViewPose(pose:{position:number[];rotation:number[]}){const position=this.content.localToWorld(new THREE.Vector3(...pose.position)),q=this.content.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotation[0],pose.rotation[1],pose.rotation[2],'YXZ'))),e=new THREE.Euler().setFromQuaternion(q,'YXZ');if(this.renderer.xr.isPresenting){const offset=this.viewXROffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),this.rig.rotation.y);this.rig.position.set(position.x-offset.x,position.y-this.xrEyeHeight,position.z-offset.z);}else{this.rig.position.copy(position);this.rig.rotation.set(0,e.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(e.x,0,0,'YXZ');}}
 // Resource restoration and destination preparation finish before the first paint.
 private get resourcesAvailable(){return !this.status&&!!this.mesh?.parent;}
 get ready(){return this.sceneResourcesReady&&this.resourcesAvailable&&!this.loading&&!this.firstDisplay;}
 frameViewGeometry(){const view=this.viewGeometry.view;if(!view)return;this.stopFlight();this.navigator=undefined;this.thumbnailPending=undefined;const center=view.type==='orbit'&&view.orbit?view.orbit.center:view.type==='slider'&&view.slider?view.slider.origin:view.position;const size=view.orbit?.radius||Math.max(...view.slider?.bounds||[1,1]);const offset=new THREE.Vector3(.85,.6,1.5).multiplyScalar(size*1.5);if(view.type==='orbit')offset.applyQuaternion(this.orbitFrame());const target=this.content.localToWorld(new THREE.Vector3(...center)),position=this.content.localToWorld(new THREE.Vector3(...center).add(offset)),matrix=new THREE.Matrix4().lookAt(position,target,new THREE.Vector3(0,1,0)),e=new THREE.Euler().setFromRotationMatrix(matrix,'YXZ');this.rig.position.copy(position);this.rig.rotation.set(0,e.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(e.x,0,0,'YXZ');this.currentViewpoint='';this.onViewpoint('');}
 showViewGeometry(view?:Viewpoint){const previous=this.viewGeometry.view?.id,selected=this.selected?.userData.geometryHandle;this.viewGeometry.rebuild(view,this.orbitFrame());this.viewGeometry.group.visible=!!view&&this.editing;if(!view){if(this.selected?.userData.geometryHandle){this.gizmo.detach();this.selected=undefined;}this.cancelViewGeometryPick();return;}if(!this.editing)return;if(previous!==view.id)this.geometryTool='translate';const handle=(previous===view.id&&selected?this.viewGeometry.handles().find(h=>h.name===selected):undefined)||this.viewGeometry.primary();if(handle)this.attachGizmo(handle,handle.name==='plane'||handle.name==='position'?this.geometryTool:'translate');}
 setGeometryTool(mode:'translate'|'rotate'){this.geometryTool=mode;const primary=this.viewGeometry.primary();if(primary)this.attachGizmo(primary,mode);}
 private turnXR(angle:number){this.navigator?.takeControl();const head=this.trackedHeadPosition();const offset=head.clone().sub(this.rig.position);const delta=offset.clone().sub(offset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle));this.rig.position.add(delta);this.rig.rotation.y+=angle;this.rig.updateMatrixWorld(true);/* Turning around the tracked head leaves the world-space feet unchanged. */}
 capture():Viewpoint{this.scene.updateMatrixWorld(true);const p=this.content.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3()));const q=this.content.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.camera.getWorldQuaternion(new THREE.Quaternion()));const e=new THREE.Euler().setFromQuaternion(q,'YXZ');return {thumbnail:this.thumbnail(),id:crypto.randomUUID(),name:'New viewpoint',position:p.toArray() as Vec3,rotation:[e.x,e.y,e.z]};}
 thumbnail(){if(!this.renderer.xr.isPresenting){const helper=this.gizmo.getHelper(),geo=this.viewGeometry.group,states=[helper.visible,geo.visible,this.collider?.visible];helper.visible=false;geo.visible=false;if(this.collider)this.collider.visible=false;this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);helper.visible=states[0]!;geo.visible=states[1]!;if(this.collider)this.collider.visible=states[2]!;}const source=this.renderer.domElement,canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const context=canvas.getContext('2d')!;const scale=Math.max(320/source.width,180/source.height);context.drawImage(source,(320-source.width*scale)/2,(180-source.height*scale)/2,source.width*scale,source.height*scale);return canvas.toDataURL('image/jpeg',.7);}
 private attachGizmo(object:THREE.Object3D,mode:'translate'|'rotate'|'scale',axis?:number){this.selected=object;this.gizmo.setSpace(axis!==undefined||mode==='rotate'?'local':'world');this.gizmo.showX=axis===undefined||axis===0;this.gizmo.showY=axis===undefined||axis===1;this.gizmo.showZ=axis===undefined||axis===2;this.gizmo.setMode(mode);this.gizmo.attach(object);}
 pickViewGeometry(id:string){this.cancelCollisionShapePick();this.pendingPick=false;this.viewPick=id;this.gizmo.enabled=false;}
 cancelViewGeometryPick(){this.viewPick='';this.gizmo.enabled=!this.collisionPick&&!this.pendingPick;this.onViewPickCancel();}
 updateViewFromCamera(view:Viewpoint):Partial<Viewpoint>{this.stopFlight();const camera=this.capture();this.navigator=undefined;this.thumbnailPending=undefined;this.currentViewpoint='';this.onViewpoint('');return viewFromCamera(view,camera,this.orbitFrame()) as Partial<Viewpoint>;}
 pointInFront():Vec3{const p=this.camera.getWorldPosition(new THREE.Vector3()).add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));return this.content.worldToLocal(p).toArray() as Vec3;}
 setCollisionSelection(sceneId:string,volumes:CollisionVolume[],selected:string,mode:'translate'|'rotate'|'scale'='translate'){if(this.selectionRequest?.mode!==mode&&this.selected?.userData.collisionFace){this.gizmo.detach();this.selected=undefined;}this.selectionRequest={sceneId,volumes,selected,mode};this.refreshCollisionSelection();}
 getSelectedCollisionVolume():CollisionVolume|undefined{return this.selected?.userData.collisionVolume;}
 frameCollisionSelection(){const volume=this.getSelectedCollisionVolume();if(!volume)return;this.stopFlight();this.navigator=undefined;this.thumbnailPending=undefined;this.routes.cancel();const target=this.content.localToWorld(new THREE.Vector3(...volume.position)),offset=this.camera.getWorldPosition(new THREE.Vector3()).sub(target),size=(volume.type==='ball'?volume.size[0]:Math.max(...volume.size)*.5)*this.content.scale.x;if(offset.lengthSq()<.001)offset.copy(this.camera.getWorldDirection(new THREE.Vector3())).negate();const position=target.clone().add(offset.normalize().multiplyScalar(Math.max(2,size*3))),matrix=new THREE.Matrix4().lookAt(position,target,new THREE.Vector3(0,1,0)),euler=new THREE.Euler().setFromRotationMatrix(matrix,'YXZ');this.rig.position.copy(position);this.rig.rotation.set(0,euler.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(euler.x,0,0,'YXZ');this.currentViewpoint='';this.onViewpoint('');}
 clearCollisionSelection(){this.selectionRequest=undefined;this.collisionPick=undefined;if(this.selected?.userData.collisionVolume){this.gizmo.detach();this.gizmo.setMode('translate');this.selected=undefined;}this.collisionSelection.clear();}
 pickCollisionShape(type:'ball'|'box',operation:'add'|'remove'){this.cancelViewGeometryPick();this.pendingPick=false;this.collisionPick={type,operation};this.gizmo.enabled=false;}
 cancelCollisionShapePick(){this.collisionPick=undefined;this.gizmo.enabled=!this.viewPick&&!this.pendingPick;this.onCollisionPickCancel();}
 private refreshCollisionSelection(){const request=this.selectionRequest;if(!this.editing||!request||request.sceneId!==this.active?.id){this.collisionSelection.clear();return;}const old=this.selected?.userData.collisionFace,oldId=this.selected?.userData.collisionVolume?.id,object=this.collisionSelection.rebuild(request.volumes,this.mesh,request.selected,true);this.collisionSelection.group.visible=true;const face=old&&oldId===request.selected?this.collisionSelection.wallHandles().find(node=>node.userData.collisionFace.axis===old.axis&&node.userData.collisionFace.sign===old.sign):undefined;if(face)this.attachGizmo(face,'translate',old.axis);else if(object)this.attachGizmo(object,request.mode);else if(this.selected?.userData.collisionVolume){this.gizmo.detach();this.selected=undefined;}}
 pickNext(){this.cancelViewGeometryPick();this.cancelCollisionShapePick();this.pendingPick=true;this.gizmo.enabled=false;}
 selectHotspot(id:string){this.selected=this.bubbles.children.find(c=>c.userData.id===id);if(this.selected&&this.editing)this.attachGizmo(this.selected,'translate');else this.gizmo.detach();}
 syncHotspots(){
  const existing=new Map(this.bubbles.children.map(object=>[object.userData.id,object]));
  for(const hotspot of this.active?.hotspots||[]){
   const appearance=bubbleAppearance(resolveBubbleSettings(this.project,this.active),hotspot.size),symbol=hotspot.kind==='page'?'info':hotspot.kind==='scene'?'scene':'viewpoint',title=bubbleLabel(hotspot,this.project,this.active);
   let object=existing.get(hotspot.id) as THREE.Mesh|undefined;
   if(object)updateBadge(object,symbol,title,appearance.glassOpacity);else{object=badge(symbol,title,false,'content',appearance.glassOpacity);this.bubbles.add(object);}
   object.position.fromArray(hotspot.position);object.userData.id=hotspot.id;object.userData.hotspot=hotspot;existing.delete(hotspot.id);
  }
  for(const object of existing.values()){if(this.selected===object){this.gizmo.detach();this.selected=undefined;}if(this.hovered===object)this.hovered=undefined;releaseUI(object);}
 }
 rebuildHotspots(){this.syncHotspots();this.rebuildMarkers();}
 frameHotspot(id:string){const object=this.bubbles.children.find(child=>child.userData.id===id);if(!object)return;this.stopFlight();this.navigator=undefined;this.thumbnailPending=undefined;this.routes.cancel();this.scene.updateMatrixWorld(true);this.overlay.updateMatrixWorld(true);const target=object.getWorldPosition(new THREE.Vector3()),offset=this.camera.getWorldPosition(new THREE.Vector3()).sub(target);if(offset.lengthSq()<.001)offset.copy(this.camera.getWorldDirection(new THREE.Vector3())).negate();const position=target.clone().add(offset.normalize().multiplyScalar(3)),matrix=new THREE.Matrix4().lookAt(position,target,new THREE.Vector3(0,1,0)),rotation=new THREE.Euler().setFromRotationMatrix(matrix,'YXZ');this.rig.position.copy(position);this.rig.rotation.set(0,rotation.y,0);this.camera.position.set(0,0,0);this.camera.rotation.set(rotation.x,0,0,'YXZ');if(this.body)this.body.setTranslation({x:position.x,y:position.y-.85,z:position.z},true);this.currentViewpoint='';this.onViewpoint('');}
 rebuildMarkers(){for(const o of [...this.viewMarkers.children])releaseUI(o);this.viewMarkers.visible=false;}
 private pointerRay(e:PointerEvent){const b=this.renderer.domElement.getBoundingClientRect();this.ray.near=0;this.ray.far=Infinity;this.ray.setFromCamera(document.pointerLockElement===this.renderer.domElement?new THREE.Vector2():new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),this.camera);}
 private controllerRay(controller:THREE.Object3D){this.ray.set(controller.getWorldPosition(new THREE.Vector3()),new THREE.Vector3(0,0,-1).applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion())));this.ray.near=0;this.ray.far=30;}
 private updateBubbleVisibility(object:THREE.Object3D,cameraPosition:THREE.Vector3){const position=object.getWorldPosition(new THREE.Vector3()),distance=position.distanceTo(cameraPosition),reveal=this.editing&&object===this.selected,appearance=bubbleAppearance(resolveBubbleSettings(this.project,this.active),object.userData.hotspot?.size,distance,reveal),occlusion=this.bubbleOcclusion.get(object);if(!reveal&&resolveBubbleSettings(this.project,this.active).occlusion!==false&&occlusion?.hidden&&occlusion.point.distanceToSquared(position)<.0001&&occlusion.eye.distanceToSquared(cameraPosition)<.25){appearance.visibility=0;appearance.interactive=false;}badgeVisibility(object,appearance.visibility);return {appearance,distance};}
 private checkBubbleOcclusion(point:THREE.Vector3,eye:THREE.Vector3){
  if(!this.occlusionRayBlocked(point,eye))return false;
  // A marker is partially visible if any of its small surrounding probes clears
  // rough ground or a mesh edge. Keep the extra work bounded and cached below.
  const radius=THREE.MathUtils.clamp(point.distanceTo(eye)*.02,.22,.55),side=point.clone().sub(eye).cross(new THREE.Vector3(0,1,0)).normalize().multiplyScalar(radius);
  for(const offset of [new THREE.Vector3(0,radius,0),side,side.clone().negate()])if(!this.occlusionRayBlocked(point.clone().add(offset),eye))return false;
  return true;
 }
 private occlusionRayBlocked(point:THREE.Vector3,eye:THREE.Vector3){
  const distance=point.distanceTo(eye),limit=bubbleOcclusionLimit(distance);if(limit<=.15)return false;
  const direction=point.clone().sub(eye).normalize();
  if(this.world){const hit=this.world.castRay(new RAPIER.Ray(eye.clone().addScaledVector(direction,.1),direction),Math.max(0,limit-.1),true,undefined,undefined,this.capsule);if(hit)return true;}
  const mesh=this.mesh;if(!mesh?.parent||!mesh.visible)return false;const indices=mesh.raycastIndices;
  // Spark rounds its reduced set to zero for very small scenes. Such scenes
  // can use the loaded LoD set directly without removing the large-scene bound.
  if(mesh.paged&&(!indices||indices.numSplats===0)&&mesh.paged.numSplats>25000)return false;
  this.occlusionRay.set(eye,direction);this.occlusionRay.near=.15;this.occlusionRay.far=limit;const hits:{distance:number;point:THREE.Vector3;object:THREE.Object3D}[]=[],opacity=mesh.minRaycastOpacity;
  try{mesh.minRaycastOpacity=.55;if(indices?.numSplats===0)mesh.raycastIndices=undefined;mesh.raycast(this.occlusionRay,hits);return hits.some(hit=>hit.distance>=.15&&hit.distance<limit);}finally{mesh.minRaycastOpacity=opacity;mesh.raycastIndices=indices;}
 }
 private updateBubbleOcclusion(eye:THREE.Vector3,time:number){
  if(resolveBubbleSettings(this.project,this.active).occlusion===false||!this.bubbles.children.length||(!this.world&&!this.mesh))return;
  // Spark maintains a reduced LoD raycast set for paged scenes. Reuse that set
  // instead of asking for a full-resolution readback or walking millions of splats.
  const objects=this.bubbles.children,forward=this.camera.getWorldDirection(new THREE.Vector3()),started=performance.now();let checks=0;
  for(let scanned=0;scanned<objects.length&&checks<2&&performance.now()-started<2;scanned++){
   const object=objects[this.occlusionCursor++%objects.length];if(this.editing&&object===this.selected)continue;
   const point=object.getWorldPosition(new THREE.Vector3()),offset=point.clone().sub(eye),distance=offset.length();if(offset.dot(forward)<=0||bubbleAppearance(resolveBubbleSettings(this.project,this.active),object.userData.hotspot?.size,distance).visibility===0)continue;
   const previous=this.bubbleOcclusion.get(object);if(previous&&time-previous.at<180&&previous.eye.distanceToSquared(eye)<.0004&&previous.point.distanceToSquared(point)<.000004)continue;
   const blocked=this.checkBubbleOcclusion(point,eye),same=previous&&previous.eye.distanceToSquared(eye)<.25&&previous.point.distanceToSquared(point)<.0001,blockedCount=blocked?Math.min(2,(same?previous.blockedCount:0)+1):0;
   this.bubbleOcclusion.set(object,{at:time,eye:eye.clone(),point,hidden:blockedCount>=2,blockedCount});checks++;
  }
 }
 private hitUI(){this.overlay.updateMatrixWorld(true);if(this.hud.visible){const hit=this.ray.intersectObjects(this.hud.children,false).find(h=>h.object.visible&&this.xrContent.accepts(h));if(hit)return hit.object;}const cameraPosition=this.camera.getWorldPosition(new THREE.Vector3()),bubbles=this.bubbles.children.filter(object=>this.updateBubbleVisibility(object,cameraPosition).appearance.interactive),objects=[...bubbles,...(this.viewMarkers.visible?this.viewMarkers.children:[]),...(this.wristMenu.visible?[this.wristMenu]:[]),...(this.descriptionLabel?.visible?[this.descriptionLabel]:[])];return this.ray.intersectObjects(objects,false).find(h=>h.object.visible)?.object;}
 private highlight(object?:THREE.Object3D){for(const child of this.hud.children)if(child instanceof THREE.Mesh&&child.userData.action)(child.material as THREE.MeshBasicMaterial).color.set(child===object?'#bfdaed':'#ffffff');if(this.hovered!==object){this.hovered=object;this.renderer.domElement.style.cursor=object?'pointer':this.mode==='explore'?'crosshair':'grab';}for(const root of [...this.bubbles.children,...this.viewMarkers.children,this.wristMenu])for(const c of root.children)if(c.userData.caption)c.visible=root===object||(this.editing&&root===this.selected);}
 private activate(object:THREE.Object3D){if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();const data=object.userData;if(data.action){data.action();return;}if(data.viewpoint){this.jump(data.viewpoint);return;}const h=data.hotspot as Hotspot|undefined;if(!h)return;this.routes.cancel();if(this.editing){this.selectHotspot(h.id);this.onSelect(h.id);}else if(h.kind==='scene')void this.selectScene(h.target,h.viewpoint);else if(h.kind==='viewpoint')this.jump(h.target);else{const page=this.project?.pages.find(p=>p.id===h.target);if(page){const content={...page,title:h.label};this.currentPage=content;if(this.renderer.xr.isPresenting){this.menuOpen=true;this.refreshHud(true);}else this.onPage(content);}}}
 private click(e:PointerEvent){this.pointerRay(e);if(this.editing&&this.viewPick){const view=this.active?.viewpoints.find(v=>v.id===this.viewPick),hit=this.mesh?this.ray.intersectObject(this.mesh)[0]:undefined;if(view&&hit){const point=this.content.worldToLocal(hit.point).toArray();this.onViewGeometry(view.id,moveViewGeometry(view,point) as Partial<Viewpoint>);this.cancelViewGeometryPick();this.onStatus('View geometry placed.');}return;}if(this.editing&&this.collisionPick){const pick=this.collisionPick;this.collisionPick=undefined;this.gizmo.enabled=true;const hit=this.mesh?this.ray.intersectObject(this.mesh)[0]:undefined;this.onCollisionPlace(hit?this.content.worldToLocal(hit.point).toArray() as Vec3:this.pointInFront(),pick.type,pick.operation);return;}if(this.editing&&this.selectionRequest&&!this.pendingPick){const face=this.ray.intersectObjects(this.collisionSelection.wallHandles(),false)[0];if(face){this.attachGizmo(face.object,'translate',face.object.userData.collisionFace.axis);this.onCollisionSelect(face.object.userData.collisionVolume.id);return;}const hit=this.ray.intersectObjects(this.collisionSelection.shapes.children,true).find(hit=>hit.object instanceof THREE.Mesh);if(hit){this.onCollisionSelect(hit.object.parent!.name);return;}}if(this.editing&&this.viewGeometry.group.visible){const geometryHit=this.ray.intersectObjects(this.viewGeometry.handles(),false)[0];if(geometryHit){this.attachGizmo(geometryHit.object,'translate');return;}}if(this.pendingPick){this.pendingPick=false;this.gizmo.enabled=true;const hit=this.mesh?this.ray.intersectObject(this.mesh)[0]:undefined;this.onPick(hit?this.content.worldToLocal(hit.point).toArray() as Vec3:this.pointInFront());return;}const hit=this.hitUI();if(hit){this.activate(hit);return;}if(this.mode==='explore'&&!this.blocked&&!this.status){if(this.pagedCollider){this.walkTo(this.ray.ray.origin.clone(),this.ray.ray.clone());return;}const ground=this.world?.castRayAndGetNormal(new RAPIER.Ray(this.ray.ray.origin,this.ray.ray.direction),100,true,undefined,undefined,this.capsule);const splatHit=!ground&&this.mesh?this.ray.intersectObject(this.mesh)[0]:undefined;let point=ground?this.ray.ray.at(ground.timeOfImpact,new THREE.Vector3()):splatHit?.point;if(point&&(!ground||ground.normal.y<Math.SQRT1_2)){const probe=point.clone();if(ground)probe.addScaledVector(new THREE.Vector3(ground.normal.x,0,ground.normal.z).normalize(),.28);probe.y+=.2;const feet=this.body?this.body.translation().y-(this.crouched?.55:.85):point.y,drop=Math.max(.4,Math.min(6,probe.y-feet+this.stepHeight+.25));const floor=this.world?.castRayAndGetNormal(new RAPIER.Ray(probe,{x:0,y:-1,z:0}),drop,true,undefined,undefined,this.capsule);point=floor&&floor.normal.y>=Math.SQRT1_2?probe.add(new THREE.Vector3(0,-floor.timeOfImpact,0)):undefined;}if(point)this.walkTo(point);}}
 walkTo(point:THREE.Vector3,clickRay?:THREE.Ray){if(this.mode!=='explore'||!this.body)return;this.routeStall=0;
  if(this.pagedCollider){const paged=this.pagedCollider;this.routes.cancel();const request=this.routes.selectionRevision,generation=this.generation;this.focusCollision(paged);void(async()=>{let lease:{release():void}|undefined;try{const current=()=>paged===this.pagedCollider&&generation===this.generation&&request===this.routes.selectionRevision&&this.mode==='explore'&&!!this.body&&!!this.world;
   let target=point;
   if(clickRay){const hit=await paged.raycast(clickRay,current);if(!hit||!current())return;target=hit.point;if(hit.normal.y<Math.SQRT1_2)target=target.clone().add(new THREE.Vector3(hit.normal.x,0,hit.normal.z).normalize().multiplyScalar(.28));}
   lease=await paged.prepare(target,4);if(!current()||!this.world||!this.body)return;
   const feet=clickedWalkingFeet(this.world,target,this.capsule,p=>this.validWalkingPlacement(p),Math.max(.25,paged.manifest.detail*paged.group.getWorldScale(new THREE.Vector3()).x+.05),.6);if(!feet)return;const start=this.body.translation();this.routes.find({x:start.x,y:start.y-(this.crouched?.55:.85),z:start.z},feet);}catch{}finally{this.focusCollision(paged);lease?.release();}})();return;}
  const feet=this.world?clickedWalkingFeet(this.world,point,this.capsule,p=>this.validWalkingPlacement(p),.25,.6):null;this.routes.cancel();if(!feet)return;const p=this.body.translation();this.routes.find({x:p.x,y:p.y-(this.crouched?.55:.85),z:p.z},feet);
 }
 private triggerStart(controller:THREE.XRTargetRaySpace){if(this.xrInputSuspended)return;this.audio.unlock();this.navigator?.takeControl();this.controllerRay(controller);const hit=this.hitUI();this.held.set(controller,hit||null);if(!hit&&this.mode!=='jumps'&&!this.loading&&!this.status&&!this.blocked&&!this.collisionMovementBlocked){if(this.teleportController&&this.teleportController!==controller)this.cancelTeleport();this.teleportController=controller;this.updateTeleport();}}
 private triggerEnd(controller:THREE.XRTargetRaySpace){if(this.xrInputSuspended||!this.held.has(controller))return;const pressed=this.held.get(controller);this.held.delete(controller);this.controllerRay(controller);if(pressed&&this.hitUI()===pressed){this.activate(pressed);}else if(!pressed&&this.teleportController===controller&&!this.status){this.updateTeleport();if(this.teleportPoint){this.routes.cancel();this.placeFeet(this.teleportPoint);this.currentViewpoint='';this.onViewpoint('');this.fadeUntil=performance.now()+220;}}if(this.teleportController===controller)this.cancelTeleport();}
 private updateTeleport(){if(!this.teleportController||this.mode==='jumps')return;this.controllerRay(this.teleportController);this.teleportPoint=undefined;this.teleportRing.visible=false;if(this.collisionMovementBlocked||this.hitUI()||this.ray.ray.direction.y>-.06){this.cancelTeleportQuery();this.teleportAim=undefined;return;}if(this.mode==='explore'&&this.pagedCollider){this.updatePagedTeleport(this.teleportController,this.pagedCollider,this.ray.ray.clone());return;}const origin=this.ray.ray.origin,direction=this.ray.ray.direction;let point:THREE.Vector3|undefined,valid=true;
  if(this.mode==='explore'&&this.world){const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(origin,direction),25,true,undefined,undefined,this.capsule);if(hit){point=this.ray.ray.at(hit.timeOfImpact,new THREE.Vector3());const feet=teleportWalkingFeet(this.world,point,hit.normal,this.capsule,p=>this.validWalkingPlacement(p),Math.max(.25,this.stepHeight),.6);valid=!!feet;if(feet)point=v([feet.x,feet.y,feet.z]);}}else if(this.mesh){const hit=this.ray.intersectObject(this.mesh)[0];if(hit&&hit.distance<25)point=hit.point;}
  if(this.pagedCollider){
   if(!point&&this.mesh){const hit=this.ray.intersectObject(this.mesh)[0];if(hit&&hit.distance<25){point=hit.point;valid=false;}}
   if(point){const paged=this.pagedCollider,center=point.clone().add(new THREE.Vector3(0,.87,0)),allowed=this.allowedPosition(center,.6,.24);valid=valid&&allowed;if(!allowed){const key=this.generation+':'+paged.toGeneration(point).toArray().map(value=>Math.floor(value*2)).join(',');if(key!==this.teleportPreparation){this.teleportPreparation=key;const controller=this.teleportController,request=++this.teleportRequest;this.focusCollision(paged);void paged.prepare(point,4).then(lease=>{if(request!==this.teleportRequest||controller!==this.teleportController||paged!==this.pagedCollider){this.focusCollision(paged);lease.release();return;}this.focusCollision(paged);this.teleportLease?.release();this.teleportLease=lease;this.updateTeleport();}).catch(()=>{}).finally(()=>{if(this.teleportPreparation===key)this.teleportPreparation='';});}}}
  }
  if(point){valid=valid&&this.clearXRFeetPosition(point,this.mode==='fly'?this.flyRadius:this.xrHeadRadius);this.teleportRing.visible=true;this.teleportRing.position.copy(point).add(new THREE.Vector3(0,.04*this.xrUnit,0));this.teleportRing.scale.setScalar(this.xrUnit);(this.teleportRing.material as THREE.MeshBasicMaterial).color.set(valid?0x9fffc8:0xff665e);if(valid)this.teleportPoint=point;}}
 private showTeleport(point:THREE.Vector3,state:'pending'|'ready'|'invalid'){
  this.teleportRing.visible=true;this.teleportRing.position.copy(point).add(new THREE.Vector3(0,.04*this.xrUnit,0));this.teleportRing.scale.setScalar(this.xrUnit);
  (this.teleportRing.material as THREE.MeshBasicMaterial).color.set(state==='ready'?0x9fffc8:state==='pending'?0xc2d9e4:0xff665e);
  if(state==='ready')this.teleportPoint=point;
 }
 private validTeleportLanding(feet:THREE.Vector3){
  const center={x:feet.x,y:feet.y+.87,z:feet.z};return !!this.world&&this.validWalkingPlacement(center)&&!this.world.intersectionWithShape(center,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.6,.25),undefined,undefined,this.capsule);
 }
 private updatePagedTeleport(controller:THREE.XRTargetRaySpace,paged:PagedCollider,ray:THREE.Ray){
  // Rapier closes cold page seams for movement. Aim against the authoritative
  // streamed boundary instead, so its temporary cap cannot hide a distant floor.
  // Ignore normal hand tremor while a cold page loads. Larger aim changes create
  // a new request identity, so a late floor can never replace a deliberate aim.
  const previous=this.teleportAim;
  // Retain a verified landing through small release tremor only when the new
  // controller ray still has a clear, known path. Proximity alone could keep
  // a green destination behind a newly aimed post or wall.
  const nearLanding=previous?.state==='ready'&&previous.point&&previous.origin.distanceToSquared(ray.origin)<=.01&&previous.direction.dot(ray.direction)>=Math.cos(Math.PI/90)&&ray.distanceSqToPoint(previous.point)<=.04;
  const beforeSurface=nearLanding?ray.at(Math.max(0,ray.direction.dot(previous!.point!.clone().sub(ray.origin))-.03),new THREE.Vector3()):undefined;
  const steadyLanding=!!beforeSurface&&paged.probeHeadMotion(ray.origin,beforeSurface,.003)==='clear';
  if(!previous||(previous.state==='ready'?!steadyLanding:previous.origin.distanceToSquared(ray.origin)>.0025||previous.direction.dot(ray.direction)<Math.cos(Math.PI/240))){this.cancelTeleportQuery();this.teleportAim={origin:ray.origin.clone(),direction:ray.direction.clone(),state:'pending',retryAt:0};}const aim=this.teleportAim!;
  if(aim.point){const valid=aim.state==='ready'&&!!aim.landing&&this.validTeleportLanding(aim.landing);this.showTeleport(valid?aim.landing!:aim.point,valid?'ready':aim.state==='pending'?'pending':'invalid');}
  else if(aim.state==='pending'){
   // The current feet plane is only a neutral aiming cue while the real ray
   // crosses cold pages. It never grants a selectable or assumed floor.
   const feetY=this.body?this.body.translation().y-(this.crouched?.57:.87):this.rig.position.y,distance=(feetY-ray.origin.y)/ray.direction.y;
   if(distance>0&&distance<=25)this.showTeleport(ray.at(distance,new THREE.Vector3()),'pending');
  }
  if(this.teleportQuery||performance.now()<aim.retryAt)return;
  const query={id:++this.teleportRequest,controller,abort:new AbortController()};this.teleportQuery=query;const generation=this.generation,current=()=>!this.dead&&!query.abort.signal.aborted&&this.teleportQuery===query&&query.id===this.teleportRequest&&generation===this.generation&&this.teleportController===controller&&this.pagedCollider===paged&&this.mode==='explore'&&this.teleportAim===aim;
  this.focusCollision(paged);void(async()=>{let lease:{release():void}|undefined;
   try{const hit=await paged.raycast(ray,current,{maxDistance:25,retryDelay:3000,signal:query.abort.signal});if(!current())return;aim.retryAt=Infinity;if(!hit){aim.state='invalid';return;}aim.point=hit.point;aim.state='pending';this.showTeleport(hit.point,'pending');lease=await paged.prepare(hit.point,4,{signal:query.abort.signal});if(!current())return;this.focusCollision(paged);this.teleportLease?.release();this.teleportLease=lease;lease=undefined;
    const tolerance=Math.max(.25,this.stepHeight,paged.manifest.detail*paged.group.getWorldScale(new THREE.Vector3()).x+.05),feet=this.world&&teleportWalkingFeet(this.world,hit.point,hit.normal,this.capsule,p=>this.validWalkingPlacement(p),tolerance,.6);
    aim.landing=feet?v([feet.x,feet.y,feet.z]):undefined;aim.state=aim.landing?'ready':'invalid';if(!feet)aim.retryAt=performance.now()+3000;
   }catch(error){if(current()){aim.state='pending';aim.landing=undefined;aim.retryAt=performance.now()+3000;this.report('Nearby navigation data: '+String(error),true,'navigation');}}
   finally{this.focusCollision(paged);lease?.release();const refresh=current();if(this.teleportQuery===query)this.teleportQuery=undefined;if(refresh)this.updateTeleport();}
  })();
 }
 private cancelTeleportQuery(){const query=this.teleportQuery;this.teleportQuery=undefined;query?.abort.abort();}
 private cancelTeleport(){++this.teleportRequest;this.cancelTeleportQuery();this.teleportPreparation='';this.teleportAim=undefined;this.teleportController=undefined;this.teleportPoint=undefined;this.teleportRing.visible=false;this.focusCollision();this.teleportLease?.release();this.teleportLease=undefined;}
 async enterXR(){try{if(!navigator.xr||!await navigator.xr.isSessionSupported('immersive-vr'))throw new Error('WebXR immersive VR is unavailable in this browser.');const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});await this.renderer.xr.setSession(session);}catch(e){this.report(String(e),true,'xr');}}
 private button(text:string,y:number,action:(()=>void)|undefined,width=1.65,x=0,bg='rgba(0,0,0,.22)',icon?:IconName){const mesh=panel(text,width,.21,bg,icon);mesh.position.set(x,y,.025);mesh.userData.action=action;mesh.userData.label=text;if(!action)(mesh.material as THREE.MeshBasicMaterial).opacity=.4;this.hud.add(mesh);return mesh;}
 toggleMenu(){if(this.xrInputSuspended)return;this.menuOpen=!this.menuOpen;this.currentPage=null;this.confirmExit=false;this.cancelTeleport();this.routes.cancel();this.refreshHud(true);}
 closeContent(id?:string){if(id&&this.currentPage?.id!==id)return;this.currentPage=null;this.menuOpen=false;this.refreshHud();}
 refreshHud(reposition=false){for(const c of [...this.hud.children])releaseUI(c);if(!this.currentPage)this.xrContent.reset();this.hud.visible=this.renderer.xr.isPresenting&&(this.menuOpen||!!this.loading);if(!this.hud.visible)return;this.hud.scale.setScalar((this.currentPage?(this.xrContent.page===this.currentPage&&this.xrContent.focus>=0?.85:.75):.6)*this.xrUnit);
  if(reposition||this.menuAnchor.lengthSq()===0){const head=this.camera,position=head.getWorldPosition(new THREE.Vector3()),direction=head.getWorldDirection(new THREE.Vector3());direction.y=0;if(direction.lengthSq()<.01)direction.set(0,0,-1);direction.normalize();this.hud.position.copy(position).addScaledVector(direction,1.75*this.xrUnit);this.hud.position.y-=.12*this.xrUnit;this.hud.lookAt(position.x,this.hud.position.y,position.z);this.menuAnchor.copy(this.hud.position);}
  const glass=`rgba(0,0,0,${Math.max(.22,Math.min(.7,this.project?.appearance?.glassShade??.26))})`;
  if(this.currentPage&&!this.loading&&!this.confirmExit){
   const focused=this.xrContent.page===this.currentPage&&this.xrContent.focus>=0;
   const background=panel('',focused?2.9:2.65,focused?3.05:2.65,glass);background.position.z=-.015;background.renderOrder=90;background.userData.blocks=true;this.hud.add(background);
   const title=panel(this.currentPage.title,focused?2.35:2.12,.22,'rgba(0,0,0,0)','chat_info');title.position.set(-.12,focused?1.36:1.17,.025);this.hud.add(title);
   this.button('',focused?1.36:1.17,()=>this.closeContent(),.22,focused?1.28:1.15,glass,'close');
   this.xrContent.render(this.hud,this.currentPage,this.base,()=>this.refreshHud(),link=>this.followSceneLink(link));
   if(focused){this.button('Back to content',-1.37,()=>{this.xrContent.focus=-1;this.refreshHud();},2.55,0,glass,'chevron_left');}
   else{const hint=panel('Scroll with the left stick · select a photo to enlarge',2.3,.14,'rgba(0,0,0,0)');hint.position.set(0,-.98,.03);this.hud.add(hint);this.button('Tour menu',-1.16,()=>{this.currentPage=null;this.refreshHud();},1.12,-.64,glass,'menu');const up=this.button('Up',-1.16,()=>this.xrContent.scroll(-.45),.48,.30,glass,'expand_less');up.userData.contentScroll=-1;const down=this.button('Down',-1.16,()=>this.xrContent.scroll(.45),.54,.91,glass,'expand_more');down.userData.contentScroll=1;}
   return;
  }
  const background=panel('',1.95,2.2,glass);background.position.z=-.015;background.renderOrder=90;background.userData.blocks=true;this.hud.add(background);const title=panel('Tour menu',1.55,.19,'rgba(0,0,0,0)','menu');title.position.set(-.12,.93,.02);this.hud.add(title);this.button('',.93,()=>{this.menuOpen=false;this.currentPage=null;this.refreshHud();},.22,.78,glass,'close');
  if(this.loading){const state=this.loading,cover=state.cover||state.fallbackCover;const image=imagePanel(cover,1.65,.93);image.position.y=.30;this.hud.add(image);const message=panel(state.name+'\n'+state.phase,1.65,.38,'rgba(0,0,0,.2)','schedule');message.position.y=-.40;this.hud.add(message);const track=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.045),new THREE.MeshBasicMaterial({color:0xffffff,opacity:.2,transparent:true,depthTest:false,depthWrite:false}));track.position.set(0,-.68,.025);track.renderOrder=110;this.hud.add(track);const width=1.65*state.completed/state.total;if(width>0){const fill=new THREE.Mesh(new THREE.PlaneGeometry(width,.045),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false}));fill.position.set((width-1.65)/2,-.68,.03);fill.renderOrder=111;this.hud.add(fill);}return;}
  if(this.confirmExit){const text=panel(`Leave virtual reality?
Your tour will stay open in the browser.`,1.65,.65);text.position.y=.3;this.hud.add(text);this.button('Stay in VR',-.25,()=>{this.confirmExit=false;this.refreshHud();},1.65,0,'rgba(0,0,0,.22)','head_mounted_device');this.button('Confirm: exit VR',-.55,()=>void this.renderer.xr.getSession()?.end(),1.65,0,'rgba(80,16,10,.35)','close');return;}
  const tabs=(['move','scenes',...(this.active?.modes.includes('jumps')?['views' as const]:[]),'options'] as const);if(this.menuTab==='views'&&!this.active?.modes.includes('jumps'))this.menuTab='move';for(const [i,tab] of tabs.entries())this.button(tab==='move'?'Move':tab==='scenes'?'Scenes':tab==='views'?'Views':'Options',.64,()=>{this.menuTab=tab;this.menuPage=0;this.refreshHud();},.40,(i-(tabs.length-1)/2)*.44,this.menuTab===tab?'rgba(0,0,0,.42)':'rgba(0,0,0,.18)');
  if(this.status){const message=panel(this.status,1.65,.42,'rgba(50,30,0,.35)','error');message.position.y=.28;this.hud.add(message);this.button('Retry scene',-.06,()=>{if(this.active)void this.selectScene(this.active.id);},1.65,0,'rgba(0,0,0,.22)','refresh');this.button('Choose another scene',-.34,()=>{this.menuTab='scenes';this.status='';this.refreshHud();},1.65,0,'rgba(0,0,0,.22)','image_arrow_up');}
  else if(this.menuTab==='move'){const modes=this.active?.modes||[];const names={jumps:'Viewpoints',fly:'Drone',explore:'Walk'},icons={jumps:'photo',fly:'drone',explore:'directions_walk'} as const;modes.forEach((mode,index)=>this.button(names[mode],.3-index*.26,()=>{this.setMode(mode);this.menuOpen=false;this.refreshHud();},1.65,0,mode===this.mode?'rgba(0,0,0,.42)':'rgba(0,0,0,.22)',icons[mode]));const help=panel(this.mode==='jumps'?`Left stick: move along authored view
Right stick: turn in place
Trigger: select bubbles
Grip: menu`:`Hold trigger: aim teleport · release: move
Fly: left stick move; right stick lift / turn
Walk: left stick move; right stick turn
Grip: open or close this menu`,1.65,.55,'rgba(0,0,0,0)');help.position.y=-.58;this.hud.add(help);}
  else if(this.menuTab==='options'){this.button('Movement: '+(this.swapSticks?'right stick':'left stick'),.32,()=>{this.swapSticks=!this.swapSticks;this.refreshHud();});this.button('Turning: '+(this.snap?'30° snap':'smooth'),.07,()=>{this.snap=!this.snap;this.refreshHud();});this.button('Speed: '+this.speedMultiplier+'×',-.18,()=>{const speeds=[.25,.5,1,2,4];this.speedMultiplier=speeds[(speeds.indexOf(this.speedMultiplier)+1)%speeds.length];this.refreshHud();});this.button('View transitions: '+(this.xrFly?'fly':'fade'),-.43,()=>{this.xrFly=!this.xrFly;this.refreshHud();});this.button('Audio: '+(this.audio.muted?'muted':'on'),-.68,()=>{this.audio.setMuted(!this.audio.muted);this.refreshHud();});}
  else {const list=this.menuTab==='scenes'?this.project?.scenes||[]:listedViewpoints(this.active),pages=Math.max(1,Math.ceil(list.length/4));this.menuPage=Math.min(this.menuPage,pages-1);list.slice(this.menuPage*4,this.menuPage*4+4).forEach((item,index)=>this.button((this.menuTab==='views'?String(this.menuPage*4+index+1)+'. ':'')+item.name,.3-index*.25,()=>{if(this.menuTab==='scenes')void this.selectScene(item.id);else {if(this.active?.modes.includes('jumps'))this.setMode('jumps');this.jump(item.id);}this.menuOpen=false;this.refreshHud();}));if(pages>1){this.button('Previous',-.74,()=>{this.menuPage=(this.menuPage+pages-1)%pages;this.refreshHud();},.78,-.43);this.button('Next',-.74,()=>{this.menuPage=(this.menuPage+1)%pages;this.refreshHud();},.78,.43);}}
  this.button('Exit VR…',-.98,()=>{this.confirmExit=true;this.refreshHud();},1.65,0,'rgba(0,0,0,.22)','head_mounted_device');
 }
 private resetHeadSafety(){this.lastSafeHead=undefined;}
 private watchHeadSafetyTracking(){
  this.headSafetyTrackingCleanup?.();this.resetHeadSafety();const session=this.renderer.xr.getSession();if(!session||typeof session.addEventListener!=='function')return;
  const space=this.renderer.xr.getReferenceSpace(),reset=()=>this.resetHeadSafety();
  const cleanup=()=>{session.removeEventListener('visibilitychange',reset);session.removeEventListener('end',cleanup);space?.removeEventListener('reset',reset);this.resetHeadSafety();if(this.headSafetyTrackingCleanup===cleanup)this.headSafetyTrackingCleanup=undefined;};
  session.addEventListener('visibilitychange',reset);session.addEventListener('end',cleanup,{once:true});space?.addEventListener('reset',reset);this.headSafetyTrackingCleanup=cleanup;
 }
 private headFadeOpacity(position:THREE.Vector3){
  const rig=this.rig;rig.updateWorldMatrix(true,false);
  // A tracked-head sweep belongs to the current rig, never the historical
  // world-space chord of a Drone/Walk route, turn, teleport or relocation.
  const from=this.lastSafeHead?.clone().applyMatrix4(rig.matrixWorld)||position,radius=this.xrHeadRadius;
  let blocked=false;
  if(this.pagedCollider){
   // Unknown pages block locomotion, but are not proof of head penetration.
   // The resident voxel probe excludes synthetic caps at streaming frontiers.
   blocked=this.pagedCollider.probeHeadMotion(from,position,radius)==='blocked';
  }else if(this.world&&this.capsule){
   const ball=new RAPIER.Ball(radius),rotation={x:0,y:0,z:0,w:1},delta=position.clone().sub(from);
   blocked=!!this.world.intersectionWithShape(position,rotation,ball,undefined,undefined,this.capsule);
   if(!blocked&&delta.lengthSq()>1e-8)blocked=!!this.world.castShape(from,rotation,delta,ball,0,1,true,undefined,undefined,this.capsule);
  }
  // Retain a real physical crossing until the visitor retreats. Clear/unknown
  // samples can become a fresh anchor without pinning old streaming coverage.
  if(!blocked)this.lastSafeHead=rig.worldToLocal(position.clone());return blocked?.95:0;
 }
 private frame(time:number,xrFrame?:XRFrame){
  const sampleMs=time-this.last;
  const dt=Math.min(.05,(time-this.last)/1000||.016);this.frameMs=this.frameMs*.9+Math.max(1,time-this.last)*.1;this.last=time;const xr=this.renderer.xr.isPresenting,suspended=this.xrInputSuspended;if(suspended){this.resetHeadSafety();this.walkMotion.reset();this.keys.clear();this.pointerMove.set(0,0,0);this.jumpRequested=false;this.held.clear();this.routes.cancel();this.stopFlight();this.cancelTeleport();}if(xr&&xrFrame){const space=this.renderer.xr.getReferenceSpace();if(space&&!xrFrame.getViewerPose(space)){this.resetHeadSafety();this.walkMotion.reset();this.fade.visible=false;(this.fade.material as THREE.MeshBasicMaterial).opacity=0;return;}}this.syncXRScale();this.rig.updateMatrixWorld(true);if(xr){this.renderer.xr.updateCamera(this.camera);const views=this.renderer.xr.getCamera();if(views.isArrayCamera)rigidXRViews(views);}const cam=this.camera;
  if(this.pagedCollider&&(this.editing||this.mode!=='jumps')){this.pagedCollider.update(this.trackedHeadPosition(),time,this.mode==='explore'?this.body?.translation():undefined);if(this.fallbackNavigationDirty&&!this.pagedNavigationAligned&&!this.routes.preparing){this.fallbackNavigationDirty=false;this.routes.build(this.pagedCollider.navigationParts(),{stepHeight:this.stepHeight,preserveRoute:true});}}
  let x=this.touch.x,z=this.touch.y,y=this.touchLift,turn=0;
  if(xr&&!suspended&&this.menuOpen&&this.currentPage){const source=Array.from(this.renderer.xr.getSession()?.inputSources||[]).find(s=>s.handedness==='left'&&s.gamepad),[,sy]=stick(source?.gamepad?.axes||[]);if(Math.abs(sy)>.2)this.xrContent.scroll(sy*dt*1.7);for(const pressed of this.held.values())if(pressed?.parent===this.hud&&pressed.userData.contentScroll)this.xrContent.scroll(pressed.userData.contentScroll*dt*1.1);}
  if(!suspended&&!this.blocked&&!this.firstDisplay&&!this.loading&&!this.preparingMode&&!this.collisionMovementBlocked&&!this.gizmo.dragging&&!(xr&&this.menuOpen)){
   const keyboard=keyboardMotion(this.keys,this.mode);x+=keyboard.x;z+=keyboard.z;y+=keyboard.lift;
   if(xr){const motion=xrMotion(this.renderer.xr.getSession()?.inputSources||[],this.mode,this.swapSticks);x+=motion.strafe;z+=motion.forward;y+=motion.lift;turn=motion.turn;if(this.snap){if(Math.abs(turn)>.6&&this.turnReady){this.turnXR(-Math.sign(turn)*Math.PI/6);this.turnReady=false;}if(Math.abs(turn)<.2)this.turnReady=true;}else this.turnXR(-turn*dt*1.5);}
   if(this.mode==='jumps'&&!this.editing&&this.navigator){if(Math.abs(x)+Math.abs(z)+Math.abs(y)>.01)this.steerView(this.navigator.drag(-x*dt*(xr?60:180),-(z-y)*dt*(xr?60:180)));else if(!xr&&!this.currentPage&&!this.flight){const pose=this.navigator.animate(dt);if(pose)this.applyViewPose(pose);}}
   const manual=Math.abs(x)+Math.abs(z)+Math.abs(y)>.01||this.pointerMove.lengthSq()>0;if(manual){this.routes.cancel();if(!(this.mode==='jumps'&&!this.editing&&this.navigator))this.stopFlight();this.navigator?.takeControl();}
   if((this.mode!=='jumps'||this.editing)&&!this.status&&!this.flight){
    if(this.mode==='explore')this.updateCrouch(this.touchCrouch||keyboard.crouch);
    const orientation=cam.getWorldQuaternion(new THREE.Quaternion());
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(orientation),right=new THREE.Vector3(1,0,0).applyQuaternion(orientation);
    // Walking and headset locomotion stay level; desktop flight follows the view.
    if(this.mode==='explore'||xr){forward.y=0;right.y=0;forward.normalize();right.normalize();}
    const move=right.multiplyScalar(x).addScaledVector(forward,-z).add(new THREE.Vector3(0,y,0));if(move.length()>1)move.normalize();move.multiplyScalar(this.speed*dt*(this.mode==='explore'&&this.crouched?.55:1)).add(this.pointerMove);
    let routeDistance:number|undefined;if(this.mode==='explore'&&!manual&&this.body){const p=this.body.translation(),toward=this.routes.direction(p);if(toward){if(!xr&&this.routes.followView)this.rig.rotation.y=pathYaw(this.rig.rotation.y,toward.x,toward.z,dt);const distance=toward.length(),walkingSpeed=this.speed*(this.crouched?.55:1),arrivalSpeed=Math.sqrt(2*Math.max(1,this.speed)*6*Math.max(0,distance-.08));routeDistance=distance;move.copy(toward.normalize().multiplyScalar(Math.min(distance,Math.min(walkingSpeed,arrivalSpeed)*dt)));}}
    if((manual||move.lengthSq()>.000001)&&this.currentViewpoint){if(xr){const previous=this.currentViewpoint;this.setMode(this.mode,true,false,true);if(this.currentViewpoint===previous)move.set(0,0,0);}else{this.currentViewpoint='';this.onViewpoint('');}}
    if(this.mode!=='explore'){const eye=this.trackedHeadPosition(),delta=this.world&&this.mode==='fly'&&(!this.pagedCollider||!this.editing)?flyMovement(this.world,eye,move,this.capsule,this.flyRadius):move;if(this.editing||!this.pagedCollider||this.pagedCollider.allowsMotion(eye,eye.clone().add(new THREE.Vector3(delta.x,delta.y,delta.z)),this.flyRadius))this.rig.position.add(new THREE.Vector3(delta.x,delta.y,delta.z));}
    else if(this.world&&this.character&&this.capsule&&this.body){const horizontal=this.walkMotion.step(move.x/dt,move.z/dt,dt,this.speed);move.x=horizontal.x;move.z=horizontal.z;if(this.pagedCollider){const limit=this.speed*dt*(this.crouched?.55:1),length=Math.hypot(move.x,move.z);if(length>limit){move.x*=limit/length;move.z*=limit/length;this.walkMotion.x=move.x/dt;this.walkMotion.z=move.z/dt;}}if(routeDistance!==undefined&&Math.hypot(move.x,move.z)>routeDistance){const factor=routeDistance/Math.hypot(move.x,move.z);move.x*=factor;move.z*=factor;this.walkMotion.x=move.x/dt;this.walkMotion.z=move.z/dt;}const old={...this.body.translation()},headOrigin=xr?this.trackedHeadPosition():undefined,d=this.walking.step(this.world,this.character,this.capsule,this.body,{x:move.x,z:move.z,dt,jump:this.jumpRequested,stepHeight:this.stepHeight,allows:(from:any,to:any)=>this.allowedWalkingPosition(to,this.crouched)&&(!this.pagedCollider||this.pagedCollider.allowsWalkingMotion(from,to,this.crouched?.3:.6,.24))&&(!headOrigin||this.allowedWalkingHeadMotion(headOrigin,old,from,to))});this.jumpRequested=false;if(d.blocked)this.walkMotion.reset();for(const normal of d.collisions)this.walkMotion.collision(normal);const next=this.body.translation();this.rig.position.x+=next.x-old.x;this.rig.position.z+=next.z-old.z;if(xr){this.rig.position.y+=next.y-old.y;this.walkCamera.reset();}else{const target=next.y+this.viewHeight-(this.crouched?1.17:.87);if(this.walkCamera.y===undefined)this.walkCamera.reset(this.rig.position.y);let eyeY=this.walkCamera.update(target,dt,{smooth:d.terrain||d.grounded&&!this.walking.jumping});if(eyeY!==target){const physical={x:this.rig.position.x,y:target,z:this.rig.position.z},delta=eyeY-target,hit=this.world.castShape(physical,{x:0,y:0,z:0,w:1},{x:0,y:delta,z:0},new RAPIER.Ball(.095),.005,1,true,undefined,undefined,this.capsule);if(hit)eyeY=target+delta*Math.max(0,hit.time_of_impact-.002);if(this.pagedCollider&&!this.pagedCollider.allowsMotion(physical,{...physical,y:eyeY},.095)){let low=0,high=1;for(let i=0;i<8;i++){const mid=(low+high)/2;if(this.pagedCollider.allowsMotion(physical,{...physical,y:target+(eyeY-target)*mid},.095))low=mid;else high=mid;}eyeY=target+(eyeY-target)*low;}this.walkCamera.reset(eyeY);}this.rig.position.y=eyeY;}if(this.routes.points.length&&Math.hypot(move.x,move.z)>.001&&Math.hypot(next.x-old.x,next.z-old.z)<.0005)this.routeStall+=dt;else this.routeStall=0;if(this.routeStall>2){this.routes.cancel();}if(next.y<-200&&this.active)this.setMode('explore',true);}
   }
  }
  if(this.mode!=='explore'||this.blocked||this.collisionMovementBlocked||this.gizmo.dragging||this.status||this.flight||xr&&this.menuOpen)this.walkMotion.reset();
  if(document.pointerLockElement===this.renderer.domElement&&(this.blocked||this.editing||xr||this.mode==='jumps'))document.exitPointerLock();this.pointerMove.set(0,0,0);
  if(this.flight&&!this.blocked&&!this.collisionMovementBlocked){const f=this.flight,t=THREE.MathUtils.clamp((time-f.start)/f.duration,0,1),ease=t*t*(3-2*t);this.rig.position.lerpVectors(f.from,f.to,ease);this.rig.quaternion.slerpQuaternions(f.fromYaw,f.toYaw,ease);if(!xr)this.camera.rotation.x=THREE.MathUtils.lerp(f.pitch,f.targetPitch,ease);if(t===1){this.flight=undefined;this.lastSafeHead=undefined;const eye=this.camera.getWorldPosition(new THREE.Vector3());if(this.body)this.body.setTranslation({x:eye.x,y:eye.y-.85,z:eye.z},true);}}
  this.scene.updateMatrixWorld(true);if(xr){this.renderer.xr.updateCamera(this.camera);const views=this.renderer.xr.getCamera();if(views.isArrayCamera)rigidXRViews(views);}if(document.pointerLockElement===this.renderer.domElement){this.ray.setFromCamera(new THREE.Vector2(),this.camera);this.highlight(this.hitUI());}const cameraPosition=cam.getWorldPosition(new THREE.Vector3()),cameraRotation=cam.getWorldQuaternion(new THREE.Quaternion());
  if(xr&&this.menuRecenterFrames>0&&--this.menuRecenterFrames===0)this.refreshHud(true);
  if(this.editing&&this.viewGeometry.group.visible)for(const handle of this.viewGeometry.handles()){const distance=handle.getWorldPosition(new THREE.Vector3()).distanceTo(cameraPosition);handle.scale.setScalar(Math.max(.6,distance*.12)/(this.active?.transform.scale||1));}
  if(this.editing)this.collisionSelection.sizeHandles(this.camera,this.host.clientHeight);
  this.viewMarkers.visible=false;this.updateBubbleOcclusion(cameraPosition,time);
  for(const group of [this.bubbles,this.viewMarkers])for(const marker of group.children){const {appearance,distance}=this.updateBubbleVisibility(marker,cameraPosition);if(!marker.visible)continue;marker.lookAt(cameraPosition);marker.scale.setScalar((marker.userData.hotspot?appearance.size:1)*THREE.MathUtils.clamp(distance*.065,.38,1.4)*(marker===this.hovered?1.15:1)/(this.active?.transform.scale||1));for(const c of marker.children)if(c.userData.caption){const parentScale=marker.scale.x*(this.active?.transform.scale||1);const height=xr?distance*.07:2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2)*distance*46/Math.max(1,this.host.clientHeight);c.scale.setScalar(height/(.16*parentScale));c.position.y=-.2-.08*c.scale.y;c.visible=marker===this.hovered||(this.editing&&marker===this.selected);}}
  if(xr){const hand=this.controllers.find(c=>c.userData.handedness==='left')||this.controllers[0];this.wristMenu.visible=!!hand?.visible;if(hand){this.wristMenu.position.copy(hand.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(-.08,.08,-.1).multiplyScalar(this.xrUnit).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())));this.wristMenu.lookAt(cameraPosition);this.wristMenu.scale.setScalar(.32*this.xrUnit);}let hover:THREE.Object3D|undefined;for(const controller of this.controllers){const line=controller.userData.rayLine as THREE.Line;line.visible=controller.visible;line.position.copy(controller.getWorldPosition(new THREE.Vector3()));line.quaternion.copy(controller.getWorldQuaternion(new THREE.Quaternion()));this.controllerRay(controller);const target=this.hitUI();const hit=target?this.ray.intersectObject(target,false)[0]:undefined;const tip=controller.userData.tip as THREE.Mesh;tip.visible=controller.visible&&!!hit;if(hit){tip.position.copy(hit.point);tip.scale.setScalar(Math.max(.6*this.xrUnit,hit.distance*.45));}const length=hit?.distance||3*this.xrUnit;line.scale.z=length/12;(line.material as THREE.LineBasicMaterial).color.set(target?.userData.action||target?.userData.hotspot?'#80b7d4':'#bdcbd1');hover=target||hover;}this.highlight(hover);if(this.teleportController&&time-this.aimTime>60){this.aimTime=time;this.updateTeleport();}}
  else{this.wristMenu.visible=false;for(const controller of this.controllers){(controller.userData.rayLine as THREE.Line).visible=false;(controller.userData.tip as THREE.Mesh).visible=false;}}
  if(this.descriptionLabel){this.descriptionLabel.visible=xr&&!!this.currentViewpoint&&!this.menuOpen;this.descriptionLabel.position.copy(cameraPosition).add(new THREE.Vector3(0,-.65,-2).multiplyScalar(this.xrUnit).applyQuaternion(cameraRotation));this.descriptionLabel.quaternion.copy(cameraRotation);this.descriptionLabel.scale.setScalar(this.xrUnit);}
  let opacity=performance.now()<this.fadeUntil?.95:0;
  if(xr&&!suspended&&!this.flight&&(this.mode==='explore'||this.mode==='fly')&&this.world&&this.capsule)opacity=Math.max(opacity,this.headFadeOpacity(this.trackedHeadPosition()));else this.resetHeadSafety();
  this.fade.position.copy(xr?this.trackedHeadPosition():cameraPosition).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(.2*(xr?this.xrUnit:1)));this.fade.quaternion.copy(cameraRotation);(this.fade.material as THREE.MeshBasicMaterial).opacity=opacity;this.fade.visible=opacity>0;
  this.pagedCollider?.updateOverview(cam,this.host.clientHeight);this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.overlay,this.camera);this.renderer.autoClear=true;
  const first=this.firstDisplay;if(first&&(first.mesh!==this.mesh||this.renderer.info.render.frame>first.frame+1&&(first.mesh.paged?.pager?.getSplatsChunk(first.mesh.paged,0)&&(this.spark as any).display?.numSplats>=first.minimum||performance.now()-first.started>=8000))){this.firstDisplay=undefined;if(first.mesh===this.mesh){this.setLoading(null);this.refreshHud();}}
  this.updateAdaptivePerformance(time,sampleMs,xr,suspended,opacity);
  if(this.thumbnailPending&&!this.flight&&time>this.thumbnailPending.after&&this.editing&&this.currentViewpoint===this.thumbnailPending.id){if((this.spark as any).display?.numSplats>0){const id=this.thumbnailPending.id;this.thumbnailPending=undefined;this.onViewpointThumbnail(id,this.thumbnail());}}
 }
 dispose(){if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();this.viewGeometry.clear();this.dead=true;++this.generation;this.renderer.setAnimationLoop(null);this.clearScene();this.routes.dispose();for(const child of [...this.overlay.children])releaseUI(child);this.gizmo.dispose();this.observers.disconnect();this.cleanup.forEach(f=>f());for(const c of [...this.hud.children])release(c);this.performanceTransition=Promise.all([this.precisionCleanup,this.retireSpark(this.spark)]).then(()=>this.renderer.dispose());this.renderer.domElement.remove();}
}

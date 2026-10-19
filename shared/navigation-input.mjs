// Keep keyboard aliases identical across desktop movement modes. Flight height
// is world-up; walking uses the same keys for a grounded jump and crouching.
export function keyboardMotion(keys,mode){
 const has=(...codes)=>codes.some(code=>keys.has(code));
 const up=has('Space','KeyE'),down=has('ShiftLeft','ShiftRight','KeyQ');
 return {x:Number(has('KeyD','ArrowRight'))-Number(has('KeyA','ArrowLeft')),z:Number(has('KeyS','ArrowDown'))-Number(has('KeyW','ArrowUp')),lift:mode==='explore'?0:Number(up)-Number(down),crouch:mode==='explore'&&down};
}
export function isJumpKey(code){return code==='Space'||code==='KeyE';}

// A free drag grabs the scene; a captured mouse points the camera. Orbit and
// slider viewpoints implement their own grab geometry in ViewNavigation.
export function lookRotation(yaw,pitch,dx,dy,captured){
 const direction=captured?-1:1;
 return {yaw:yaw+dx*.003*direction,pitch:Math.max(-1.5,Math.min(1.5,pitch+dy*.003*direction))};
}

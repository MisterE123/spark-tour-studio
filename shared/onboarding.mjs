const text={jumps:['Choose a view','Select a named view below to glide there. Drag the scene to look around. Some views let you orbit a point or slide along a surface.'],fly:['Fly at your own pace','Use W A S D or the arrow keys to move. Space or E rises; Shift or Q descends. Right-drag pans. Release the keys to stop.'],explore:['Choose where to walk','Click the ground to walk there, or move with W A S D / arrow keys. Space or E jumps; Shift or Q crouches. Move the mouse to take over looking along a walking path.']};

export function guideSteps(mode='jumps',touch=false){
 const [movementTitle,movement]=text[mode]||text.jumps;
 return [
  {icon:'panorama',title:'Make yourself at home',body:'There is no rush. Explore from saved views, open the floating stories, or choose another scene whenever you like.',target:'modes'},
  {icon:'visibility',title:touch?'A touch is all it takes':'Looking around',body:touch?'Drag an empty part of the scene to look around. Tap a bubble to open its story. Your finger stays in control.':mode==='jumps'?'Drag the scene as if holding a photograph to explore this view. In Walk or Drone, Mouse look also lets the mouse turn your view continuously. Escape frees the cursor again.':'With the cursor free, drag the scene as if holding a photograph. Right-drag pans. For continuous mouse look, choose Mouse look. Press Escape at any time to free the cursor again.',target:'mouse'},
  {icon:mode==='fly'?'drone':mode==='explore'?'directions_walk':'photo',title:movementTitle,body:touch&&mode!=='jumps'?(mode==='fly'?'Use the left pad to move and the up/down buttons to change height. Drag the scene to look. Lift your finger to stop.':'Tap the ground to walk there. The left pad also moves you; use Jump and Crouch on the right. Drag the scene to take over looking.'):movement,target:'modes'},
  {icon:'chat_info',title:'Discover the stories',body:touch?'Tap a floating bubble to open text, photographs or links. Swipe inside the story to scroll. Close it to return to the same place.':'Select a floating bubble to open text, photographs or links. Scroll inside the story to see everything. Close it to return to the same place.',target:'scene'},
  {icon:'image_arrow_up',title:'Find your next stop',body:'Use the scene selector above to explore another part of the tour. Saved views below offer easy ways to move around. Start returns to the searchable overview.',target:'scenes'},
  {icon:'head_mounted_device',title:'Explore in a headset',body:'Choose Enter VR in a compatible headset browser. Hold a trigger to aim; release to teleport or open a bubble. Grip opens the menu. In Drone, one stick moves and the other lifts and turns. In a story, scroll with the left stick or Up/Down buttons. Select a photo to enlarge it; Back to content returns to the story.',target:'settings'},
  {icon:'settings',title:'Make the tour comfortable',body:'Settings includes movement speed, display quality, audio and touch controls. Enter VR opens the same tour in a compatible headset. You can reopen this guide with Help at any time.',target:'settings'}
 ];
}

export function guideStorageKey(title,path){return `spark-tour-guide-v1:${path}:${title}`;}

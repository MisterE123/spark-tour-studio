import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';
import {AdaptiveDetailController} from '../shared/adaptive-detail.mjs';
import {radixRenderSettings} from '../shared/radix-performance.mjs';

const outputRoot = path.resolve('test-output');
await fs.mkdir(outputRoot, {recursive: true});
const output = await fs.mkdtemp(path.join(outputRoot, 'radix-refinement-'));
const bundle = path.join(output, 'stream.mjs');
await build({
  stdin: {
    contents: 'export * from "./src/rendering/radix/sog/lod"; export {SogLodStream} from "./src/rendering/radix/sog/lodStream"; export {StereoCoverage} from "./src/rendering/radix/sog/stereo-coverage";',
    resolveDir: process.cwd(),
  },
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
  plugins: [{name:'fixture-gpu-upload',setup(builder) {
    builder.onLoad({filter:/[/\\]sog[/\\]gpuDecode\.ts$/}, () => ({contents:`
      export function uploadSogGpu(renderer, prepared) {
        return {arrays:{count:prepared.count,dispose(){}},degree:0,layout:'extSplats'};
      }
      export function prepareSogGpu(){throw Error('Unexpected real decoding in this selector fixture');}
      export function closePrepared(){}
    `}));
  }}],
});
const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
Object.defineProperty(globalThis, 'ImageBitmap', {configurable: true, value: class ImageBitmap {}});
let api;
try {
  api = await import(pathToFileURL(bundle).href);
} finally {
  if (bitmapDescriptor) Object.defineProperty(globalThis, 'ImageBitmap', bitmapDescriptor);
  else delete globalThis.ImageBitmap;
}
test.after(async () => {
  await fs.unlink(bundle);
  await fs.rmdir(output);
});
const {parseLod, SogLodStream, defaultLodSettings, selectLevels, StereoCoverage} = api;

const authored = 4_000_000;
const floor = 1_013_712;
const coarse = 4;

// Match the reported scene's total coarse coverage and uneven leaf counts,
// without distributing tour data. Two separated clusters lie on the walk.
// The rest of the source is outside its configured refinement distances.
function makeTree() {
  const filenames = [];
  const offsets = [];
  const children = [];
  for (let i = 0; i < 1024; i++) {
    const x = i === 0 ? 0 : i === 1 ? 32 : 300 + 4 * (i % 32);
    const z = i < 2 ? 0 : 300 + 4 * Math.floor(i / 32);
    const counts = [i % 2 ? 47_226 : 31_000, 18_522, 7_251, 1_676, i < 48 ? 989 : 990];
    const lods = counts.map((count, level) => {
      const file = (i < 2 ? i : 2 + Math.floor(i / 32)) * counts.length + level;
      filenames[file] = 'chunk-' + file + '/meta.json';
      const offset = offsets[file] ?? 0;
      offsets[file] = offset + count;
      return {file, offset, count};
    });
    children.push({bound: {min: [x-1, -1, z-1], max: [x+1, 1, z+1]}, lods});
  }
  return parseLod({
    lodLevels: coarse + 1, filenames,
    tree: {bound: {min: [-1,-1,-1], max: [430,1,430]}, children},
  }, 'https://fixture.invalid/lod-meta.json');
}
const tree = makeTree();
const leafAt = x => Array.from({length: tree.leaves}, (_, i) => i).find(leaf => tree.bounds[leaf * 6] === x - 1 && tree.bounds[leaf * 6 + 2] === -1);
const nearStart = leafAt(0);
const nearEnd = leafAt(32);

function select(x, settings) {
  const levels = new Int8Array(tree.leaves);
  const total = selectLevels(tree, {x, y: 0, z: 0}, {x: 1, y: 0, z: 0}, settings, levels, new Float32Array(tree.leaves));
  return {total, levels};
}

// Complete only network/image preparation synchronously. The real pager owns
// slots, cancellation, GPU landing order, fallback, and range selection.
function readyFiles(stream) {
  const requested = [];
  stream.readMetadata = job => {
    requested.push(job.file);
    job.prepared = {count:job.file.required};
    job.file.state = 'ready';
    stream.schedulePending = true;
  };
  stream.objectOf = (file, key, leaves) => {
    if (key !== file.key) {
      file.key = key;
      file.object = {count: stream.rangesOf(leaves, file.level).meta.count};
    }
    return file.object;
  };
  return requested;
}

test('with initially slow desktop cadence that improves as budget decreases, walking still requests, lands and displays nearby refinement after reaching minimum detail', () => {
  assert.equal(tree.levelTotals[coarse], floor);
  const settings = {...defaultLodSettings(false), splatBudget: authored};
  const camera = new THREE.PerspectiveCamera(65, 16/9, .05, 20000);
  camera.lookAt(1,0,0);
  const stream = new SogLodStream({renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(), settings, degree: 0});
  const requested = readyFiles(stream);
  const controller = new AdaptiveDetailController();
  let time = 0, lastScale = 1;
  function tick(x) {
    const frameMs = 1000 / 11 * controller.scale ** .65;
    time += frameMs;
    camera.position.x = x;
    camera.updateMatrixWorld();
    stream.update(time);

    const scale = controller.sample({time, frameMs, targetFps: 60, eligible: stream.baseReady, context: 'desktop', shownSplats: stream.stats.shown});
    if (scale === lastScale) return;
    lastScale = scale;
    const resolved = radixRenderSettings({adaptiveDetail: true, radix: {selectedSplatBudget: authored}}, scale);
    settings.splatBudget = resolved.selectedSplatBudget;
    settings.coverage = resolved.coverage;
    stream.invalidate();
  }
  try {
    // First loads full coarse coverage and refines at the original position.
    for (let frame = 0; frame < 1100; frame++) tick(0);
    assert.equal(controller.scale, .25);
    assert.ok(settings.splatBudget < floor);
    const {shown} = stream.inspect();
    assert.ok(shown[nearStart] < coarse, 'detail at the starting location survives the automatic reduction');
    const startLevel = shown[nearStart], distantLevel = shown[nearEnd];
    assert.ok(startLevel < distantLevel);
    const loadsBeforeWalk = requested.length;
    const generations = stream.stats.selections;
    // 2 m/s at the production 50 ms cap on movement per callback.
    for (let frame = 1; frame <= 320; frame++) tick(frame / 10);
    for (let frame = 0; frame < 22; frame++) tick(32);
    assert.equal(controller.scale, .25);
    assert.ok(stream.stats.selections > generations);
    assert.ok(requested.length > loadsBeforeWalk, 'the newly approached region requested finer source data');
    assert.ok(shown[nearStart] > startLevel, 'departed range gave up detail');
    assert.ok(shown[nearEnd] < distantLevel, 'newly approached range is displayed at finer detail');
    assert.ok(shown.every(level => level >= 0), 'every leaf retains coarse or better coverage');
    assert.equal(stream.collection.count, stream.stats.shown);
    assert.equal(stream.stats.shown, stream.stats.selected, 'after requests settle the published collection reflects the selection');
    assert.ok(stream.stats.shown > floor && stream.stats.shown < authored);
  } finally {
    stream.dispose();
  }
});

test('manual budgets remain exact, and automatic refinement respects distance, level and authored budget limits', () => {
  const manual = {...defaultLodSettings(false), splatBudget: 1_000_000};
  const baseline = select(0, manual);
  assert.equal(baseline.total, floor);
  assert.ok(baseline.levels.every(level => level === coarse));
  const limited = {...manual, coverage: {mode:'whole-scene-with-allowance', authoredBudget:floor+4_000}};
  const nearby = select(0, limited);
  assert.ok(nearby.total > floor && nearby.total <= limited.coverage.authoredBudget);
  assert.ok(nearby.levels[nearStart] < coarse);
  assert.equal(select(0, {...limited, coverage: {mode:'whole-scene-with-allowance', authoredBudget:floor-1}}).total, floor);
  assert.equal(select(-1_000, limited).total, floor, 'limit mode does not force refinement outside authored distances');
  assert.equal(select(0, {...limited, rangeMin: coarse, rangeMax: coarse}).total, floor);
  const original = {...manual, splatBudget: authored};
  assert.deepEqual(select(0, {...original, coverage: {mode:'whole-scene-with-allowance', authoredBudget:authored}}), select(0, original));
});

test('view priority follows turns in place and lens changes without responding to small yaw jitter', () => {
  for (const viewPriority of [true, false]) {
    const settings = {...defaultLodSettings(false), splatBudget: authored, updateAngle: 90, viewPriority};
    const camera = new THREE.PerspectiveCamera(65, 16/9, .05, 20000);
    const stream = new SogLodStream({renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(), settings, degree: 0});
    stream.start = () => {};
    const tick = (time, yaw) => {
      camera.rotation.y = THREE.MathUtils.degToRad(yaw);
      camera.updateMatrixWorld();
      stream.update(time);
      return stream.stats.selections;
    };
    try {
      assert.equal(tick(0, 0), 1);
      assert.equal(tick(50, 18), 1, 'a substantial turn still respects the selection rate limit');
      assert.equal(tick(120, 18), viewPriority ? 2 : 1, 'view priority reacts before the authored 90-degree threshold');
      assert.equal(tick(240, 19), viewPriority ? 2 : 1, 'one degree of jitter does not trigger a new selection');
      if (!viewPriority) assert.equal(tick(360, 100), 2, 'distance-only still reacts past the authored threshold');

      // The backend hands the stream the effective FOV from the projection matrix.
      camera.fov = 45;
      camera.updateProjectionMatrix();
      assert.equal(tick(480, viewPriority ? 19 : 100), 3, 'zoom reselects with position and orientation held steady');
    } finally {
      stream.dispose();
    }
  }
});

// Each leaf has its own two chunks. The front can be drawn at its finest
// level for less than the original full-tree coarse workload.
function xrTree(boxes, counts = [18, 10]) {
  const filenames = [];
  const children = Object.entries(boxes).map(([id, [min, max]]) => ({
    bound: {min, max},
    lods: Object.fromEntries((Array.isArray(counts) ? counts : counts[id]).flatMap((count, level) => count === null ? [] : [[level, {
      file: filenames.push(id + '-' + level + '/meta.json') - 1, offset: 0, count,
    }]])),
  }));
  const lodLevels = (Array.isArray(counts) ? counts : Object.values(counts)[0]).length;
  return parseLod({lodLevels, filenames, tree: {bound: {min: [-100,-100,-100], max: [100,100,100]}, children}}, 'https://fixture.invalid/lod-meta.json');
}
function xrLeaf(tree, id) {
  return Array.from({length: tree.leaves}, (_, leaf) => leaf)
    .find(leaf => tree.files[tree.file[leaf * tree.levels]].endsWith('/' + id + '-0/meta.json'));
}

test('a two-level budget keeps a close ranking stable and gives up stale detail on retreat', () => {
  const tree = xrTree({left: [[-1.5,-1,-5],[-.12,1,-4]], right: [[.12,-1,-5],[1.5,1,-4]]});
  const left = xrLeaf(tree, 'left'), right = xrLeaf(tree, 'right');
  const settings = {...defaultLodSettings(false), splatBudget: 28, viewPriority: true};
  function select(x, z, previous) {
    const levels = new Int8Array(tree.leaves);
    const total = selectLevels(tree, {x,y:0,z}, {x:0,y:0,z:-1}, settings, levels, new Float32Array(tree.leaves), 1, .35, previous);
    assert.ok(total <= settings.splatBudget);
    return levels;
  }
  const start = select(-.09, 0);
  assert.equal(start[left], 0);
  assert.equal(select(.09, 0)[right], 0, 'a cold ranking crosses between the two leaves');
  assert.deepEqual(select(.09, 0, start), start);
  assert.deepEqual([...select(.09, 100, start)], [1,1], 'authored distance can remove even a held upgrade');
});

test('small camera moves keep an affordable central finish stable while a clear turn redirects it', () => {
  const tree = xrTree({
    left: [[-1.5,-1,-5], [-.12,1,-4]],
    right: [[.12,-1,-5], [1.5,1,-4]],
    middle: [[-.4,-1,-9], [.4,1,-8]],
    distant: [[-.4,-1,-95], [.4,1,-94]],
    rear: [[-.4,-1,8], [.4,1,9]],
  }, {
    left: [100,30,20,10], right: [100,30,20,10], middle: [100,90,80,20],
    distant: [100,30,20,10], rear: [100,30,20,10],
  });
  const left = xrLeaf(tree, 'left'), right = xrLeaf(tree, 'right');
  const middle = xrLeaf(tree, 'middle'), distant = xrLeaf(tree, 'distant'), rear = xrLeaf(tree, 'rear');
  // The middle upgrade stops the primary fit, with room left for only one
  // central finish above the two candidates' intermediate levels.
  const settings = {...defaultLodSettings(false), baseDistance: 12, splatBudget: 80,
    rangeMin: 1, rangeMax: 3, updateDistance: .01, viewPriority: true, coverage: {mode:'guarded-view'}};
  function run(x, yaw, previous) {
    const levels = new Int8Array(tree.leaves);
    const radians = THREE.MathUtils.degToRad(yaw);
    const total = selectLevels(tree, {x, y: 0, z: 0}, {x: Math.sin(radians), y: 0, z: -Math.cos(radians)},
      settings, levels, new Float32Array(tree.leaves), 1, .35, previous);
    assert.equal(total, settings.splatBudget);
    assert.equal(levels[rear], -1);
    assert.equal(levels[distant], 3, 'the authored distance limit still protects distant coverage');
    assert.equal(levels[middle], 3, 'the unaffordable upgrade leaves its coarse coverage intact');
    assert.deepEqual([levels[left], levels[right]].sort(), [1,2], 'both central leaves stay within the authored level range');
    return levels;
  }
  const winner = levels => levels[left] < levels[right] ? left : right;
  const positions = [-.09, -.045, 0, .045, .09, .045, 0, -.045, -.09];
  let previous = run(positions[0], 0);
  assert.equal(winner(previous), left, 'first selection follows the legacy ranking');
  assert.equal(winner(run(.09, 0)), right, 'without history, the small move reverses the ranking');
  for (const x of positions.slice(1)) {
    previous = run(x, 0, previous);
    assert.equal(winner(previous), left, `near-equal movement should retain the previous central finish at x=${x}`);
  }
  const turned = run(.09, 22, previous);
  assert.equal(winner(turned), right, 'a clear change in view redirects the finish');
  assert.deepEqual(run(.09, 22, turned), turned, 'a fixed pose settles on one selection');

  // Run the same camera path through the pager. A 45° square lens matches
  // the standalone selector's reference lens. Suppress only file I/O.
  const camera = new THREE.PerspectiveCamera(45, 1, .05, 100);
  const stream = new SogLodStream({renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(), settings, degree: 0});
  stream.start = () => {};
  let time = 0;
  function tick(x, yaw = 0, elapsed = 120) {
    camera.position.x = x;
    camera.rotation.y = THREE.MathUtils.degToRad(-yaw);
    camera.updateMatrixWorld();
    const selections = stream.stats.selections;
    time += elapsed;
    stream.update(time, .35);
    assert.equal(stream.stats.selections, selections + 1, 'this frame exercises the selector');
    assert.equal(stream.stats.selected, settings.splatBudget);
    return stream.inspect().desired;
  }
  try {
    const first = run(-.09, 0);
    for (const x of positions.slice(0, 5)) {
      assert.deepEqual(tick(x), first, 'the pager carries the preceding selection across small moves');
    }
    stream.invalidate();
    assert.deepEqual(tick(.09), run(.09, 0), 'settings invalidation resets history at the same camera pose');
    assert.deepEqual(tick(.09, -22, 5), run(.09, -22), 'a large turn immediately selects for the new view');
  } finally {
    stream.dispose();
  }
});

test('the same walk and tight budget refine the approached region in desktop and headset coverage modes', () => {
  const tree = xrTree({north:[[-1,-1,-6],[1,1,-5]], south:[[-1,-1,5],[1,1,6]]}, [26_000,25_000]);
  const profile = {adaptiveDetail:true,radix:{selectedSplatBudget:100_000}};
  const poses = [
    {z:-3, forward:-1, near:'north', far:'south'},
    {z:3, forward:1, near:'south', far:'north'},
  ];
  for (const immersive of [false,true]) {
    const effective = radixRenderSettings(profile,.5,immersive);
    const settings = {...defaultLodSettings(false),viewPriority:effective.viewPriority,coverage:effective.coverage,splatBudget:effective.selectedSplatBudget};
    const levels = new Int8Array(tree.leaves), distances = new Float32Array(tree.leaves);
    assert.equal(settings.splatBudget,tree.levelTotals[1]);
    for (const pose of poses) {
      const count = selectLevels(tree,{x:0,y:0,z:pose.z},{x:0,y:0,z:pose.forward},settings,levels,distances,1,.35);
      assert.equal(levels[xrLeaf(tree,pose.near)],0);
      assert.equal(levels[xrLeaf(tree,pose.far)],immersive ? -1 : 1);
      assert.equal(count,immersive ? 26_000 : 51_000);
    }
  }
});

test('immersive selection under pressure protects stereo, peripheral and straddling boxes, and respects the authored distance limit', () => {
  const tree = xrTree({
    front: [[-.5,-.5,-2], [.5,.5,-1]],
    rear: [[-.5,-.5,2], [.5,.5,3]],
    straddling: [[-1,-1,-.1], [1,1,8]],
    peripheral: [[18,-1,1], [19,1,2]],
    nearEyes: [[0,0,.1], [.05,.05,.2]],
    distant: [[0,0,-80], [2,2,-70]],
  });
  const levels = new Int8Array(tree.leaves);
  const distances = new Float32Array(tree.leaves);
  const settings = {...defaultLodSettings(true), splatBudget: tree.levelTotals[1], viewPriority: true, coverage: {mode:'guarded-view'}};
  const run = (overrides = {}, z = 0) => selectLevels(tree, {x:0, y:0, z}, {x:0, y:0, z:-1}, {...settings,...overrides}, levels, distances, 1, .35);
  for (const mode of ['target', 'limit']) {
    const count = run({budgetMode: mode});
    assert.ok(count <= settings.splatBudget);
    assert.equal(levels[xrLeaf(tree, 'rear')], -1);
    for (const id of ['front','nearEyes','straddling','peripheral','distant']) assert.ok(levels[xrLeaf(tree,id)] >= 0, id);
    assert.ok(levels.includes(0), 'the released work refines a retained leaf');
    if (mode === 'limit') assert.equal(levels[xrLeaf(tree, 'distant')], 1);
  }
  run({coverage:{mode:'whole-scene'}});
  assert.ok(levels.every(level => level === 1), 'ordinary whole-scene selection stays intact');
  run({viewPriority:false});
  assert.equal(levels[xrLeaf(tree,'rear')],-1,'the selector applies the resolved coverage rule independently of upgrade ranking');
  run({splatBudget:1000});
  assert.ok(levels.every(level => level >= 0), 'no ranges are removed when all eligible detail fits');
  run({budgetMode:'target'}, -90);
  assert.ok(levels.every(level => level >= 0), 'facing away from the whole asset still publishes a collection');
});

test('immersive snap turns and teleports restore warm coarse ranges before new detail arrives', () => {
  const tree = xrTree({front: [[-1,-1,-3],[1,1,-2]], rear: [[-1,-1,2],[1,1,3]]});
  const front = xrLeaf(tree,'front'), rear = xrLeaf(tree,'rear');
  const camera = new THREE.PerspectiveCamera(60,1,.05,100);
  const settings = {...defaultLodSettings(true), splatBudget:20, residentBudget:20, viewPriority:true, coverage:{mode:'guarded-view'}};
  const stream = new SogLodStream({renderer:{},tree,camera,matrixWorld:new THREE.Matrix4(),settings,degree:0});
  const queued = readyFiles(stream);
  const tick = time => {
    camera.updateMatrixWorld();
    stream.update(time,.35);
    assert.equal(stream.collection.count,stream.stats.shown);
  };
  try {
    for (let time=0;time<=100;time+=10) tick(time);
    assert.deepEqual([stream.shown[front],stream.shown[rear]],[0,-1]);
    assert.ok(stream.baseReady, 'the rear coarse file remains resident despite its tight residency target');
    camera.rotation.y = Math.PI;
    tick(105);
    assert.deepEqual([stream.shown[front],stream.shown[rear]],[-1,1], 'turning can display the other coarse file immediately');
    assert.ok(queued.some(file => file.url.endsWith('/rear-0/meta.json')));
    tick(110);
    assert.equal(stream.shown[rear],0);
    // Move behind the old front leaf looking +Z, so it must reappear too.
    camera.position.z = -4;
    tick(115);
    assert.ok(stream.shown[front] >= 0);
    assert.ok(stream.baseReady);
  } finally {
    stream.dispose();
  }
});

function stereoEyes(fov, aspect) {
  return [-.032,.032].map(x=>{
    const eye=new THREE.PerspectiveCamera(fov,aspect,.05,100);
    eye.position.x=x;
    eye.updateMatrixWorld();
    return eye;
  });
}

function foregroundFixture(boxes, counts) {
  const tree=xrTree(boxes,counts),stereo=new StereoCoverage();
  stereo.update(stereoEyes(90,1),new THREE.Matrix4());
  // Keep guarded coverage identical while withholding the foreground vote.
  const coverageOnly={active:true,outside:(bounds,offset,margin)=>margin===0||stereo.outside(bounds,offset,margin)};
  const select=(budget,eyes=stereo,settings={})=>{
    const out=new Int8Array(tree.leaves),distances=new Float32Array(tree.leaves);
    const count=selectLevels(tree,{x:0,y:0,z:0},{x:0,y:0,z:-1},{...defaultLodSettings(true),splatBudget:budget,viewPriority:true,coverage:{mode:'guarded-view'},...settings},out,distances,1,.35,undefined,eyes);
    return {count,levels:Object.fromEntries(Object.keys(boxes).map(id=>[id,out[xrLeaf(tree,id)]])),distances};
  };
  return {select,coverageOnly};
}

test('under immersive pressure a close floor spanning the view gains detail while central coverage stays intact',()=>{
  const boxes={floor:[[-2,-1.03,-1.62],[1.3,-.75,3.2]],center:[[-.4,-.28,-2.02],[.44,.65,-1.72]],
    medium:[[1.1,-.2,-3.2],[1.7,.68,-2.7]],upper:[[.55,.4,-4],[1.2,1.8,-2.5]],
    left:[[-2.2,-.3,-4],[-1.65,1.3,-3]],side:[[7,-1.2,-1],[8,-.5,-.7]],rear:[[-1,.1,3],[1,1,4]]};
  const counts={floor:[120,65,25,10,3],center:[220,90,40,16,4],medium:[110,44,null,18,4],
    upper:[140,68,27,10,5],left:[88,54,26,9,3],side:[260,110,32,14,7],rear:[90,66,27,11,5]};
  const {select,coverageOnly}=foregroundFixture(boxes,counts),budget=55;
  const old=select(budget,coverageOnly),immersive=select(budget);
  assert.equal(old.levels.floor,4,'the center-only rank left this floor at coarse coverage');
  assert.equal(immersive.levels.floor,2);
  assert.equal(immersive.levels.center,old.levels.center);
  assert.equal(immersive.levels.side,-1);
  assert.equal(immersive.levels.rear,-1);
  assert.ok(immersive.count<=budget);
  assert.ok(select(budget,undefined,{rangeMin:3}).levels.floor>=3,'the authored finest level still caps refinement');
  const desktop={coverage:{mode:'whole-scene'}};
  assert.deepEqual(select(budget,undefined,desktop),select(budget,coverageOnly,desktop));
});

test('immersive residual budget buys the next available finer level through a sparse chain',()=>{
  const boxes={center:[[-.08,-.1,-.82],[.08,.1,-.64]],sparse:[[-.1,-.09,-1.52],[.1,.09,-1.4]],
    far:[[-.13,-.12,-4.12],[.13,.12,-3.9]],wide:[[7,-1.2,-1],[8,-.5,-.7]]};
  const counts={center:[405,120,40,16,4],sparse:[88,33,null,9,3],far:[102,62,30,14,5],wide:[260,110,32,14,7]};
  const {select,coverageOnly}=foregroundFixture(boxes,counts);
  const control=select(87,coverageOnly),stereo=select(87);
  assert.deepEqual(stereo.distances,control.distances,'an on-axis fixture isolates budget use from the new foreground rank');
  assert.equal(control.count,63);
  assert.equal(control.levels.sparse,3,'level zero is unaffordable');
  assert.equal(stereo.levels.sparse,1,'the unused budget pays for level one across the missing level two');
  assert.equal(stereo.count,87);
  assert.equal(select(86).levels.sparse,3,'the intermediate step cannot overshoot by one splat');
});

test('stereo center priority follows the first forward face from inside and outside a loose region',()=>{
  const tree=xrTree({face:[[-.25,.65,-1.7],[.55,1.2,-.9]],loose:[[-3,-80,-4],[3,.85,4]],
    middle:[[-.25,.8,-2.4],[1,2.1,-1.55]],edge:[[2,.05,-2],[3.1,2,-1.1]],out:[[8,2,-1],[8.2,2.3,-.7]]},
    {face:[220,64,28,9,4],loose:[90,40,21,10,3],middle:[100,60,24,13,5],edge:[98,70,19,9,5],out:[120,115,29,12,5]});
  const settings={...defaultLodSettings(true),splatBudget:35,viewPriority:true,coverage:{mode:'guarded-view'}};
  const forward=new THREE.Vector3(.26,.68,-.7).normalize(),loose=xrLeaf(tree,'loose'),face=xrLeaf(tree,'face');
  const run=(travel,stereo=true,coverage=settings.coverage,previous)=>{
    const eye=forward.clone().multiplyScalar(travel),eyes=stereoEyes(90,1),volume=new StereoCoverage();
    for(const camera of eyes){camera.position.add(eye);camera.lookAt(camera.position.clone().add(forward));camera.updateMatrixWorld();}
    volume.update(eyes,new THREE.Matrix4());
    const levels=new Int8Array(tree.leaves),distances=new Float32Array(tree.leaves);
    const total=selectLevels(tree,eye,forward,{...settings,coverage},levels,distances,1,.35,previous,stereo?volume:undefined);
    return {levels,distances,total};
  };
  const exterior=run(-6);
  assert.ok(Math.abs(exterior.distances[loose]-(6+4/forward.z)/2)<1e-6,'entry through the near face determines exterior distance');
  const farther=run(-.45),close=run(0,true,settings.coverage,farther.levels),fresh=run(0),mono=run(0,false);
  assert.ok(close.distances[loose]<farther.distances[loose]);
  assert.ok(Math.abs(close.distances[loose]-.85/(2*forward.y))<1e-6,'exit through the front face determines distance');
  assert.ok(mono.distances[loose]>100,'the loose rear centroid would dominate without valid stereo');
  assert.equal(mono.levels[loose],4);
  assert.equal(close.levels[loose],3);
  assert.equal(fresh.levels[loose],3);
  assert.equal(close.levels[face],mono.levels[face]);
  for(const result of [exterior,farther,close,fresh])assert.ok(result.total<=settings.splatBudget);
  assert.deepEqual(run(0,true,{mode:'whole-scene'}),run(0,false,{mode:'whole-scene'}),'desktop does not use the stereo correction');
});

test('a long offscreen range pays for detail only when its nearest corners also clear the motion guard', () => {
  const stereo = new StereoCoverage();
  stereo.update(stereoEyes(90, 1), new THREE.Matrix4());
  const bounds = new Float32Array([6, -1, -3, 60, 1, -2]);
  assert.equal(stereo.outside(bounds, 0, .35), true);
  bounds[0] = 5;
  assert.equal(stereo.outside(bounds, 0, .35), false, 'motion could reveal the inward end of the same range');
});

test('stereo side exclusion funds nearby floor and central detail at the existing coarse budget', () => {
  const tree=xrTree({
    floor:[[-.5,-.45,-1.15],[.5,-.35,-.55]],
    center:[[-.15,-.1,-1.35],[.15,.25,-.85]],
    left:[[-5,-.25,-1.3],[-4,.25,-.6]],
    right:[[4,-.25,-1.3],[5,.25,-.6]],
  });
  const ids=['floor','center','left','right'];
  const budget=tree.levelTotals[1],settings={...defaultLodSettings(true),splatBudget:budget,viewPriority:true,coverage:{mode:'guarded-view'}};
  const eyes=stereoEyes(70,.75),stereo=new StereoCoverage();
  const identity=new THREE.Matrix4();
  stereo.update(eyes,identity);
  const select=(coverage,viewPriority,eyes)=>{
    const levels=new Int8Array(tree.leaves);
    const count=selectLevels(tree,{x:0,y:0,z:0},{x:0,y:0,z:-1},{...settings,coverage,viewPriority},levels,new Float32Array(tree.leaves),1,.1,undefined,eyes);
    return {count,levels:ids.map(id=>levels[xrLeaf(tree,id)])};
  };
  assert.equal(budget,40);
  assert.deepEqual(select(settings.coverage,true,undefined),{count:budget,levels:[1,1,1,1]},'head-plane-only culling leaves no room for either foreground upgrade');
  assert.deepEqual(select(settings.coverage,true,stereo),{count:36,levels:[0,0,-1,-1]});
  for(const viewPriority of [true,false])assert.deepEqual(select({mode:'whole-scene'},viewPriority,stereo),{count:budget,levels:[1,1,1,1]},'fixed and distance-only whole-scene coverage stay intact');

  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.32,-.71,.21));
  const asset=new THREE.Matrix4().compose(new THREE.Vector3(7,-3,11),rotation,new THREE.Vector3(2.5,2.5,2.5));
  for(const eye of eyes){eye.position.applyMatrix4(asset);eye.quaternion.copy(rotation);eye.updateMatrixWorld();}
  stereo.update(eyes,asset);
  assert.deepEqual(select(settings.coverage,true,stereo),{count:36,levels:[0,0,-1,-1]},'local-space coverage survives an authored move, rotation and scale');
});

test('stereo coverage retains either asymmetric eye, edge straddlers and the motion guard', () => {
  const [left,right]=stereoEyes(90,1),stereo=new StereoCoverage();
  left.projectionMatrix.makePerspective(-.08,.02,.05,-.05,.05,100);
  right.projectionMatrix.makePerspective(-.02,.08,.05,-.05,.05,100);
  stereo.update([left,right],new THREE.Matrix4());
  const outside=(values,margin=0)=>stereo.outside(Float32Array.from(values),0,margin);
  for(const [x,only,other] of [[-2.4,left,right],[2.4,right,left]]){
    const center=new THREE.Vector3(x,0,-2);
    assert.ok(Math.abs(center.clone().project(only).x)<1);
    assert.ok(Math.abs(center.clone().project(other).x)>1);
    const box=[x-.04,-.04,-2.04,x+.04,.04,-1.96];
    assert.equal(outside(box),false,'one eye can retain the region independently');
    stereo.update([other,other],new THREE.Matrix4());
    assert.equal(outside(box),true,'the other eye alone would drop it');
    stereo.update([left,right],new THREE.Matrix4());
  }
  assert.equal(outside([3,-.1,-2.1,5,.1,-1.9]),false,'a leaf whose bounds intersect the right eye stays eligible');
  const justOffscreen=[3.7,-.1,-2.02,3.8,.1,-1.98];
  assert.ok(new THREE.Vector3(3.7,0,-2.02).project(right).x>1,'the entire near-edge box is beyond the wider eye');
  assert.equal(outside(justOffscreen),false,'the angular motion guard retains the near-edge box');
  const guarded=[5.8,-.1,-2.02,5.9,.1,-1.98];
  assert.equal(outside(guarded),true,'the same out-of-view box is removable with no translation allowance');
  assert.equal(outside(guarded,.35),false,'the translation allowance covers the near-margin region in world units');
  assert.equal(outside([8,-.1,-2.1,8.1,.1,-1.9],.35),true,'farther offscreen ranges can still fund refinement');

  const tree=xrTree({
    center:[[-.2,-.2,-2.1],[.2,.2,-1.9]],
    leftOnly:[[-2.44,-.04,-2.04],[-2.36,.04,-1.96]],
    rightOnly:[[2.36,-.04,-2.04],[2.44,.04,-1.96]],
    straddler:[[3,-.1,-2.1],[5,.1,-1.9]],
    guard:[[5.8,-.1,-2.02],[5.9,.1,-1.98]],
    out:[[8,-.1,-2.1],[8.1,.1,-1.9]],
  });
  const budget=tree.levelTotals[1],levels=new Int8Array(tree.leaves);
  const settings={...defaultLodSettings(true),splatBudget:budget,viewPriority:true,coverage:{mode:'guarded-view'}};
  const count=selectLevels(tree,{x:0,y:0,z:0},{x:0,y:0,z:-1},settings,levels,new Float32Array(tree.leaves),1,.35,undefined,stereo);
  assert.ok(count<=budget);
  for(const id of ['leftOnly','rightOnly','straddler','guard'])assert.ok(levels[xrLeaf(tree,id)]>=0,id);
  assert.equal(levels[xrLeaf(tree,'out')],-1);
  assert.equal(levels[xrLeaf(tree,'center')],0);
});

test('the pager restores stereo coverage before its timer on roll, snap or missing eyes', () => {
  const tree=xrTree({
    center:[[-.2,-.2,-2.1],[.2,.2,-1.9]],
    side:[[1.8,-.1,-2.1],[1.9,.1,-1.9]],
    farSide:[[3.8,-.1,-1.7],[3.9,.1,-1.6]],
    upper:[[-.1,1.8,-2.1],[.1,1.9,-1.9]],
  });
  const camera=new THREE.PerspectiveCamera(100,.4,.05,100),eyes=stereoEyes(100,.4);
  const budget=tree.levelTotals[1],settings={...defaultLodSettings(true),splatBudget:budget,residentBudget:budget,viewPriority:true,coverage:{mode:'guarded-view'}};
  const stream=new SogLodStream({renderer:{},tree,camera,matrixWorld:new THREE.Matrix4(),settings,degree:0});
  readyFiles(stream);
  const side=xrLeaf(tree,'side'),upper=xrLeaf(tree,'upper'),farSide=xrLeaf(tree,'farSide');
  const tick=(time,eyeViews=eyes,margin=.1)=>{
    camera.updateMatrixWorld();eyes.forEach(eye=>eye.updateMatrixWorld());
    stream.update(time,margin,eyeViews);
  };
  const nextSelection=(time,action,eyeViews,margin)=>{
    const before=stream.stats.selections;
    action();tick(time,eyeViews,margin);
    assert.equal(stream.stats.selections,before+1,'the view guard bypasses the 100 ms selection timer');
  };
  try{
    for(let time=0;time<=100;time+=10)tick(time);
    assert.equal(stream.shown[side],-1);
    assert.ok(stream.shown[upper]>=0);
    assert.ok(stream.baseReady,'dropped side coverage stays warm');
    const forward=camera.getWorldDirection(new THREE.Vector3());
    nextSelection(102,()=>{for(const view of [camera,...eyes])view.rotation.z=Math.PI/2;});
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(forward)<1e-8,'roll does not rotate the head-forward vector');
    assert.equal(stream.shown[side],1,'the newly visible side draws from warm coarse data on the first roll frame');
    assert.equal(stream.shown[upper],-1);

    const projection=eyes[1].projectionMatrix.clone();
    nextSelection(104,()=>eyes[1].projectionMatrix.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0));
    assert.ok(stream.shown[upper]>=0,'invalid projection restores the now-unproven upper coverage');
    nextSelection(106,()=>eyes[1].projectionMatrix.copy(projection));
    assert.equal(stream.shown[upper],-1,'valid stereo coverage resumes immediately');
    nextSelection(108,()=>{},[]);
    assert.ok(stream.shown[side]>=0&&stream.shown[upper]>=0,'missing eyes conservatively restore resident coverage');

    nextSelection(110,()=>{});
    assert.equal(stream.shown[farSide],-1);
    nextSelection(112,()=>{for(const view of [camera,...eyes])view.rotation.set(0,-1.15,0);});
    assert.equal(stream.shown[farSide],1,'warm far-side coverage appears on the first yaw snap frame');
    assert.ok(stream.baseReady);
  } finally {
    stream.dispose();
  }
});

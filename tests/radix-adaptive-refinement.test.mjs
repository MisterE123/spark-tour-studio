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
    contents: 'export * from "./src/rendering/radix/sog/lod"; export {SogLodStream} from "./src/rendering/radix/sog/lodStream";',
    resolveDir: process.cwd(),
  },
  outfile: bundle, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
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
const {parseLod, SogLodStream, defaultLodSettings, selectLevels} = api;

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

test('with initially slow desktop cadence that improves as budget decreases, walking still requests, lands and displays nearby refinement after reaching minimum detail', () => {
  assert.equal(tree.levelTotals[coarse], floor);
  const settings = {...defaultLodSettings(false), splatBudget: authored};
  const camera = new THREE.PerspectiveCamera(65, 16/9, .05, 20000);
  camera.lookAt(1,0,0);
  const stream = new SogLodStream({renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(), settings, degree: 0});
  // Only substitute file I/O and GPU objects. The selector, request queue,
  // fallback, range tables, collection and residency policy run normally.
  const queued = [];
  const requested = [];
  stream.load = file => {
    file.state = 'loading';
    stream.stats.loading = ++stream.loads;
    requested.push(file);
    queued.push(file);
  };
  stream.land = () => {
    const file = queued.shift();
    if (!file) return;
    file.state = 'resident';
    file.splats = file.required;
    file.resident = {drop() {}};
    stream.stats.loading = --stream.loads;
    stream.changed = true;
  };
  stream.objectOf = (file, key, leaves) => {
    if (key !== file.key) {
      file.key = key;
      file.object = {count: stream.rangesOf(leaves, file.level).meta.count};
    }
    return file.object;
  };
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
    settings.adaptiveMaxSplats = resolved.adaptiveMaxSplats;
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
  const limited = {...manual, adaptiveMaxSplats: floor + 4_000};
  const nearby = select(0, limited);
  assert.ok(nearby.total > floor && nearby.total <= limited.adaptiveMaxSplats);
  assert.ok(nearby.levels[nearStart] < coarse);
  assert.equal(select(0, {...limited, adaptiveMaxSplats: floor - 1}).total, floor);
  assert.equal(select(-1_000, limited).total, floor, 'limit mode does not force refinement outside authored distances');
  assert.equal(select(0, {...limited, rangeMin: coarse, rangeMax: coarse}).total, floor);
  const original = {...manual, splatBudget: authored};
  assert.deepEqual(select(0, {...original, adaptiveMaxSplats: authored}), select(0, original));
});

test('view priority follows turns in place and lens changes without responding to small yaw jitter', () => {
  for (const viewPriority of [true, false]) {
    const settings = {...defaultLodSettings(false), splatBudget: authored, updateAngle: 90, viewPriority};
    const camera = new THREE.PerspectiveCamera(65, 16/9, .05, 20000);
    const stream = new SogLodStream({renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(), settings, degree: 0});
    stream.load = () => {};
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

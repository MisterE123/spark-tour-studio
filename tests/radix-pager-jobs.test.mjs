import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = path.join(root, 'test-output');
await mkdir(artifacts, {recursive: true});
const out = await mkdtemp(path.join(artifacts, 'radix-pager-jobs-'));
test.after(() => rm(out, {recursive: true, force: true}));

class Bitmap {
  width = 2048;
  height = 1000;
  closes = 0;
  close() { this.closes++; }
}

const oldBitmap = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
Object.defineProperty(globalThis, 'ImageBitmap', {configurable: true, value: Bitmap});
test.after(() => {
  if (oldBitmap) Object.defineProperty(globalThis, 'ImageBitmap', oldBitmap);
  else delete globalThis.ImageBitmap;
});

const outfile = path.join(out, 'pager.mjs');
await build({
  stdin: {resolveDir: root, contents: `
    export {SogLodStream} from './src/rendering/radix/sog/lodStream.ts';
    export {defaultLodSettings,parseLod} from './src/rendering/radix/sog/lod.ts';
  `}, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile,
});
const {SogLodStream, defaultLodSettings, parseLod} = await import(pathToFileURL(outfile).href);

const origin = 'https://pager.test/';
const imageNames = ['means-l', 'means-u', 'quats', 'scales', 'sh0'];
const files = imageNames.map(name => `${name}.webp`);
function chunkMetadata(count) {
  return {
    version: 2, count,
    means: {files: files.slice(0, 2), mins: [0, 0, 0], maxs: [1, 1, 1]},
    quats: {files: [files[2]]},
    scales: {files: [files[3]], codebook: Array(256).fill(0)},
    sh0: {files: [files[4]], codebook: Array(256).fill(0)},
  };
}

function leaf(z, lods) {
  return {bound: {min: [-1, -1, z - 1], max: [1, 1, z + 1]}, lods};
}

function fixture(t, {chunks, leaves, count, settings, signal}) {
  const metaFetches = [], imageFetches = [], decodes = new Map(), errors = [];
  t.mock.method(globalThis, 'fetch', async (url, {signal}) => {
    const name = new URL(url).pathname.slice(1);
    if (name.endsWith('/meta.json')) {
      const gate = Promise.withResolvers();
      metaFetches.push({name, signal, ...gate});
      await gate.promise;
      return Response.json(chunkMetadata(count));
    }
    imageFetches.push({name, signal});
    return new Response(name);
  });
  const decoder = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', {configurable: true, value: async blob => {
    const name = await blob.text();
    const gate = Promise.withResolvers();
    const bitmap = new Bitmap();
    decodes.set(name, {bitmap, ...gate});
    return gate.promise;
  }});

  const tree = parseLod({
    lodLevels: Math.max(...leaves.flatMap(node => Object.keys(node.lods).map(Number))) + 1,
    filenames: chunks.map(name => `${name}/meta.json`),
    tree: {bound: {min: [-1, -1, -100], max: [1, 1, 100]}, children: leaves.toReversed()},
  }, `${origin}lod-meta.json`);
  const camera = new THREE.PerspectiveCamera(45, 1);
  camera.updateMatrixWorld();
  const pager = new SogLodStream({
    renderer: {}, tree, camera, matrixWorld: new THREE.Matrix4(),
    settings: {...defaultLodSettings(false), ...settings}, degree: 0, signal,
    onError: error => errors.push(error),
  });
  t.after(async () => {
    pager.dispose();
    for (const gate of metaFetches) gate.resolve();
    for (const gate of decodes.values()) gate.resolve(gate.bitmap);
    try { await until(() => pager.stats.loading === 0, 'disposed pager drains its jobs'); }
    finally {
      if (decoder) Object.defineProperty(globalThis, 'createImageBitmap', decoder);
      else delete globalThis.createImageBitmap;
    }
  });
  return {pager, camera, metaFetches, imageFetches, decodes, errors};
}

async function until(predicate, message) {
  const deadline = performance.now() + 2_000;
  while (!predicate() && performance.now() < deadline) await delay(1);
  assert.ok(predicate(), message);
}

test('pager admits two large chunks and protects the reservation through a failed decode', async t => {
  const chunks = ['a', 'b', 'c', 'd'];
  const count = 2_048_000;
  const leaves = chunks.map((_, file) => leaf(-5 - file * 10, {0: {file, offset: 0, count}}));
  const {pager, metaFetches, imageFetches, decodes, errors} = fixture(t, {chunks, leaves, count});
  pager.update(0);
  assert.deepEqual(metaFetches.map(({name}) => name), chunks.map(name => `${name}/meta.json`));
  assert.equal(imageFetches.length, 0);
  assert.equal(pager.stats.loading, 4);

  // Resolve in priority order, mirroring each fetch settling on its own frame.
  for (const [index, gate] of metaFetches.entries()) {
    gate.resolve();
    if (index < 2) await until(() => {
      pager.update(100 * (index + 1));
      return imageFetches.length === (index + 1) * files.length;
    }, 'metadata reaches the admission gate');
  }
  await until(() => decodes.size === 2 * files.length, 'only two chunks enter decode');
  for (let frame = 5; frame < 25; frame++) pager.update(frame * 100);
  assert.equal(metaFetches.length, 4);
  assert.deepEqual([...new Set(imageFetches.map(({name}) => name.split('/')[0]))], ['a', 'b']);
  assert.equal(pager.stats.loading, 4);

  const a = files.map(name => decodes.get(`a/${name}`));
  a[0].resolve(a[0].bitmap);
  await delay(0);
  a[1].reject(Error('test channel failure'));
  for (const gate of a.slice(2, -1)) gate.resolve(gate.bitmap);
  await until(() => imageFetches.filter(({name}) => name.startsWith('a/')).every(({signal}) => signal.aborted), 'failed channel cancels its sibling fetches');
  assert.equal(a[0].bitmap.closes, 0);
  assert.equal(pager.stats.loading, 4);
  assert.equal(pager.stats.failed, 0);
  pager.update(2500);
  assert.equal(imageFetches.length, 2 * files.length);

  const last = a.at(-1);
  last.resolve(last.bitmap);
  await until(() => pager.stats.failed === 1, 'reservation is released after the last sibling returns');
  assert.deepEqual(a.map(({bitmap}) => bitmap.closes), [1, 0, 1, 1, 1]);
  assert.match(errors[0].message, /test channel failure/);
  pager.update(2600);
  await until(() => files.every(name => decodes.has(`c/${name}`)), 'first waiting file is admitted');
  assert.equal(imageFetches.length, 3 * files.length);
  assert.equal(metaFetches.length, 4, 'admission reuses the waiting file metadata');
});

test('an already aborted scene cannot start pager fetches', t => {
  const signal = AbortSignal.abort();
  const leaves = [leaf(-5, {0: {file: 0, offset: 0, count: 1}})];
  const {pager, metaFetches, imageFetches} = fixture(t, {chunks: ['base'], leaves, count: 1, signal});
  assert.equal(pager.update(0), false);
  assert.deepEqual(metaFetches, []);
  assert.deepEqual(imageFetches, []);
  assert.equal(pager.stats.loading, 0);
});

test('a turn keeps shared fine work and both coarse jobs when another leaf still needs the detail', t => {
  const leaves = [-10, 10].map((z, index) => leaf(z, {
    0: {file: 0, offset: index * 100, count: 100},
    1: {file: index + 1, offset: 0, count: 10},
  }));
  const {pager, camera, metaFetches} = fixture(t, {
    chunks: ['shared', 'south', 'north'], leaves, count: 200,
    settings: {splatBudget: 120, budgetMode: 'target', underfillLimit: 0, viewPriority: true, behindPenalty: 2},
  });
  pager.update(0);
  assert.deepEqual([...pager.inspect().desired], [0, 1]);
  assert.deepEqual(metaFetches.map(({name}) => name), ['south/meta.json', 'north/meta.json', 'shared/meta.json']);
  camera.rotation.y = Math.PI;
  camera.updateMatrixWorld(true);
  pager.update(120);
  assert.deepEqual([...pager.inspect().desired], [1, 0]);
  assert.equal(metaFetches.length, 3);
  assert.ok(metaFetches.every(({signal}) => !signal.aborted));
});

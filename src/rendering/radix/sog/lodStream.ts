// SPDX-License-Identifier: MIT
// Copyright (c) 2026 WORLD LABS TECHNOLOGIES, INC.
// Adapted from https://github.com/sparkjsdev/radix/blob/b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1/examples/sogs/lodStream.ts
// Local changes: imports, validation, cancellation and resource ownership. See ../README.md.
// Streaming a SOG LoD scene into one SplatRenderer's collection. Files load
// on demand and are decoded on the GPU (gpuDecode.ts). Each leaf shows the
// finest resident level from its selected one to underfillLimit levels
// coarser, else the level it showed before, else the nearest resident one
// (coarser first), so a switch never leaves a hole. Loads go by tier, then
// coarsest level first, then nearest (after PlayCanvas's
// GSplatOctreeInstance): every leaf's coarsest level (so the whole scene
// shows at once), leaves showing nothing, the level a leaf should show
// (the selected one, or with underfill the coarsest in its window), then
// one level finer toward the selected one: the view fills coarse first and
// refines a level at a time. The collection has one object per resident file that leaves
// show, drawing a small table of those leaves' ranges (sh.ts rangeLookup:
// a binary search per splat, so a new selection uploads a few KB, where
// per-splat index lists would upload MBs), rebuilt only when they change;
// plus the environment, whole. One file lands per update. Files past the
// resident budget that nothing shows or wants are evicted, least recently
// used first, and freed once no live collection holds them (Resident).
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { ArrayData, GpuArrays, SplatCollection, type AnySplatObject } from "../vendor/radix.module.js";
import { closePrepared, prepareSogGpu, uploadSogGpu, type PreparedSog } from "./gpuDecode.js";
import { availableLevel, fovScale, selectLevels, type LodSettings, type SogLodTree } from "./lod.js";
import {StereoCoverage, XR_GUARD_ANGLE} from './stereo-coverage.js';
import { Resident } from "./resident.js";
import { MAX_RANGES, RANGES_BUNDLE, sogObject, type SogArrays, type SogSelection } from "./sh.js";
import { fetchBytes, urlSource, type SogSource } from "./sog.js";

const MAX_LOADS = 4;
const MIN_SELECT_MS = 100;
const MAX_POOLED = 64;

// Load tiers, the higher first
const PREFETCH = 0;
const SWITCH = 1;
const VISIBLE = 2;
const BASE = 3;
export const TIERS = ["prefetch", "switch", "visible", "base"] as const;

interface LodFile {
  url: string;
  // -1: the environment
  level: number;
  state: "idle" | "metadata" | "waiting" | "preparing" | "ready" | "resident" | "failed";
  gpu?: SogArrays;
  resident?: Resident;
  splats: number;
  required: number;
  lastUsed: number;
  tint: THREE.Color;
  // The object drawing this file's shown ranges, and what it was made from
  key?: string;
  object?: AnySplatObject;
}

interface FileJob {
  file: LodFile;
  controller: AbortController;
  source?: SogSource;
  bytes: number;
  prepared?: PreparedSog;
}

type Priority = [tier: number, level: number, distance: number];
const byPriority = (a: Priority, b: Priority) => b[0] - a[0] || b[1] - a[1] || a[2] - b[2];

export interface LodStats {
  selections: number;
  selected: number;
  shown: number;
  // Leaves showing each level
  shownLevels: number[];
  residentFiles: number;
  residentSplats: number;
  loading: number;
  loaded: number;
  evicted: number;
  failed: number;
  // GPU decode of the last file (download excluded)
  decodeMs: number;
  // The last update's range tables: how many were made, the splats they
  // list and the ms building and uploading them
  lists: number;
  listSplats: number;
  listMs: number;
  // Files wanted and not resident, per tier (TIERS order)
  waiting: number[];
}

export class SogLodStream {
  readonly tree: SogLodTree;
  readonly settings: LodSettings;
  readonly stats: LodStats;
  collection = SplatCollection.EMPTY;
  // While set, update() does nothing (checks read a steady state)
  paused = false;
  private readonly renderer: WebGPURenderer;
  private readonly camera: THREE.Camera;
  private readonly matrixWorld: THREE.Matrix4;
  private readonly files: LodFile[];
  private readonly environment?: LodFile;
  private readonly desired: Int8Array;
  private readonly previousDesired: Int8Array;
  private readonly shown: Int8Array;
  private readonly distance: Float32Array;
  // Every leaf's coarsest level's file: loaded first, never evicted
  private readonly base = new Set<number>();
  private readonly pool: GpuArrays[] = [];
  // Waiting metadata and decoded images both occupy a slot. Only decoded
  // images reserve bytes. A job owns its signal through the last channel.
  private readonly jobs = new Map<LodFile, FileJob>();
  private demand = new Map<LodFile, Priority>();
  private schedulePending = true;
  private degree: number;
  private selectedAt = -Infinity;
  private dirty = true;
  private changed = true;
  private disposed = false;
  private readonly eye = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly lastEye = new THREE.Vector3(Infinity, 0, 0);
  private readonly lastForward = new THREE.Vector3();
  private lastFovScale = NaN;
  private lastHeadMargin = 0;
  private readonly toObject = new THREE.Matrix4();
  private readonly stereoCoverage = new StereoCoverage();
  private readonly onError?: (error: Error) => void;
  private readonly unlinkAbort?: () => void;
  private pendingBytes = 0;
  private readonly maxPendingBytes: number;
  private readonly selection?: SogSelection;

  constructor({ renderer, tree, camera, matrixWorld, settings, degree, signal, onError, selection, maxPendingBytes = 128 * 1024 * 1024 }: {
    renderer: WebGPURenderer;
    tree: SogLodTree;
    camera: THREE.Camera;
    matrixWorld: THREE.Matrix4;
    settings: LodSettings;
    degree: number;
    signal?: AbortSignal;
    onError?: (error: Error) => void;
    maxPendingBytes?: number;
    selection?: SogSelection;
  }) {
    this.renderer = renderer;
    this.tree = tree;
    this.camera = camera;
    this.matrixWorld = matrixWorld;
    this.settings = settings;
    this.degree = degree;
    this.onError = onError;
    this.maxPendingBytes = Math.max(16 * 1024 * 1024, maxPendingBytes);
    this.selection = selection;
    if (signal) {
      const canceled = () => this.dispose();
      signal.addEventListener('abort', canceled, {once: true});
      this.unlinkAbort = () => signal.removeEventListener('abort', canceled);
    }
    const file = (url: string, level: number): LodFile => ({ url, level, state: "idle", splats: 0, required: 0, lastUsed: 0, tint: new THREE.Color(1, 1, 1) });
    this.files = tree.files.map((url, i) => file(url, tree.fileLevel[i]));
    this.environment = tree.environment ? file(tree.environment, -1) : undefined;
    for (let at = 0; at < tree.file.length; at += 1) if (tree.file[at] >= 0) {
      const each = this.files[tree.file[at]];
      each.required = Math.max(each.required, tree.offset[at] + tree.count[at]);
    }
    this.desired = new Int8Array(tree.leaves).fill(-1);
    this.previousDesired = new Int8Array(tree.leaves);
    this.shown = new Int8Array(tree.leaves).fill(-1);
    this.distance = new Float32Array(tree.leaves);
    for (let leaf = 0; leaf < tree.leaves; leaf += 1) {
      this.base.add(tree.file[leaf * tree.levels + availableLevel(tree, leaf, tree.levels - 1)]);
    }
    this.stats = {
      selections: 0, selected: 0, shown: 0, shownLevels: new Array<number>(tree.levels).fill(0),
      residentFiles: 0, residentSplats: 0, loading: 0, loaded: 0, evicted: 0, failed: 0, decodeMs: 0, lists: 0, listSplats: 0, listMs: 0,
      waiting: TIERS.map(() => 0),
    };
    this.applyTints();
    if (signal?.aborted) this.dispose();
  }

  // Settings changed (selection, tints): re-select at the next update
  invalidate() {
    this.dirty = true;
    this.applyTints();
  }

  setDegree(degree: number) {
    if (degree !== this.degree) {
      this.degree = degree;
      this.changed = true;
    }
  }

  get baseReady() { return [...this.base].every(f => this.files[f].state === 'resident'); }
  get baseFailed() { return [...this.base].some(f => this.files[f].state === 'failed'); }
  retry() {
    for (const file of [...this.files, ...(this.environment ? [this.environment] : [])]) if (file.state === 'failed') file.state = 'idle';
    this.stats.failed = 0;
    this.dirty = this.changed = true;
  }

  // Re-select if the camera moved, settings changed or a file landed, load
  // what is wanted and rebuild the objects that changed; whether the
  // collection is new
  update(now = performance.now(), headMargin = 0, eyes?: readonly THREE.Camera[]): boolean {
    if (this.disposed || this.paused) {
      return false;
    }
    const s = this.settings;
    this.stereoCoverage.update(s.coverage.mode === 'guarded-view' && Number.isFinite(headMargin) ? eyes : undefined, this.matrixWorld);
    this.toObject.copy(this.matrixWorld).invert();
    this.eye.setFromMatrixPosition(this.camera.matrixWorld).applyMatrix4(this.toObject);
    this.camera.getWorldDirection(this.forward).transformDirection(this.toObject);
    // A view-centered budget must follow a turn before the old focus leaves
    // the screen. Respect any finer authored angle.
    const turnAngle = s.viewPriority && s.behindPenalty > 1 ? Math.min(s.updateAngle, 6) : s.updateAngle;
    const distance = this.eye.distanceTo(this.lastEye);
    const angle = THREE.MathUtils.radToDeg(this.forward.angleTo(this.lastForward));
    const moved = distance > s.updateDistance || angle > turnAngle;
    // A snap turn, head roll or teleport can cross an eye’s guard between adjacent
    // frames. Restore newly visible resident coverage on the next update.
    const crossedGuard = s.coverage.mode === 'guarded-view' && (angle >= XR_GUARD_ANGLE || headMargin > 0 && distance >= headMargin
      || headMargin === Infinity && this.lastHeadMargin !== Infinity
      || this.stereoCoverage.changed(XR_GUARD_ANGLE, headMargin));
    const perspective = this.camera as THREE.PerspectiveCamera;
    const fov = perspective.isPerspectiveCamera ? fovScale(perspective.fov, perspective.aspect) : 1;
    const projectionChanged = Math.abs(fov - this.lastFovScale) > 1e-4;
    const changedView = moved || this.dirty || projectionChanged || headMargin !== this.lastHeadMargin
      || this.stereoCoverage.changed(turnAngle, s.updateDistance);
    if (!s.freeze && (crossedGuard || (changedView && now - this.selectedAt >= MIN_SELECT_MS))) {
      // Only carry fine-detail preferences across continuous motion. A new
      // viewpoint, wide turn, lens or preset should choose its own detail.
      const continuous = s.viewPriority && !this.dirty && !projectionChanged
        && angle < XR_GUARD_ANGLE && distance < s.baseDistance * .25;
      if (continuous) this.previousDesired.set(this.desired);
      this.selectedAt = now;
      this.dirty = false;
      this.lastEye.copy(this.eye);
      this.lastForward.copy(this.forward);
      this.lastFovScale = fov;
      this.lastHeadMargin = headMargin;
      this.stats.selected = selectLevels(this.tree, this.eye, this.forward, s, this.desired, this.distance, fov, headMargin,
        continuous ? this.previousDesired : undefined, this.stereoCoverage);
      this.stereoCoverage.remember();
      this.stats.selections += 1;
      this.changed = true;
    }
    if (!this.changed && !this.schedulePending) return false;
    this.schedulePending = false;
    if (this.changed) this.demand = this.priorities();
    // Cancel superseded detail before uploading images for this view.
    for (const job of this.jobs.values()) {
      if (!this.demand.has(job.file)) this.cancelJob(job);
    }
    const landed = this.landNext();
    const redraw = this.changed || landed;
    this.changed = false;
    if (redraw) {
      this.show(now);
      if (landed) this.demand = this.priorities();
    }
    this.schedule(now);
    if (redraw) this.evict(this.demand);
    return redraw;
  }

  // What each file's object draws (checks): the file, its level, the
  // leaves whose ranges it draws, its range table and splats, the leaves'
  // levels, and which levels are resident
  inspect() {
    const objects = this.files.flatMap((file, f) => {
      const data = file.object?.data as { ranges?: GpuArrays } | undefined;
      const leaves = file.key?.split("|")[1]?.split(",").map(Number) ?? [];
      return file.object ? [{ file: f, level: file.level, leaves, ranges: data?.ranges, count: file.object.count, gpu: file.gpu! }] : [];
    });
    return { objects, shown: this.shown, desired: this.desired, resident: (leaf: number, level: number) => this.resident(leaf, level) };
  }

  /** Bounded CPU surface proxies only read coarsest coverage, not every level. */
  proxySources() {
    return [...this.base].flatMap(f => {
      const file = this.files[f];
      return file.gpu && file.resident ? [{key: file.url, arrays: file.gpu.arrays, retain: () => file.resident!.hold()}] : [];
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unlinkAbort?.();
    for (const file of [...this.files, ...(this.environment ? [this.environment] : [])]) {
      file.resident?.drop();
    }
    for (const job of this.jobs.values()) this.cancelJob(job);
    this.demand.clear();
    this.pool.forEach((list) => list.dispose());
    this.pool.length = 0;
    this.collection = SplatCollection.EMPTY;
  }

  // The level a leaf should show (it requests it): its selected level, or
  // with underfill the finest resident one in its window, else the
  // coarsest it has there
  private target(leaf: number): number {
    const want = this.desired[leaf];
    const underfill = Math.max(0, Math.floor(this.settings.underfillLimit));
    if (want < 0 || underfill === 0) {
      return want;
    }
    const last = Math.min(this.tree.levels - 1, want + underfill);
    for (let level = want; level <= last; level += 1) {
      if (this.resident(leaf, level)) {
        return level;
      }
    }
    for (let level = last; level > want; level -= 1) {
      if (this.tree.file[leaf * this.tree.levels + level] >= 0) {
        return level;
      }
    }
    return want;
  }

  // Start loads by tier, then coarsest level first, then nearest leaf (the
  // environment first of all); the files wanted
  private priorities(): Map<LodFile, Priority> {
    const { tree, distance } = this;
    const priority = new Map<LodFile, Priority>();
    if (this.environment) priority.set(this.environment, [BASE + 1, -1, 0]);
    const want = (f: number, tier: number, d: number) => {
      const file = this.files[f];
      const current = priority.get(file);
      // Every leaf sharing this file has the same file level.
      if (!current || tier > current[0] || (tier === current[0] && d < current[2])) {
        priority.set(file, [tier, file.level, d]);
      }
    };
    for (const f of this.base) {
      want(f, BASE, -1);
    }
    for (let leaf = 0; leaf < tree.leaves; leaf += 1) {
      const target = this.target(leaf);
      if (target < 0) {
        continue;
      }
      const base = leaf * tree.levels;
      if (!this.resident(leaf, target)) {
        want(tree.file[base + target], this.shown[leaf] < 0 ? VISIBLE : SWITCH, distance[leaf]);
      }
      // One level finer toward the selected one
      for (let level = target - 1; level >= this.desired[leaf]; level -= 1) {
        if (tree.file[base + level] >= 0) {
          want(tree.file[base + level], PREFETCH, distance[leaf]);
          break;
        }
      }
    }

    return priority;
  }

  private schedule(now: number) {
    this.stats.waiting.fill(0);
    const queue: [LodFile, Priority][] = [];
    for (const [file, rank] of this.demand) {
      file.lastUsed = now;
      if (file.level >= 0 && file.state !== 'resident') this.stats.waiting[rank[0]]++;
      if (file.state === 'waiting' || file.state === 'idle') queue.push([file, rank]);
    }
    queue.sort((a, b) => byPriority(a[1], b[1]));
    for (const [file] of queue) {
      if (file.state === 'waiting') this.admit(this.jobs.get(file)!);
      else if (this.jobs.size < MAX_LOADS) this.start(file);
    }
  }

  private start(file: LodFile) {
    const job: FileJob = {file, controller: new AbortController(), bytes: 0};
    this.jobs.set(file, job);
    this.stats.loading = this.jobs.size;
    file.state = 'metadata';
    void this.readMetadata(job);
  }

  private async readMetadata(job: FileJob) {
    const {file, controller: {signal}} = job;
    try {
      const bytes = await fetchBytes(file.url, undefined, 'loading metadata', signal);
      signal.throwIfAborted();
      const source = urlSource(file.url, JSON.parse(new TextDecoder().decode(bytes)), undefined, signal);
      if (source.meta.count < file.required) throw new Error("SOG LoD ranges exceed their source file's splat count.");
      if (this.imageBytes(source) > this.maxPendingBytes) throw new Error("This SOG LoD chunk is too large to prepare safely. Re-export with smaller LoD chunks.");
      job.source = source;
      file.state = 'waiting';
      this.schedulePending = true;
    } catch (error) { this.failJob(job, error); }
  }

  private imageBytes(source: SogSource) {
    return source.meta.count * (source.meta.shN ? 28 : 24);
  }

  private admit(job: FileJob) {
    const source = job.source!;
    const bytes = this.imageBytes(source);
    if (this.pendingBytes + bytes > this.maxPendingBytes) return;
    job.bytes = bytes;
    this.pendingBytes += bytes;
    job.file.state = 'preparing';
    void this.prepare(job, source);
  }

  private async prepare(job: FileJob, source: SogSource) {
    try {
      job.prepared = await prepareSogGpu(source);
      job.controller.signal.throwIfAborted();
      job.file.state = 'ready';
      this.schedulePending = true;
    } catch (error) { this.failJob(job, error); }
  }

  private cancelJob(job: FileJob) {
    if (job.controller.signal.aborted) return;
    job.controller.abort();
    // An asynchronous decoder still owns its memory until it acknowledges
    // cancellation. Never free that reservation for a second decode early.
    if (job.file.state === 'waiting' || job.file.state === 'ready') this.endJob(job, 'idle');
  }

  private endJob(job: FileJob, state: LodFile['state']) {
    if (job.prepared) closePrepared(job.prepared);
    this.pendingBytes -= job.bytes;
    this.jobs.delete(job.file);
    job.file.state = state;
    this.stats.loading = this.jobs.size;
    this.schedulePending = true;
  }

  private failJob(job: FileJob, error: unknown) {
    const canceled = job.controller.signal.aborted;
    this.endJob(job, canceled ? 'idle' : 'failed');
    if (canceled) return;
    this.stats.failed++;
    this.onError?.(new Error(`SOG LoD: ${job.file.url}: ${error instanceof Error ? error.message : String(error)}`, {cause: error}));
  }

  // Land at most one file per frame, preferring current visible demand.
  private landNext(): boolean {
    let next: FileJob | undefined;
    for (const job of this.jobs.values()) {
      if (job.file.state !== 'ready' || !this.demand.has(job.file)) continue;
      if (!next || byPriority(this.demand.get(job.file)!, this.demand.get(next.file)!) < 0) next = job;
    }
    if (!next) return false;
    const file = next.file, prepared = next.prepared!;
    next.prepared = undefined; // uploadSogGpu owns and closes these images.
    const start = performance.now();
    let gpu: SogArrays;
    try { gpu = uploadSogGpu(this.renderer, prepared); }
    catch (error) { this.failJob(next, error); return false; }
    this.stats.decodeMs = performance.now() - start;
    file.gpu = gpu;
    file.splats = gpu.arrays.count;
    file.resident = new Resident(() => {
      gpu.arrays.dispose();
      gpu.palette?.dispose();
    });
    this.endJob(next, 'resident');
    this.stats.loaded++;
    return true;
  }

  private returnTable(table: GpuArrays) {
    if (this.disposed || this.pool.length >= MAX_POOLED) {
      table.dispose();
    } else {
      this.pool.push(table);
    }
  }

  private resident(leaf: number, level: number) {
    const f = level >= 0 && level < this.tree.levels ? this.tree.file[leaf * this.tree.levels + level] : -1;
    return f >= 0 && this.files[f].state === "resident";
  }

  // The shown level of every leaf, then one object per file shown
  private show(now: number) {
    const { tree, desired, shown, stats } = this;
    const ranges = new Map<number, number[]>();
    stats.shownLevels.fill(0);
    stats.shown = 0;
    for (let leaf = 0; leaf < tree.leaves; leaf += 1) {
      let level = -1;
      const want = desired[leaf];
      if (want >= 0) {
        const target = this.target(leaf);
        if (this.resident(leaf, target)) {
          level = target;
        } else if (this.resident(leaf, shown[leaf])) {
          level = shown[leaf];
        } else {
          for (let step = 1; step < tree.levels && level < 0; step += 1) {
            level = this.resident(leaf, want + step) ? want + step : this.resident(leaf, want - step) ? want - step : -1;
          }
        }
      }
      shown[leaf] = level;
      if (level >= 0) {
        const at = leaf * tree.levels + level;
        const list = ranges.get(tree.file[at]) ?? [];
        list.push(leaf);
        ranges.set(tree.file[at], list);
        stats.shownLevels[level] += 1;
        stats.shown += tree.count[at];
      }
    }

    stats.lists = stats.listSplats = stats.listMs = 0;
    const objects: AnySplatObject[] = [];
    const env = this.environment;
    if (env?.state === "resident") {
      objects.push(this.objectOf(env, `env|${this.degree}`, undefined));
    }
    this.files.forEach((file, f) => {
      const leaves = ranges.get(f);
      if (!leaves) {
        file.key = file.object = undefined;
        return;
      }
      file.lastUsed = now;
      objects.push(this.objectOf(file, `${this.degree}|${leaves.join(",")}`, leaves));
    });
    this.collection = objects.length > 0 ? new SplatCollection(objects) : SplatCollection.EMPTY;
  }

  // The file's object for `key`, made anew when the key changed
  private objectOf(file: LodFile, key: string, leaves: number[] | undefined): AnySplatObject {
    if (file.key === key && file.object) {
      return file.object;
    }
    const gpu = file.gpu!;
    const release = file.resident!.hold();
    let ranges: GpuArrays | undefined;
    let count = gpu.arrays.count;
    if (leaves) {
      const start = performance.now();
      const table = this.rangesOf(leaves, file.level);
      count = table.meta.count as number;
      ranges = this.pool.pop() ?? new GpuArrays({ renderer: this.renderer, bundles: { ranges: RANGES_BUNDLE } });
      ranges.upload(table);
      this.stats.lists += 1;
      this.stats.listSplats += count;
      this.stats.listMs += performance.now() - start;
    }
    const pooled = ranges;
    file.key = key;
    file.object = sogObject(gpu, {
      degree: this.degree, matrixWorld: this.matrixWorld, ranges, count, tint: file.tint,
      selection: this.selection,
      release: () => {
        if (pooled) {
          this.returnTable(pooled);
        }
        release();
      },
    });
    return file.object;
  }

  // The ranges of `leaves` at `level` (all in one file) as a RANGES_BUNDLE
  // table: sorted by offset, touching ranges merged; meta.count the splats
  private rangesOf(leaves: number[], level: number): ArrayData {
    const { tree } = this;
    const spans = leaves.map((leaf) => leaf * tree.levels + level).sort((a, b) => tree.offset[a] - tree.offset[b]);
    const rows: number[] = [];
    let total = 0;
    let end = -1;
    for (const at of spans) {
      const offset = tree.offset[at];
      if (offset !== end) {
        rows.push(total, offset);
      }
      total += tree.count[at];
      end = offset + tree.count[at];
    }
    if (rows.length / 2 > MAX_RANGES) {
      throw new Error(`SOG LoD: ${rows.length / 2} ranges in one file (at most ${MAX_RANGES})`);
    }
    const table = new ArrayData({ count: rows.length / 2, meta: { count: total } }).addBundle("ranges", RANGES_BUNDLE);
    table.bundles.ranges.channels.range.data.set(rows);
    return table;
  }

  // Past the resident budget, drop files nothing shows or wants, least
  // recently used first
  private evict(wanted: ReadonlyMap<LodFile, Priority>) {
    const all = [...this.files, ...(this.environment ? [this.environment] : [])];
    let splats = all.reduce((sum, file) => sum + (file.state === "resident" ? file.splats : 0), 0);
    const candidates = this.files
      .filter(file => file.state === "resident" && !file.object && !wanted.has(file))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const file of candidates) {
      if (splats <= this.settings.residentBudget) {
        break;
      }
      splats -= file.splats;
      file.state = "idle";
      file.gpu = undefined;
      file.resident!.drop();
      file.resident = undefined;
      this.stats.evicted += 1;
    }
    this.stats.residentSplats = splats;
    this.stats.residentFiles = all.filter((file) => file.state === "resident").length;
  }

  private applyTints() {
    const levels = this.tree.levels;
    for (const file of this.files) {
      if (this.settings.colorLevels && file.level >= 0) {
        file.tint.setHSL((file.level / Math.max(1, levels)) * 0.8, 0.9, 0.6);
      } else {
        file.tint.setRGB(1, 1, 1);
      }
    }
  }
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 WORLD LABS TECHNOLOGIES, INC.
// Adapted from https://github.com/sparkjsdev/radix/blob/b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1/examples/sogs/lod.ts
// Local changes: imports, validation, cancellation and resource ownership. See ../README.md.
// SOG LoD scenes (PlayCanvas's lod-meta.json, written by splat-transform):
// a tree of bounds whose leaves each name, per level (0 finest), a range
// { file, offset, count } of one of the scene's SOG files (unbundled
// meta.json folders, named <level>_<unit>, many leaves per file), plus an
// optional environment SOG drawn whole. parseLod flattens the leaves into
// typed arrays; selectLevels picks a level per leaf from the camera, after
// PlayCanvas's GSplatOctreeInstance and GSplatBudgetBalancer (engine
// 2.23): the distance to the leaf's box (longer behind the camera, scaled
// by the field of view) against thresholds s * baseDistance * multiplier^i,
// clamped to a range, with one scale s for the whole scene fitted to the
// splat budget: in "target" mode the largest s that fits (detail rises to
// fill the budget), in "limit" mode the same but at most 1 (the distances
// are the most detail allowed).
import {sogResourceUrl} from './sog.js';
import type {RadixCoveragePolicy} from '../../../../shared/radix-performance.mjs';

interface RawNode {
  bound: { min: number[]; max: number[] };
  children?: RawNode[];
  lods?: Record<string, { file: number; offset: number; count: number }>;
}

interface RawLodMeta {
  lodLevels: number;
  filenames: string[];
  environment?: string | null;
  tree: RawNode;
  counts?: number[];
}

export interface SogLodTree {
  url: string;
  levels: number;
  // Absolute meta.json URLs, and the level each one holds
  files: string[];
  fileLevel: Int8Array;
  environment?: string;
  leaves: number;
  // Per leaf: min xyz, max xyz
  bounds: Float32Array;
  // Per leaf and level (leaf * levels + level): the range, file -1 for none
  file: Int32Array;
  offset: Uint32Array;
  count: Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
  // Splats of all leaves per level, and what the file says they are
  levelTotals: number[];
  counts?: number[];
}

// "target": detail rises until the budget is used; "limit": the distances
// decide and the budget only lowers detail
export type BudgetMode = "target" | "limit";

export interface LodSettings {
  baseDistance: number;
  multiplier: number;
  rangeMin: number;
  rangeMax: number;
  behindPenalty: number;
  // Splats selected (0: none; target: the finest everywhere, limit: the
  // distances alone)
  splatBudget: number;
  coverage: RadixCoveragePolicy;
  // Prioritize upgrades toward the view when eligible detail exceeds the budget.
  viewPriority?: boolean;
  budgetMode: BudgetMode;
  // Levels coarser than the selected one a leaf may show while the
  // selected one loads (the finest resident in that window; 0: the
  // selected one only, else what it showed before)
  underfillLimit: number;
  // Most splats of loaded files kept on the GPU
  residentBudget: number;
  // Re-select after the camera moves this far (object units) or turns this
  // many degrees (turning only matters through behindPenalty)
  updateDistance: number;
  updateAngle: number;
  freeze: boolean;
  colorLevels: boolean;
}

// After PlayCanvas's streaming examples, but the budget caps rather than
// fills: a filled budget is often more than the GPU (or the CPU sort's
// sort and upload) keeps at frame rate while flying, where the distances'
// own selection is often well under it
export function defaultLodSettings(cpuSort: boolean): LodSettings {
  return {
    baseDistance: 5, multiplier: 3, rangeMin: 0, rangeMax: 7, behindPenalty: 2,
    splatBudget: cpuSort ? 2_000_000 : 4_000_000, budgetMode: "limit", coverage: {mode: 'whole-scene'}, underfillLimit: 5, residentBudget: 16_000_000,
    updateDistance: 0.5, updateAngle: 90, freeze: false, colorLevels: false,
  };
}

// The distance scale of a perspective camera's field of view against
// PlayCanvas's reference 45 degrees (vertical), by the narrower of the two
// half angles: wider views see leaves smaller, so farther
export function fovScale(fov: number, aspect: number): number {
  const tanHalfV = Math.tan((fov * Math.PI) / 360);
  const tanHalfH = tanHalfV * (aspect > 0 && Number.isFinite(aspect) ? aspect : 1);
  return Math.min(tanHalfV, tanHalfH) / Math.tan(Math.PI / 8);
}

export function isLodMeta(json: unknown): boolean {
  const meta = json as RawLodMeta;
  return typeof meta === "object" && meta !== null && typeof meta.lodLevels === "number" && Array.isArray(meta.filenames) && typeof meta.tree === "object";
}

export function parseLod(json: unknown, url: string): SogLodTree {
  if (!isLodMeta(json)) {
    throw new Error("Not a SOG lod-meta.json");
  }
  const meta = json as RawLodMeta;
  const levels = meta.lodLevels;
  if (!Number.isInteger(levels) || levels < 1 || levels > 32 || meta.filenames.length < 1 || meta.filenames.length > 100_000) throw new Error("SOG LoD has an invalid level or file count.");
  const urls = meta.filenames.map(name => sogResourceUrl(name, url));
  const raw: RawNode[] = [];
  const stack = [meta.tree];
  const seen = new Set<RawNode>();
  const validBound = (node: RawNode) => [node?.bound?.min, node?.bound?.max].every(values => Array.isArray(values) && values.length === 3 && values.every(value => Number.isFinite(value) && Math.abs(value) <= 3.4e38)) && node.bound.min.every((v, axis) => v <= node.bound.max[axis]);
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!validBound(node) || seen.has(node) || seen.size >= 2_000_000) throw new Error("SOG LoD contains invalid or excessive bounds.");
    seen.add(node);
    if (node.lods) {
      raw.push(node);
    }
    if (node.children && (!Array.isArray(node.children) || node.children.length > 100_000)) throw new Error("SOG LoD contains invalid children.");
    for (const child of node.children ?? []) stack.push(child);
  }

  const leaves = raw.length;
  if (leaves < 1 || leaves > 1_000_000 || leaves * levels > 8_000_000) throw new Error("SOG LoD contains an unsupported number of leaf ranges.");
  const bounds = new Float32Array(leaves * 6);
  const file = new Int32Array(leaves * levels).fill(-1);
  const offset = new Uint32Array(leaves * levels);
  const count = new Uint32Array(leaves * levels);
  const fileLevel = new Int8Array(meta.filenames.length).fill(-1);
  const levelTotals = new Array<number>(levels).fill(0);
  raw.forEach((node, leaf) => {
    bounds.set(node.bound.min, leaf * 6);
    bounds.set(node.bound.max, leaf * 6 + 3);
    for (const [key, range] of Object.entries(node.lods!)) {
      const level = Number(key);
      if (!Number.isInteger(level) || level < 0 || level >= levels || !range || !Number.isSafeInteger(range.file) || range.file < 0 || range.file >= urls.length || !Number.isSafeInteger(range.offset) || range.offset < 0 || !Number.isSafeInteger(range.count) || range.count < 0 || range.offset + range.count > 0xffffffff) throw new Error("SOG LoD contains an invalid splat range.");
      if (range.count === 0) continue;
      if (fileLevel[range.file] !== -1 && fileLevel[range.file] !== level) throw new Error("One SOG LoD file is assigned to several levels.");
      const at = leaf * levels + level;
      file[at] = range.file;
      offset[at] = range.offset;
      count[at] = range.count;
      fileLevel[range.file] = level;
      levelTotals[level] += range.count;
    }
  });
  for (let leaf = 0; leaf < leaves; leaf += 1) if (!file.subarray(leaf * levels, (leaf + 1) * levels).some(f => f >= 0)) throw new Error("SOG LoD contains an empty leaf.");

  return {
    url,
    levels,
    files: urls,
    fileLevel,
    environment: meta.environment ? sogResourceUrl(meta.environment, url) : undefined,
    leaves,
    bounds,
    file,
    offset,
    count,
    min: meta.tree.bound.min as [number, number, number],
    max: meta.tree.bound.max as [number, number, number],
    levelTotals,
    counts: meta.counts,
  };
}

// The level of `leaf` nearest `level` that it has, coarser first; -1 if none
export function availableLevel(tree: SogLodTree, leaf: number, level: number): number {
  const base = leaf * tree.levels;
  for (let l = level; l < tree.levels; l += 1) {
    if (tree.file[base + l] >= 0) {
      return l;
    }
  }
  for (let l = level - 1; l >= 0; l -= 1) {
    if (tree.file[base + l] >= 0) {
      return l;
    }
  }
  return -1;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

// Every leaf's levels over a level range: band b (0 finest) is level
// rangeMin + b, snapped to a level the leaf has (availableLevel), with its
// splats; a leaf missing a level repeats a neighbor, so that band step
// changes nothing
export interface LevelChains {
  rangeMin: number;
  span: number;
  // Per leaf and band (leaf * span + b); level -1: the leaf has none
  level: Int8Array;
  count: Float64Array;
  // Splats of all leaves at the finest and the coarsest band
  finest: number;
  coarsest: number;
}

const chainCache = new WeakMap<SogLodTree, LevelChains>();

export function levelChains(tree: SogLodTree, rangeMin: number, rangeMax: number): LevelChains {
  rangeMax = Math.max(0, Math.min(rangeMax, tree.levels - 1));
  rangeMin = Math.max(0, Math.min(rangeMin, rangeMax));
  const cached = chainCache.get(tree);
  if (cached && cached.rangeMin === rangeMin && cached.span === rangeMax - rangeMin + 1) {
    return cached;
  }
  const span = rangeMax - rangeMin + 1;
  const level = new Int8Array(tree.leaves * span);
  const count = new Float64Array(tree.leaves * span);
  let finest = 0;
  let coarsest = 0;
  for (let leaf = 0; leaf < tree.leaves; leaf += 1) {
    for (let b = 0; b < span; b += 1) {
      const l = availableLevel(tree, leaf, rangeMin + b);
      level[leaf * span + b] = l;
      count[leaf * span + b] = l >= 0 ? tree.count[leaf * tree.levels + l] : 0;
    }
    finest += count[leaf * span];
    coarsest += count[leaf * span + span - 1];
  }
  const chains = { rangeMin, span, level, count, finest, coarsest };
  chainCache.set(tree, chains);
  return chains;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

// The budget fit's axis: ln s over [-48, 48] in BINS bins (any scene's
// switch points fall inside; ones outside share an end bin), the bin that
// runs out of budget split again into BINS sub-bins. s = 1 falls on the
// edge of bin BINS / 2, so limit mode keeps the configured distances
// exactly.
const BINS = 1024;
const LOG_MIN = -48;
const BIN_SCALE = BINS / 96;
const UNIT_BIN = BINS / 2;
const histogram = new Float64Array(BINS);
let logDistances = new Float64Array(0);
let viewLogDistances = new Float64Array(0);
let finestAllowedBand = new Uint8Array(0);
let rearLeaves = new Uint8Array(0);

const binOf = (x: number) => Math.min(BINS - 1, Math.max(0, Math.floor(x)));

// A soft center cone in the camera's viewing direction. As in Spark's
// traversal, interpolate in cosine space. SOG offers a center per region.
const INNER_COS = Math.cos(20 * Math.PI / 180);
const OUTER_COS = Math.cos(55 * Math.PI / 180);
const FOCUS_SLOPE = Math.tan(6 * Math.PI / 180);
// Keep the entire forward hemisphere plus space for head motion between selections.
export const XR_REAR_GUARD_ANGLE = 12;
const REAR_GUARD_SIN = Math.sin(XR_REAR_GUARD_ANGLE * Math.PI / 180);
function behindHead(bounds: Float32Array, b: number, eye: Vec3Like, forward: Vec3Like, margin: number): boolean {
  const x0 = bounds[b] - eye.x, x1 = bounds[b + 3] - eye.x;
  const y0 = bounds[b + 1] - eye.y, y1 = bounds[b + 4] - eye.y;
  const z0 = bounds[b + 2] - eye.z, z1 = bounds[b + 5] - eye.z;
  // The most forward corner bounds the depth of every point, including boxes
  // that straddle an eye or the viewing plane despite a rear-facing center.
  const depth = Math.max(x0 * forward.x, x1 * forward.x)
    + Math.max(y0 * forward.y, y1 * forward.y) + Math.max(z0 * forward.z, z1 * forward.z);
  if (depth >= -margin) return false;
  const farthest = Math.sqrt(Math.max(x0 * x0, x1 * x1) + Math.max(y0 * y0, y1 * y1) + Math.max(z0 * z0, z1 * z1));
  return depth < -margin - REAR_GUARD_SIN * farthest;
}
function viewWeight(cosAngle: number): number {
  if (cosAngle >= INNER_COS) return 1;
  if (cosAngle > OUTER_COS) return 0.35 + 0.65 * (cosAngle - OUTER_COS) / (INNER_COS - OUTER_COS);
  return 0.10 + 0.25 * Math.max(0, cosAngle) / OUTER_COS;
}

function cameraPriorityDistance(bounds: Float32Array, b: number, eye: Vec3Like, forward: Vec3Like, nearest: number, penalty: number): number {
  const cx = (bounds[b] + bounds[b + 3]) / 2 - eye.x;
  const cy = (bounds[b + 1] + bounds[b + 4]) / 2 - eye.y;
  const cz = (bounds[b + 2] + bounds[b + 5]) / 2 - eye.z;
  const centerDistance = Math.sqrt(cx * cx + cy * cy + cz * cz);
  // Several boxes can contain the eye. Their centers distinguish a nearby
  // surface from the far side of an overlapping region.
  const distance = Math.max(nearest, 0.35 * centerDistance);
  if (penalty === 0 || centerDistance === 0) return distance;
  const depth = cx * forward.x + cy * forward.y + cz * forward.z;
  const angular = 1 + penalty * (1 / viewWeight(depth / centerDistance) - 1);
  // Sample the view ray at a positive depth even when the eye is inside the
  // box and its center is behind us. A box that extends into the view can
  // cover the foreground; one that merely touches the eye has no such claim.
  const probe = Math.max(distance, depth);
  const hx = (bounds[b + 3] - bounds[b]) / 2;
  const hy = (bounds[b + 4] - bounds[b + 1]) / 2;
  const hz = (bounds[b + 5] - bounds[b + 2]) / 2;
  const mx = Math.max(0, Math.abs(cx - probe * forward.x) - hx);
  const my = Math.max(0, Math.abs(cy - probe * forward.y) - hy);
  const mz = Math.max(0, Math.abs(cz - probe * forward.z) - hz);
  const width = probe * FOCUS_SLOPE;
  const focus = Math.exp(-0.5 * (mx * mx + my * my + mz * mz) / (width * width));
  const onAxis = 1 / (1 + Math.min(1, penalty));
  return distance * ((1 - focus) * angular + focus * onAxis);
}

// The level of every leaf into `out` for a camera at `eye` looking along
// unit `forward` (both in the tree's space) with field-of-view scale
// `fov` (fovScale), and its distance (longer behind the camera, scaled by
// the field of view) into `d`; returns the splats selected. Under immersive
// budget pressure, -1 omits a rear range. headMargin is in tree units.
//
// A leaf at distance d is at band 1 + floor(log_m(d / (s * base))),
// clamped to the range: finer than band L + 1 exactly when
// ln s > ln(d / base) - L ln m (with L counted from rangeMin). All those
// switch points lie on one ln s axis, so a histogram of the splats each
// one adds, summed from the coarsest end, finds the largest s within the
// budget. Stopping at the first sub-bin that does not fit (not skipping
// it) keeps a leaf's level from depending on leaves farther along the
// axis, so small camera moves do not flip levels on and off.
export function selectLevels(tree: SogLodTree, eye: Vec3Like, forward: Vec3Like, s: LodSettings, out: Int8Array, d: Float32Array, fov = 1, headMargin = 0): number {
  const { leaves, bounds } = tree;
  const chains = levelChains(tree, s.rangeMin, s.rangeMax);
  const { span, rangeMin } = chains;
  const canTrimRear = s.coverage.mode === 'guarded-view' && Number.isFinite(headMargin);
  const penalty = Math.max(0, s.behindPenalty - 1);
  const logBase = Math.log(Math.max(1e-6, s.baseDistance));
  const logMultiplier = Math.log(Math.max(1.2, s.multiplier));
  // Bins per band step
  const step = logMultiplier * BIN_SCALE;

  if (logDistances.length < leaves) {
    logDistances = new Float64Array(leaves);
  }
  if (s.viewPriority && viewLogDistances.length < leaves) {
    viewLogDistances = new Float64Array(leaves);
  }
  if ((s.viewPriority || canTrimRear) && finestAllowedBand.length < leaves) {
    finestAllowedBand = new Uint8Array(leaves);
  }
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const b = leaf * 6;
    const dx = Math.max(bounds[b], Math.min(eye.x, bounds[b + 3])) - eye.x;
    const dy = Math.max(bounds[b + 1], Math.min(eye.y, bounds[b + 4])) - eye.y;
    const dz = Math.max(bounds[b + 2], Math.min(eye.z, bounds[b + 5])) - eye.z;
    const nearest = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let distance = nearest;
    // Toward the box's nearest point: 0 side-on, 1 straight behind
    if (penalty > 0 && distance > 0.01) {
      const facing = (dx * forward.x + dy * forward.y + dz * forward.z) / distance;
      if (facing < 0) {
        distance *= 1 - facing * penalty;
      }
    }
    distance *= fov;
    d[leaf] = distance;
    // In bins: the leaf's switch point leaving band b for b - 1 is at
    // position - (rangeMin + b - 1) * step
    logDistances[leaf] = (Math.log(Math.max(distance, 1e-6)) - logBase - LOG_MIN) * BIN_SCALE;
    if (s.viewPriority) {
      const rankDistance = cameraPriorityDistance(bounds, b, eye, forward, nearest, penalty) * fov;
      d[leaf] = rankDistance; // The pager uses the same priority for comparable pending files.
      viewLogDistances[leaf] = (Math.log(Math.max(rankDistance, 1e-6)) - logBase - LOG_MIN) * BIN_SCALE;
    }
  }
  let priorities = logDistances;
  const switchAt = (leaf: number, b: number) => priorities[leaf] - (rangeMin + b - 1) * step;

  // The cut: switch points in bins below cutBin are taken, and in cutBin
  // those in sub-bins below cutSub
  let budget = s.splatBudget > 0 ? s.splatBudget : Infinity;
  if (s.coverage.mode === 'whole-scene-with-allowance' && budget < s.coverage.authoredBudget) {
    // Every leaf needs coarse coverage. At that floor, walking would otherwise
    // select exactly the same levels forever. Leave a small allowance for the
    // nearest upgrades, bounded by both the current workload and the preset.
    const nearAllowance = Math.floor(0.10 * Math.min(chains.coarsest, budget));
    budget = Math.max(budget, Math.min(s.coverage.authoredBudget, chains.coarsest + nearAllowance));
  }
  const limit = s.budgetMode === "limit";
  let { coarsest, finest } = chains;
  let requested = finest;
  if (limit && (coarsest < budget || canTrimRear)) {
    requested = 0;
    for (let leaf = 0; leaf < leaves; leaf += 1) {
      let b = span - 1;
      while (b > 0 && binOf(switchAt(leaf, b)) < UNIT_BIN) b -= 1;
      if (s.viewPriority || canTrimRear) finestAllowedBand[leaf] = b;
      requested += chains.count[leaf * span + b];
    }
  }
  let trimRear = false;
  if (canTrimRear && requested > Math.max(budget, coarsest)) {
    if (rearLeaves.length < leaves) rearLeaves = new Uint8Array(leaves);
    let rearCount = 0, rearCoarse = 0, rearFine = 0, rearRequested = 0;
    for (let leaf = 0; leaf < leaves; leaf += 1) {
      const behind = behindHead(bounds, leaf * 6, eye, forward, headMargin);
      rearLeaves[leaf] = Number(behind);
      if (!behind) continue;
      rearCount += 1;
      const first = leaf * span;
      rearCoarse += chains.count[first + span - 1];
      rearFine += chains.count[first];
      rearRequested += chains.count[first + (limit ? finestAllowedBand[leaf] : 0)];
    }
    // Looking away from the whole asset must still leave a drawable collection.
    // Coarse files stay resident in the pager even when their ranges are omitted.
    trimRear = rearCount > 0 && rearCount < leaves;
    if (trimRear) {
      coarsest -= rearCoarse;
      finest -= rearFine;
      requested -= rearRequested;
    }
  }
  let cutBin = UNIT_BIN;
  let cutSub = 0;
  let cappedByDistance = false;
  if (coarsest >= budget) {
    cutBin = -1;
  } else if (!limit && finest <= budget) {
    cutBin = BINS;
  } else if (requested > budget) {
    // Fit camera-weighted upgrades only within each leaf's original
    // distance limit. If everything eligible fits, keep all of it.
    if (s.viewPriority) priorities = viewLogDistances;
    cappedByDistance = !!s.viewPriority && limit;
    const stop = limit && !s.viewPriority ? UNIT_BIN : BINS;
    let total = coarsest;
    const accumulate = (bin: number) => {
      histogram.fill(0);
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        if (trimRear && rearLeaves[leaf]) continue;
        const finest = cappedByDistance ? finestAllowedBand[leaf] : 0;
        for (let b = finest + 1; b < span; b += 1) {
          const delta = chains.count[leaf * span + b - 1] - chains.count[leaf * span + b];
          if (delta === 0) {
            continue;
          }
          const x = switchAt(leaf, b);
          const at = binOf(x);
          if (bin < 0) {
            histogram[at] += delta;
          } else if (at === bin) {
            histogram[binOf((x - bin) * BINS)] += delta;
          }
        }
      }
    };
    accumulate(-1);
    cutBin = 0;
    while (cutBin < stop && total + histogram[cutBin] <= budget) {
      total += histogram[cutBin];
      cutBin += 1;
    }
    if (cutBin < stop) {
      accumulate(cutBin);
      while (cutSub < BINS && total + histogram[cutSub] <= budget) {
        total += histogram[cutSub];
        cutSub += 1;
      }
    }
  }

  // Each leaf steps finer while its next switch point is taken; switch
  // points rise as bands get finer, so the first one not taken ends it
  let total = 0;
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    if (trimRear && rearLeaves[leaf]) {
      out[leaf] = -1;
      continue;
    }
    const finest = cappedByDistance ? finestAllowedBand[leaf] : 0;
    let b = span - 1;
    if (cutBin >= BINS) {
      b = finest;
    } else if (cutBin >= 0) {
      while (b > finest) {
        const x = switchAt(leaf, b);
        const bin = binOf(x);
        if (bin > cutBin || (bin === cutBin && binOf((x - cutBin) * BINS) >= cutSub)) {
          break;
        }
        b -= 1;
      }
    }
    out[leaf] = chains.level[leaf * span + b];
    total += chains.count[leaf * span + b];
  }
  return total;
}

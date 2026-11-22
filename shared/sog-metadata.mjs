// SPDX-License-Identifier: MIT
// SOG and LoD validation shared with the adapted World Labs SOGS example.
// Copyright (c) 2026 WORLD LABS TECHNOLOGIES, INC. See src/rendering/radix/vendor/LICENSE.
const resourceName = value => typeof value === 'string' && value.length > 0 && !value.includes('\0');
const resources = (value, length) => Array.isArray(value) && value.length === length && value.every(resourceName);
const numbers = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const codebook = values => Array.isArray(values) && values.length === 256 && values.every((value, index) => Number.isFinite(value) || (index === 0 && value === null));

export function inspectSogMeta(meta) {
  if (!meta || typeof meta !== 'object' || !Array.isArray(meta.means?.files) || !Array.isArray(meta.quats?.files) || !Array.isArray(meta.sh0?.files)) {
    throw Error('Not a SOG meta.json.');
  }
  if (![undefined, 1, 2].includes(meta.version)) throw Error('This SOG metadata version is not supported.');
  /** @type {1 | 2} */
  const version = meta.version === 2 ? 2 : 1;
  const { means, scales, quats, sh0, shN } = meta;
  if (version === 1 && quats.encoding && quats.encoding !== 'quaternion_packed') throw Error(`SOGS quaternion encoding ${quats.encoding} is not supported.`);
  const count = version === 2 ? meta.count : means.shape?.[0];
  if (!integer(count, 1) || count > 100_000_000) throw Error('SOG meta.json has no valid splat count.');
  if (!resources(means.files, 2) || !resources(scales?.files, 1) || !resources(quats.files, 1) || !resources(sh0.files, 1) || !numbers(means.mins, 3) || !numbers(means.maxs, 3)) {
    throw Error('SOG metadata has invalid position bounds or channel files.');
  }
  if (means.mins.some((min, axis) => min > means.maxs[axis] || !Number.isFinite(Math.expm1(Math.abs(min))) || !Number.isFinite(Math.expm1(Math.abs(means.maxs[axis]))))) {
    throw Error('SOG position bounds are not finite and ordered.');
  }
  if (version === 1) {
    if (!numbers(scales.mins, 3) || !numbers(scales.maxs, 3) || !numbers(sh0.mins, 4) || !numbers(sh0.maxs, 4)) throw Error('SOGS channel ranges are invalid.');
  } else if (!codebook(scales.codebook) || !codebook(sh0.codebook) || (shN && !codebook(shN.codebook))) {
    throw Error('SOG channel codebooks are invalid.');
  }
  if (shN) {
    if (!resources(shN.files, 2) || (version === 1 && (!Number.isFinite(shN.mins) || !Number.isFinite(shN.maxs)))) throw Error('SOG spherical-harmonics metadata is invalid.');
    // Older writers omitted the degree. The decoder infers it from the image.
    if (version === 2 && shN.bands !== undefined && (!integer(shN.bands, 1) || shN.bands > 3)) throw Error('Invalid SOG harmonic degree.');
  }
  return { version, count, files: [...new Set([means, scales, quats, sh0, shN].filter(Boolean).flatMap(channel => channel.files))] };
}

export function inspectSogLod(meta) {
  if (!meta || ![undefined, 1].includes(meta.version) || !integer(meta.lodLevels, 1) || meta.lodLevels > 32 || !Array.isArray(meta.filenames) || !meta.filenames.length || meta.filenames.length > 100_000 || !meta.filenames.every(resourceName)) {
    throw Error('Invalid Streamed SOG manifest.');
  }
  const { lodLevels, filenames, environment, counts } = meta;
  if (environment != null && !resourceName(environment)) throw Error('Invalid Streamed SOG environment.');
  if (counts !== undefined && (!Array.isArray(counts) || counts.length !== lodLevels || counts.some(count => !integer(count)) || !counts[0])) throw Error('Invalid Streamed SOG detail counts.');

  const stack = [meta.tree], seen = new Set(), leaves = [];
  const fileLevel = new Int8Array(filenames.length).fill(-1);
  const required = new Uint32Array(filenames.length);
  while (stack.length) {
    const node = stack.pop();
    const { min, max } = node?.bound ?? {};
    if (!numbers(min, 3) || !numbers(max, 3) || min.some((value, axis) => value > max[axis] || Math.abs(value) > 3.4e38 || Math.abs(max[axis]) > 3.4e38) || seen.has(node) || seen.size >= 2_000_000) {
      throw Error('SOG LoD contains invalid or excessive bounds.');
    }
    seen.add(node);
    const children = node.children ?? [];
    if (!Array.isArray(children) || children.length > 100_000) throw Error('SOG LoD contains invalid children.');
    for (const child of children) stack.push(child);
    if (node.lods == null && children.length) continue;
    if (!node.lods || typeof node.lods !== 'object' || Array.isArray(node.lods)) throw Error('SOG LoD contains an empty leaf.');
    let hasRange = false;
    for (const [key, range] of Object.entries(node.lods)) {
      const level = Number(key);
      if (String(level) !== key || !integer(level) || level >= lodLevels || !integer(range?.file) || range.file >= filenames.length || !integer(range.offset) || !integer(range.count) || range.offset + range.count > 0xffffffff) {
        throw Error('SOG LoD contains an invalid splat range.');
      }
      if (!range.count) continue;
      if (fileLevel[range.file] !== -1 && fileLevel[range.file] !== level) throw Error('One SOG LoD file is assigned to several levels.');
      fileLevel[range.file] = level;
      required[range.file] = Math.max(required[range.file], range.offset + range.count);
      hasRange = true;
    }
    if (!hasRange) throw Error('SOG LoD contains an empty leaf.');
    leaves.push(node);
    if (leaves.length > 1_000_000 || leaves.length * lodLevels > 8_000_000) throw Error('SOG LoD contains an unsupported number of leaf ranges.');
  }
  return { leaves, fileLevel, required };
}

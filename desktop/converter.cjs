const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { contained } = require('./server.cjs');
const { radMeta } = require('./export.cjs');

function convertPly({ source, projectRoot, executable, method = 'quality', maxSh = 3, progress = () => {} }) {
  if (!['quality', 'quick'].includes(method) || !Number.isInteger(maxSh) || maxSh < 0 || maxSh > 3) throw Error('Invalid conversion settings.');
  if (path.extname(source).toLowerCase() !== '.ply') throw Error('Choose a Gaussian splat PLY file.');
  const id = crypto.randomUUID();
  const root = path.resolve(projectRoot);
  const staging = path.join(root, '.conversion-' + id);
  const relative = 'assets/converted/' + id;
  const destination = path.join(root, relative);
  const abort = new AbortController();
  let child;
  const cancel = () => { abort.abort(); child?.kill(); };
  const check = () => { if (abort.signal.aborted) throw Error('PLY conversion cancelled.'); };
  const promise = (async () => {
    let log;
    try {
      await fs.access(executable);
      await fs.mkdir(staging, { recursive: false });
      const input = path.join(staging, 'source.ply');
      progress('Preparing PLY for conversion…');
      try { await fs.link(source, input); }
      catch { check(); progress('Copying PLY into the project for conversion…'); await pipeline(createReadStream(source), createWriteStream(input, { flags: 'wx' }), { signal: abort.signal }); }
      check();
      log = await fs.open(path.join(staging, 'conversion.log'), 'w');
      let tail = '', writes = Promise.resolve(), lastProgress = 0;
      await new Promise((resolve, reject) => {
        child = spawn(executable, ['--' + method, '--gsplat', '--rad-chunked', '--max-sh=' + maxSh, 'source.ply'], { cwd: staging, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        const output = data => {
          const text = data.toString(); tail = (tail + text).slice(-8192);
          writes = writes.then(() => log.write(text));
          // Keep complete logs on disk, and throttle live status notifications.
          if (Date.now() - lastProgress > 150) { lastProgress = Date.now(); progress(tail.trim().split(/[\r\n]+/).pop()?.slice(0, 400) || 'Building LoD…'); }
        };
        child.stdout.on('data', output); child.stderr.on('data', output);
        child.once('error', reject);
        child.once('close', code => { child = undefined; writes.then(() => code === 0 ? resolve() : reject(Error(`Spark converter exited with code ${code}. ${tail.slice(-1200)}`)), reject); });
      });
      check(); progress('Validating generated LoD RAD and companion chunks…');
      const output = path.join(staging, 'source-lod.rad');
      const meta = await radMeta(output); // The tool may exit zero after a decode error: validate output too.
      if (!meta.count || !meta.chunks.length) throw Error('Spark generated an empty RAD.');
      for (const chunk of meta.chunks) {
        check();
        if (!chunk.filename) throw Error('Expected chunked RAD output.');
        const file = path.resolve(staging, chunk.filename);
        if (!contained(staging, file)) throw Error('Generated chunk escapes conversion directory.');
        if ((await fs.stat(file)).size !== chunk.bytes) throw Error('Generated RAD chunk is missing or incomplete: ' + chunk.filename);
      }
      await log.close(); log = undefined;
      await fs.unlink(input); // Removes the staging link/copy, never the original input.
      await fs.mkdir(path.dirname(destination), { recursive: true });
      check(); await fs.rename(staging, destination);
      progress('PLY converted to a validated, streamable LoD RAD.');
      return relative + '/source-lod.rad';
    } catch (error) {
      await log?.close().catch(() => {});
      // Preserve diagnostics separately, but remove partial outputs and the staging input.
      try { await fs.mkdir(path.join(root, 'conversion-logs'), { recursive: true }); await fs.copyFile(path.join(staging, 'conversion.log'), path.join(root, 'conversion-logs', id + '.log')); } catch {}
      if (contained(root, staging) && path.basename(staging) === '.conversion-' + id) await fs.rm(staging, { recursive: true, force: true });
      if (abort.signal.aborted) throw Error('PLY conversion cancelled. Original PLY is unchanged.');
      throw Error(`PLY conversion failed: ${error.message}. Any converter log is saved under conversion-logs in the project.`);
    }
  })();
  return { promise, cancel };
}
module.exports = { convertPly };

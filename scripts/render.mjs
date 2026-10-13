// Renders the long video (16:9), each Short (9:16) and the thumbnail from a job file,
// split across several GitHub machines and reusing scenes that have not changed.
//
// usage: node scripts/render.mjs out/job.final.json <command> [...]
//   plan <full|preview> [maxShards]  -> out/render-plan.json; prints the shard list for the matrix
//   shard <n>                        -> renders shard n's scene chunks (video only) into new-chunks/
//   assemble                         -> joins chunks, adds the audio, renders the thumbnail -> out/*.mp4, out/*.png
//   all | long | shorts | thumb | preview   (old single-machine mode, still works)
//
// Every scene is a chunk. A chunk's key is a hash of everything that changes its pixels (the scene,
// its tracker state, the code, the files it shows), so after an edit only changed scenes are redrawn.
// 3D scenes count 5x when sharing work out, because they are far slower to draw without a GPU.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const FPS = 30;
const CACHE = '.chunk-cache';
const [jobPath = 'out/job.final.json', cmd = 'all', ...args] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
fs.mkdirSync('out', {recursive: true});
fs.mkdirSync(CACHE, {recursive: true});

const sceneFrames = (s) => Math.max(15, Math.round((s.durationSec || 4) * FPS));
const HEAVY = new Set(['body', 'molecule']);
const sha = (x) => crypto.createHash('sha1').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const git = (...a) => {
  try {
    return execFileSync('git', a, {encoding: 'utf8'}).trim();
  } catch {
    return 'nogit';
  }
};
// Code + shared assets that affect every frame.
const CODE = sha([git('rev-parse', 'HEAD:src'), git('rev-parse', 'HEAD:public/anatomy'), git('rev-parse', 'HEAD:package.json')]);
const fileHash = (rel) => {
  const p = path.join('public', rel);
  return fs.existsSync(p) ? sha(fs.readFileSync(p)) : 'missing';
};
const trackerStates = () => {
  const out = {};
  const acc = [];
  for (const s of job.scenes) {
    const before = [...acc];
    acc.push(...(s.completes || []));
    out[s.id] = {current: s.objective, done: before, doneAtEnd: [...acc]};
  }
  return out;
};
const STATES = trackerStates();

// The videos this mode produces.
const videos = (mode) => {
  const scale = mode === 'preview' ? 0.5 : 1;
  const list = [{name: `${job.id}-${mode === 'preview' ? 'preview' : 'long'}`, props: {job, format: '16:9'}, scale}];
  for (const s of job.shorts || []) list.push({name: `${job.id}-${s.id}`, props: {job, format: '9:16', sceneIds: s.scenes, hook: s.hook}, scale});
  return list;
};
const chunksOf = (v) => {
  const ids = v.props.sceneIds;
  const scenes = ids && ids.length ? job.scenes.filter((s) => ids.includes(s.id)) : job.scenes;
  let at = 0;
  const out = [];
  for (const s of scenes) {
    const frames = sceneFrames(s);
    const start = at;
    at += frames;
    const vis = s.visual || {};
    const heavy = HEAVY.has(vis.type);
    const {narration, audio, sfx, ...look} = s; // sound does not change the picture
    const files = [vis.shot, vis.src].filter(Boolean).map(fileHash);
    const sceneKey = {CODE, look, frames, files, state: STATES[s.id], tracker: job.tracker, format: v.props.format, scale: v.scale, hook: v.props.hook && start < 4 * FPS ? [v.props.hook, start] : null};
    // 3D scenes are cut into ~3 s pieces so many machines can share one scene.
    const piece = heavy ? 90 : 450;
    const n = Math.max(1, Math.round(frames / piece));
    for (let i = 0; i < n; i++) {
      const a = Math.round((frames * i) / n);
      const b = Math.round((frames * (i + 1)) / n) - 1;
      out.push({key: sha({...sceneKey, a, b}), scene: n > 1 ? `${s.id}.${i + 1}` : s.id, from: start + a, to: start + b, weight: (b - a + 1) * (heavy ? 5 : 1)});
    }
  }
  return out;
};
const chunkFile = (c) => path.join(CACHE, `${c.key}.mp4`);

let serveUrl;
let browser;
const setup = async () => {
  serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
  browser = await openBrowser('chrome', {chromiumOptions: {gl: 'swangle'}});
};
const base = (composition, inputProps, scale) => ({
  composition, serveUrl, inputProps, scale,
  // 3D scenes need WebGL; GitHub runners have no GPU, so Chrome draws it in software (SwiftShader via ANGLE).
  chromiumOptions: {gl: 'swangle'},
  puppeteerInstance: browser,
  concurrency: Math.max(2, os.cpus().length),
});

if (cmd === 'plan') {
  const mode = args[0] || 'full';
  const max = Number(args[1] || 16);
  const vids = videos(mode).map((v) => ({...v, props: {...v.props, job: undefined}, chunks: chunksOf(v)}));
  const todo = new Map();
  for (const v of vids) for (const c of v.chunks) if (!fs.existsSync(chunkFile(c))) todo.set(c.key, {...c, video: v.name});
  const work = [...todo.values()].sort((a, b) => b.weight - a.weight);
  const total = work.reduce((a, c) => a + c.weight, 0);
  // about one machine per 30 s of weighted work, up to max
  const n = work.length ? Math.max(1, Math.min(max, Math.ceil(total / (30 * FPS)), work.length)) : 0;
  const shards = Array.from({length: n}, () => ({weight: 0, chunks: []}));
  for (const c of work) {
    const s = shards.reduce((m, x) => (x.weight < m.weight ? x : m), shards[0]);
    s.weight += c.weight;
    s.chunks.push(c);
  }
  const plan = {mode, videos: vids, shards};
  fs.writeFileSync('out/render-plan.json', JSON.stringify(plan, null, 1));
  const all = vids.reduce((a, v) => a + v.chunks.length, 0);
  console.error(`chunks: ${all}, reused: ${all - work.length}, to render: ${work.length} on ${n} machine(s)`);
  console.log(JSON.stringify(shards.map((_, i) => i)));
} else if (cmd === 'shard') {
  const plan = JSON.parse(fs.readFileSync('out/render-plan.json', 'utf8'));
  const mine = plan.shards[Number(args[0])]?.chunks || [];
  fs.mkdirSync('new-chunks', {recursive: true});
  await setup();
  for (const [i, c] of mine.entries()) {
    const v = plan.videos.find((x) => x.name === c.video);
    const inputProps = {...v.props, job};
    const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps, puppeteerInstance: browser});
    const t0 = Date.now();
    await renderMedia({...base(composition, inputProps, v.scale), codec: 'h264', crf: 20, muted: true, frameRange: [c.from, c.to], outputLocation: path.join('new-chunks', `${c.key}.mp4`)});
    console.log(`[${i + 1}/${mine.length}] ${c.video} ${c.scene} (${c.to - c.from + 1} frames) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close({silent: true});
} else if (cmd === 'assemble') {
  const plan = JSON.parse(fs.readFileSync('out/render-plan.json', 'utf8'));
  await setup();
  const keep = new Set();
  for (const v of plan.videos) {
    const inputProps = {...v.props, job};
    const missing = v.chunks.filter((c) => !fs.existsSync(chunkFile(c)));
    if (missing.length) throw new Error(`${v.name}: ${missing.length} scene chunk(s) missing: ${missing.map((c) => c.scene).join(', ')}`);
    v.chunks.forEach((c) => keep.add(path.basename(chunkFile(c))));
    const list = path.join('out', `${v.name}.chunks.txt`);
    fs.writeFileSync(list, v.chunks.map((c) => `file '${path.resolve(chunkFile(c))}'`).join('\n'));
    const silent = path.join('out', `${v.name}.video.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
    // Sound for the whole video in one pass (voice + SFX), so there are no clicks at scene joins.
    const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps, puppeteerInstance: browser});
    const sound = path.join('out', `${v.name}.aac`);
    await renderMedia({...base(composition, inputProps, 1), codec: 'aac', outputLocation: sound});
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', sound, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', path.join('out', `${v.name}.mp4`)]);
    fs.rmSync(silent);
    fs.rmSync(sound);
    fs.rmSync(list);
    console.log(`Assembled out/${v.name}.mp4 from ${v.chunks.length} scenes`);
  }
  const composition = await selectComposition({serveUrl, id: 'Thumbnail', inputProps: {job}, puppeteerInstance: browser});
  await renderStill({composition, serveUrl, output: `out/${job.id}-thumbnail.png`, inputProps: {job}, chromiumOptions: {gl: 'swangle'}, puppeteerInstance: browser});
  console.log('Rendered thumbnail');
  // Keep only this version's chunks in the cache.
  for (const f of fs.readdirSync(CACHE)) if (!keep.has(f)) fs.rmSync(path.join(CACHE, f));
  await browser.close({silent: true});
} else {
  // Single-machine mode.
  await setup();
  const what = cmd;
  const video = async (name, inputProps, scale = 1) => {
    const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps, puppeteerInstance: browser});
    await renderMedia({...base(composition, inputProps, scale), codec: 'h264', crf: 20, audioCodec: 'aac', outputLocation: `out/${name}.mp4`});
    console.log(`Rendered out/${name}.mp4 (${(composition.durationInFrames / FPS).toFixed(1)} s)`);
  };
  if (what === 'all' || what === 'long') await video(`${job.id}-long`, {job, format: '16:9'});
  if (what === 'preview') await video(`${job.id}-preview`, {job, format: '16:9'}, 0.5);
  if (what === 'all' || what === 'shorts' || what === 'preview')
    for (const s of job.shorts || []) await video(`${job.id}-${s.id}`, {job, format: '9:16', sceneIds: s.scenes, hook: s.hook}, what === 'preview' ? 0.5 : 1);
  if (what === 'all' || what === 'thumb' || what === 'preview') {
    const composition = await selectComposition({serveUrl, id: 'Thumbnail', inputProps: {job}, puppeteerInstance: browser});
    await renderStill({composition, serveUrl, output: `out/${job.id}-thumbnail.png`, inputProps: {job}, chromiumOptions: {gl: 'swangle'}, puppeteerInstance: browser});
    console.log('Rendered thumbnail');
  }
  await browser.close({silent: true});
}

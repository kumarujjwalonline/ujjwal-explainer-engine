// Renders the long video (16:9), each Short (9:16) and the thumbnail from a job file.
// usage: node scripts/render.mjs out/job.final.json [what]
//   what = all (default) | long | shorts | thumb | preview
//   preview renders the long video at half resolution for a fast layout check.
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const [jobPath = 'out/job.final.json', what = 'all'] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
fs.mkdirSync('out', {recursive: true});

const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});

const video = async (name, inputProps, scale = 1) => {
  const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps});
  const outputLocation = `out/${name}.mp4`;
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    scale,
    inputProps,
    outputLocation,
    audioCodec: 'aac',
    // 3D scenes (body walkthrough, molecules) need WebGL; GitHub runners have no GPU,
    // so Chrome renders it in software (SwiftShader via ANGLE).
    chromiumOptions: {gl: 'swangle'},
    onProgress: ({progress}) => {
      const p = Math.floor(progress * 10);
      if (p !== last) {
        last = p;
        console.log(`${name}: ${p * 10}%`);
      }
    },
  });
  console.log(`Rendered ${outputLocation} (${(composition.durationInFrames / composition.fps).toFixed(1)} s)`);
};

if (what === 'all' || what === 'long') await video(`${job.id}-long`, {job, format: '16:9'});
if (what === 'preview') await video(`${job.id}-preview`, {job, format: '16:9'}, 0.5);
if (what === 'all' || what === 'shorts' || what === 'preview')
  for (const s of job.shorts || []) await video(`${job.id}-${s.id}`, {job, format: '9:16', sceneIds: s.scenes, hook: s.hook}, what === 'preview' ? 0.5 : 1);
if (what === 'all' || what === 'thumb' || what === 'preview') {
  const composition = await selectComposition({serveUrl, id: 'Thumbnail', inputProps: {job}});
  await renderStill({composition, serveUrl, output: `out/${job.id}-thumbnail.png`, inputProps: {job}, chromiumOptions: {gl: 'swangle'}});
  console.log('Rendered thumbnail');
}

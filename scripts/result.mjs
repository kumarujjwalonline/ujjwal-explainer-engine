// Writes out/result.json: the links n8n needs after a render.
import fs from 'node:fs';
const base = process.argv[2];
const files = fs.readdirSync('.').filter((f) => /\.(mp4|mp3|png|json)$/.test(f) && f !== 'result.json');
const url = (f) => `${base}/${f}`;
const out = {
  job_id: process.env.JOB_ID,
  mode: process.env.MODE,
  status: 'done',
  run: process.env.RUN_URL,
  long: files.filter((f) => /-long\.mp4$/.test(f)).map(url)[0] || null,
  preview: files.filter((f) => /-preview\.mp4$/.test(f)).map(url)[0] || null,
  shorts: files.filter((f) => /\.mp4$/.test(f) && !/-(long|preview)\.mp4$/.test(f)).map(url),
  thumbnail: files.filter((f) => /\.png$/.test(f)).map(url)[0] || null,
  voice_sample: files.filter((f) => /voice-sample\.mp3$/.test(f)).map(url)[0] || null,
  job: url('job.final.json'),
};
fs.writeFileSync('result.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

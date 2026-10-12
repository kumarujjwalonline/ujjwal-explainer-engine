// Generates narration per scene with the Kumar Ujjwal Hindi voice in ElevenLabs,
// measures each clip, and writes the real durations back into the job.
//
// usage: node scripts/voice.mjs jobs/<id>.json <mode>
//   mode = full    -> every scene
//   mode = sample  -> only the opening scenes up to ~30 s, joined into sample.mp3
//   mode = none    -> no voice; keep the durations written in the job (layout preview)
//
// env: ELEVENLABS_API_KEY (repo secret), ELEVEN_VOICE_ID, ELEVEN_MODEL
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const [jobPath, mode = 'full'] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const VOICE = process.env.ELEVEN_VOICE_ID || 'mOvzppGwwdT8srvDVcZ9'; // Kumar Ujjwal Hindi
const MODEL = process.env.ELEVEN_MODEL || 'eleven_v3';
const KEY = process.env.ELEVENLABS_API_KEY;
const outDir = path.join('public', 'jobs', job.id);
fs.mkdirSync(outDir, {recursive: true});
fs.mkdirSync('out', {recursive: true});

// Production rules: start at 75% similarity, then tune stability/style/speed.
const settings = {
  stability: Number(process.env.ELEVEN_STABILITY ?? 0.5),
  similarity_boost: Number(process.env.ELEVEN_SIMILARITY ?? 0.75),
  style: Number(process.env.ELEVEN_STYLE ?? 0.3),
  speed: Number(process.env.ELEVEN_SPEED ?? 1.0),
  use_speaker_boost: true,
};

const probe = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim());

const tts = async (text, file) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
      body: JSON.stringify({text, model_id: MODEL, voice_settings: settings}),
    });
    if (res.ok) {
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    }
    const msg = await res.text();
    // A model that isn't available on this account falls back to v3, then multilingual v2.
    if (res.status === 400 && /model/i.test(msg) && attempt === 1) {
      console.warn(`Model ${MODEL} refused, retrying with fallback`);
      return ttsWith('eleven_multilingual_v2', text, file);
    }
    if (attempt === 3) throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
};
const ttsWith = async (model, text, file) => {
  // multilingual v2 doesn't understand [tags]; strip them so they are never spoken aloud.
  const clean = model === 'eleven_multilingual_v2' ? text.replace(/\[[^\]]+\]\s*/g, '') : text;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify({text: clean, model_id: model, voice_settings: settings}),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
};

const run = async () => {
  if (mode === 'none' || !KEY) {
    if (mode !== 'none') console.warn('No ELEVENLABS_API_KEY set: rendering without voice.');
    fs.writeFileSync('out/job.final.json', JSON.stringify(job, null, 2));
    return;
  }
  let scenes = job.scenes;
  if (mode === 'sample') {
    let t = 0;
    scenes = [];
    for (const s of job.scenes) {
      scenes.push(s);
      t += s.durationSec || 5;
      if (t >= 30) break;
    }
  }
  const files = [];
  for (const s of scenes) {
    const file = path.join(outDir, `${s.id}.mp3`);
    await tts(s.narration, file);
    const d = probe(file);
    s.durationSec = Math.round((d + 0.45) * 100) / 100; // a breath after each line
    s.audio = `jobs/${job.id}/${s.id}.mp3`;
    files.push(file);
    console.log(`${s.id}: ${d.toFixed(2)}s`);
  }
  if (mode === 'sample') {
    const list = path.join(outDir, 'list.txt');
    fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f)}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '128k', 'out/voice-sample.mp3']);
    console.log('Voice sample: out/voice-sample.mp3');
  }
  fs.writeFileSync('out/job.final.json', JSON.stringify(job, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

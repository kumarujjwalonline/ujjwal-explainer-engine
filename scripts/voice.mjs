// Narration in the Kumar Ujjwal Hindi voice (ElevenLabs), one clip per scene.
//
// usage: node scripts/voice.mjs <job.json> <command>
//   full | sample  generate (or reuse) clips for every scene / for the sample scenes,
//                  write out/job.final.json and out/selected.json
//   none           no voice; keep the durations written in the job (layout preview)
//   retake         RETAKE="S03,S12" TAKE=2 -> fresh takes public/jobs/<id>/<scene>.take<N>.mp3
//   cache          store each selected scene's current clip as its cached raw take
//   finish         re-measure clips, update durations in out/job.final.json, join the sample
//
// The audio check (scripts/audio_qc.py) runs between these steps: it transcribes each clip,
// asks for retakes of lines that were said wrong, keeps the best take and sets the voice depth.
//
// env: ELEVENLABS_API_KEY (repo secret), ELEVEN_VOICE_ID, ELEVEN_MODEL
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [jobPath, command = 'full'] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const VOICE = process.env.ELEVEN_VOICE_ID || 'mOvzppGwwdT8srvDVcZ9'; // Kumar Ujjwal Hindi
const MODEL = process.env.ELEVEN_MODEL || 'eleven_v3';
const KEY = process.env.ELEVENLABS_API_KEY;
const outDir = path.join('public', 'jobs', job.id);
fs.mkdirSync(outDir, {recursive: true});
fs.mkdirSync('out', {recursive: true});

// Production rules: start at 75% similarity, then tune stability/style/speed.
// job.voice (set from WhatsApp change requests) overrides the defaults.
const jv = job.voice || {};
const clamp = (v, lo, hi, d) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
let stability = clamp(jv.stability ?? process.env.ELEVEN_STABILITY, 0, 1, 0.5);
// eleven_v3 only accepts 0 (creative), 0.5 (natural) or 1 (robust).
if (MODEL === 'eleven_v3') stability = [0, 0.5, 1].reduce((a, b) => (Math.abs(b - stability) < Math.abs(a - stability) ? b : a));
const settings = {
  stability,
  similarity_boost: clamp(jv.similarity_boost ?? process.env.ELEVEN_SIMILARITY, 0, 1, 0.75),
  style: clamp(jv.style ?? process.env.ELEVEN_STYLE, 0, 1, 0.3),
  speed: clamp(jv.speed ?? process.env.ELEVEN_SPEED, 0.7, 1.2, 1.0),
  use_speaker_boost: true,
};

// Pronunciation fixes: [{word, say_as}] replace the word only in the text sent to ElevenLabs.
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fixes = (jv.pronunciations || []).filter((x) => x && x.word && x.say_as);
const spoken = (text) =>
  fixes.reduce((t, x) => t.replace(new RegExp(`(^|[^\\p{L}\\p{M}])${esc(x.word)}(?=$|[^\\p{L}\\p{M}])`, 'giu'), `$1${x.say_as}`), text);

// Unchanged lines reuse audio from earlier runs of this job (restored by the workflow cache),
// so a change request only spends ElevenLabs credits on the lines that changed.
const cacheDir = path.join('.voice-cache', job.id);
fs.mkdirSync(cacheDir, {recursive: true});
const keyFor = (text) => crypto.createHash('sha1').update(JSON.stringify([VOICE, MODEL, settings, text])).digest('hex').slice(0, 16);

const probe = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim());

const post = async (model, text) => {
  // multilingual v2 doesn't understand [tags]; strip them so they are never spoken aloud.
  const clean = model === 'eleven_multilingual_v2' ? text.replace(/\[[^\]]+\]\s*/g, '') : text;
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify({text: clean, model_id: model, voice_settings: settings}),
  });
};
const tts = async (text, file) => {
  let model = MODEL;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await post(model, text);
    if (res.ok) {
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    }
    const msg = await res.text();
    if (res.status === 400 && /model/i.test(msg) && model !== 'eleven_multilingual_v2') {
      console.warn(`Model ${model} refused, falling back to multilingual v2`);
      model = 'eleven_multilingual_v2';
      continue;
    }
    if (attempt === 3) throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
};

const selectedPath = 'out/selected.json';
const readSelected = () => JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
const scenesById = new Map(job.scenes.map((s) => [s.id, s]));

const pickScenes = (mode) => {
  if (mode !== 'sample') return job.scenes;
  // After a change request the sample plays the changed lines; otherwise the first ~30 s.
  const pick = new Set(job.sample_scenes || []);
  const chosen = job.scenes.filter((s) => pick.has(s.id));
  if (chosen.length) return chosen.slice(0, 8);
  const out = [];
  let t = 0;
  for (const s of job.scenes) {
    out.push(s);
    t += s.durationSec || 5;
    if (t >= 30) break;
  }
  return out;
};

const measure = (s) => {
  const d = probe(path.join('public', s.audio));
  s.durationSec = Math.round((d + 0.45) * 100) / 100; // a breath after each line
  return d;
};

const run = async () => {
  if (command === 'none' || (!KEY && (command === 'full' || command === 'sample'))) {
    if (command !== 'none') console.warn('No ELEVENLABS_API_KEY set: rendering without voice.');
    fs.writeFileSync(selectedPath, JSON.stringify({mode: 'none', ids: []}));
    fs.writeFileSync('out/job.final.json', JSON.stringify(job, null, 2));
    return;
  }

  if (command === 'full' || command === 'sample') {
    console.log('Voice settings', settings);
    const scenes = pickScenes(command);
    let reused = 0;
    let generated = 0;
    for (const s of scenes) {
      const file = path.join(outDir, `${s.id}.mp3`);
      const cached = path.join(cacheDir, `${keyFor(spoken(s.narration))}.mp3`);
      if (fs.existsSync(cached)) {
        fs.copyFileSync(cached, file);
        reused++;
      } else {
        await tts(spoken(s.narration), file);
        generated++;
      }
      s.audio = `jobs/${job.id}/${s.id}.mp3`;
      s.spokenText = spoken(s.narration);
      console.log(`${s.id}: ${measure(s).toFixed(2)}s`);
    }
    console.log(`Audio: ${generated} lines generated, ${reused} reused from earlier runs`);
    fs.writeFileSync(selectedPath, JSON.stringify({mode: command, ids: scenes.map((s) => s.id)}));
    fs.writeFileSync('out/job.final.json', JSON.stringify(job, null, 2));
    return;
  }

  if (command === 'retake') {
    const ids = (process.env.RETAKE || '').split(',').map((x) => x.trim()).filter(Boolean);
    const take = process.env.TAKE || '2';
    for (const id of ids) {
      const s = scenesById.get(id);
      if (!s) continue;
      await tts(spoken(s.narration), path.join(outDir, `${id}.take${take}.mp3`));
      console.log(`Retake ${take} of ${id}`);
    }
    return;
  }

  if (command === 'cache') {
    // Called after the audio check picked the best take, before the voice is deepened,
    // so the cache always holds raw ElevenLabs audio.
    for (const id of readSelected().ids) {
      const s = scenesById.get(id);
      fs.copyFileSync(path.join(outDir, `${id}.mp3`), path.join(cacheDir, `${keyFor(spoken(s.narration))}.mp3`));
    }
    return;
  }

  if (command === 'finish') {
    const sel = readSelected();
    const files = [];
    for (const id of sel.ids) {
      const s = scenesById.get(id);
      measure(s);
      files.push(path.join('public', s.audio));
    }
    if (sel.mode === 'sample' && files.length) {
      const list = path.join(outDir, 'list.txt');
      fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f)}'`).join('\n'));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '128k', 'out/voice-sample.mp3']);
      console.log('Voice sample: out/voice-sample.mp3');
    }
    fs.writeFileSync('out/job.final.json', JSON.stringify(job, null, 2));
    return;
  }

  throw new Error(`Unknown command ${command}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

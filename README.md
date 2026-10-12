# Ujjwal Explainer Engine

Turns a **job file** (a scene list written by the AI in n8n) into a finished explainer:
the 16:9 long video, 9:16 Shorts and a thumbnail, voiced with the **Kumar Ujjwal Hindi**
ElevenLabs clone. Everything renders free on GitHub Actions.

It follows `production-rules.md`: faceless, deep navy, white text, orange/yellow emphasis,
English-only on-screen text, no background music, purposeful SFX, and the mandatory
right-side learning-progress tracker.

## How a render runs

1. n8n commits `jobs/<id>.json`.
2. n8n starts the **Render explainer** workflow (`workflow_dispatch`) with `job_id`, `mode` and an optional `callback_url`.
3. Actions generates the voice per scene, measures each clip, renders, and publishes the files as a GitHub Release.
4. Actions POSTs the links to `callback_url`.

| mode | What it does |
|---|---|
| `sample` | Voices the opening ~30 s and joins it into `voice-sample.mp3` (approval #2) |
| `full` | Voice + long video + every Short + thumbnail (approval #3) |
| `preview` | No voice, half-size video: a quick layout check |

**Repo secret needed:** `ELEVENLABS_API_KEY` (Settings → Secrets and variables → Actions).
Optional repo variable `ELEVEN_MODEL` (default `eleven_v3`; set to the v4 model id when available).

## Job file

```jsonc
{
  "id": "chandrayaan-4",
  "title": "…",
  "tracker": {"objectives": [{"id": "o1", "label": "What it is", "children": [{"id": "o1a", "label": "…"}]}]},
  "scenes": [
    {
      "id": "S01",
      "narration": "[curious] Hinglish line with an expression tag…",
      "durationSec": 5,            // estimate; replaced by the real audio length
      "objective": "o1a",          // tracker item being taught now (orange)
      "completes": ["o1a"],        // ticked green when the scene ends
      "onScreen": "SHORT ENGLISH",  // optional caption
      "sfx": "whoosh",             // whoosh | ping | tick | hit | pop
      "compact": false,            // compact tracker for heavy numerical scenes
      "visual": {"type": "…"}
    }
  ],
  "shorts": [{"id": "short-1", "hook": "English hook line", "scenes": ["S04", "S05"]}],
  "thumbnail": {"headline": "…", "sub": "…"}
}
```

### Visual types

| type | Fields | Use for |
|---|---|---|
| `title` | `title, subtitle?, kicker?` | Opening or chapter cards |
| `question` | `text, highlight?[]` | Hooks and re-hooks |
| `points` | `heading?, items[], highlight?[]` | Key ideas revealed one by one |
| `stat` | `value, from?, prefix?, suffix?, decimals?, label, source?` | Numbers, always with a source |
| `timeline` | `heading?, nodes[{date,label,tone?}]` | Dated sequences |
| `flow` | `heading?, steps[{label,sub?,icon?}]` | Processes and pipelines |
| `hub` | `center{label,icon?}, spokes[{label,icon?}]` | One thing connecting to many |
| `compare` | `left{heading,items,tone?}, right{…}` | Before/after, A vs B |
| `formula` | `heading?, lines[{text,note?,final?}]` | Numericals step by step (rule 10) |
| `news` | `headline, outlet, date` | Reported events, own card design |
| `image` | `src, credit?, caption?` | Licensed photo or generated art (public/ path or https URL) |
| `map` | `map{projection?, from?, focus, highlights?, dim?, routes?, markers?, labels?}` | Geography; borders from Natural Earth (India view) |

Icons: ship, truck, train, plane, person, people, robot, code, chat, post, invoice, whatsapp,
gear, link, brain, check, cross, money, chart, globe, lock, bolt, doc, phone, factory, home.

Tones: `neutral`, `accent` (orange), `warn` (yellow), `good` (green), `bad` (red), `muted`.

## Data and licences

- Borders: Natural Earth 1:10m admin-0 countries, India point-of-view edition (public domain), simplified.
- Icons: in-house SVG. SFX: synthesised with ffmpeg at render time. Fonts: Inter and Poppins (SIL OFL).

"""Audio check for the narration, run on GitHub between the voice steps (free, no API).

usage:
  python scripts/audio_qc.py check   transcribe every selected clip (and any retakes), keep the best
                                     take per line, write out/audio-qc.json, out/retake.txt, out/force.json
  python scripts/audio_qc.py voice   measure pitch and bass across the narration and deepen the
                                     voice slightly when it sounds light; updates out/audio-qc.json

How a line is judged (production rules 22 and the audio rules):
  - Whisper (large-v3-turbo, CPU) writes down what was actually said. In Hindi mode it spells
    English words the way they sound, in Devanagari.
  - Line score: script vs transcript reduced to a consonant skeleton, so spelling differences
    between Hindi and English letters don't count.
  - English words: each one is looked up in the Indian-accent pronunciation dictionary
    (pronunciations/indian-english.json plus the job's own guide). The heard word must have the
    dictionary's vowels: "fat" = फैट (ai); a heard फट (a) or a clipped "ft" is a mispronunciation.
    Words spoken too fast to carry their vowel are flagged as clipped.
  - Hindi number words that are not in the script mean a number was spoken in Hindi.
  - A flagged line is re-recorded (up to MAX_TAKES takes). Before the last take, words that are
    still wrong are forced: the voice gets the dictionary spelling for them (out/force.json).
"""
import json
import os
import re
import shutil
import subprocess
import sys
from difflib import SequenceMatcher

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from devanagari import is_devanagari, roman, vowels  # noqa: E402

RETAKE_BELOW = float(os.environ.get("QC_RETAKE_BELOW", "70"))
MAX_TAKES = int(os.environ.get("QC_MAX_TAKES", "3"))
MAX_RETAKES_PER_ROUND = int(os.environ.get("QC_MAX_RETAKES", "12"))
TARGET_F0 = float(os.environ.get("QC_TARGET_F0", "118"))  # medium-heavy male narration
MAX_SHIFT = 0.94  # never lower pitch by more than 6 %, so it still sounds like Ujjwal
QC_PATH = "out/audio-qc.json"

HINDI_NUMBERS = {
    "तीन", "चार", "पांच", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "बीस", "तीस", "चालीस",
    "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे", "सौ", "हज़ार", "हजार", "लाख", "करोड़", "दशमलव", "प्रतिशत", "डेढ़", "ढाई",
}
# Speech recognition writes spoken numbers as digits, so number words can't be matched word by word.
NUMBER_WORDS = set("""zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand
million billion lakh crore point percent half quarter first second third""".split())
# Vowel classes that speech recognition mixes up; treated as the same sound.
SAME = {"aw": "o", "o": "o", "au": "o", "i": "i", "u": "u", "e": "e", "ai": "ai", "a": "a", "aa": "aa", "ri": "ri"}


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- text ----------
def words(text):
    text = re.sub(r"\[[^\]]+\]", " ", text)
    return [w for w in re.split(r"[^\wऀ-ॿ']+", text) if w]


def skeleton(word):
    w = roman(word) if is_devanagari(word) else word.lower()
    w = re.sub(r"[^a-z]", "", w)
    for a, b in (("ph", "f"), ("w", "v"), ("z", "j"), ("q", "k"), ("x", "ks"), ("ck", "k"), ("c", "k"), ("sh", "s"), ("th", "t"), ("dh", "d"), ("bh", "b"), ("gh", "g"), ("kh", "k"), ("jh", "j"), ("y", "i")):
        w = w.replace(a, b)
    w = re.sub(r"h", "", w)
    w = re.sub(r"[aeiou]", "", w)
    return re.sub(r"(.)\1+", r"\1", w)


def similarity(expected, heard):
    a = " ".join(filter(None, (skeleton(w) for w in words(expected))))
    b = " ".join(filter(None, (skeleton(w) for w in words(heard))))
    if not a:
        return 100.0
    return round(SequenceMatcher(None, a, b).ratio() * 100, 1)


def vclass(seq):
    return [SAME.get(v, v) for v in seq]


def load_guide():
    d = load("pronunciations/indian-english.json", {}) or {}
    g = {k.lower(): v for k, v in (d.get("guide") or {}).items()}
    g.update({k.lower(): v for k, v in (d.get("always") or {}).items()})
    g.update({k.lower(): v for k, v in (load("out/guide.json", {}) or {}).items()})
    return g


def english_word_check(expected, wl, guide):
    """Each English word with a dictionary entry must be heard with the dictionary's vowels."""
    exp_words = words(expected)
    heard = [w for w in wl if w["w"]]
    problems = []
    n_exp, n_heard = max(1, len(exp_words)), max(1, len(heard))
    for idx, w in enumerate(exp_words):
        if is_devanagari(w) or not re.search(r"[A-Za-z]", w) or w.lower() in NUMBER_WORDS:
            continue
        say = guide.get(w.lower())
        if not say:
            continue
        target_sk = skeleton(say)
        if len(target_sk) < 1:
            continue
        # Look for the heard word near the same position in the line.
        centre = idx / n_exp * n_heard
        best, best_r = None, 0.0
        for j, h in enumerate(heard):
            if abs(j - centre) > max(2, 0.25 * n_heard):
                continue
            tok = re.sub(r"[^\wऀ-ॿ]", "", h["w"])
            if not tok:
                continue
            r = SequenceMatcher(None, target_sk, skeleton(tok)).ratio()
            if r > best_r:
                best, best_r = dict(h, tok=tok), r
        if best is None or best_r < 0.75 or re.search(r"\d", best["tok"]):
            continue  # not found reliably; the line score covers missing words
        tok = best["tok"]
        dur = best["e"] - best["s"]
        if len(w) >= 3 and dur < 0.12:
            problems.append({"word": w, "expected": say, "heard": tok, "why": f"clipped ({dur:.2f}s)"})
            continue
        ev = vclass(vowels(say))
        if is_devanagari(tok):
            hv = vclass(vowels(tok))
            if ev and (len(hv) < len(ev) or SequenceMatcher(None, ev, hv).ratio() < 0.67):
                problems.append({"word": w, "expected": say, "heard": tok, "why": "vowel sounds different" if hv else "vowel missing"})
        elif ev and not re.search(r"[aeiouy]", tok.lower()):
            problems.append({"word": w, "expected": say, "heard": tok, "why": "vowel missing"})
    return problems


def hindi_numbers(expected, heard):
    exp = set(words(expected))
    return sorted({w for w in words(heard) if w in HINDI_NUMBERS and w not in exp})


# ---------- speech recognition ----------
_model = None


def pcm(path, rate=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def transcribe(path):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(os.environ.get("QC_WHISPER", "large-v3-turbo"), device="cpu", compute_type="int8")
    audio = pcm(path).copy()  # decoded with ffmpeg; avoids PyAV version issues
    segments, _ = _model.transcribe(audio, language="hi", beam_size=5, word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
    text, wl = [], []
    for seg in segments:
        text.append(seg.text.strip())
        for w in seg.words or []:
            wl.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 2)})
    return " ".join(text).strip(), wl


def judge(scene, path, guide):
    heard, wl = transcribe(path)
    expected = scene["narration"]
    return {
        "file": path,
        "heard": heard,
        "words": wl,
        "score": similarity(expected, heard),
        "mispronounced": english_word_check(expected, wl, guide),
        "hindi_numbers": hindi_numbers(expected, heard),
        "unsure": [w["w"] for w in wl if w.get("p", 1) < 0.35][:6],
    }


def bad(r):
    return r["score"] < RETAKE_BELOW or bool(r["hindi_numbers"]) or bool(r["mispronounced"])


def rank(r):
    return (0 if r["hindi_numbers"] else 1, -len(r["mispronounced"]), r["score"])


def check():
    job = load("out/job.final.json")
    sel = load("out/selected.json", {"ids": []})
    qc = load(QC_PATH, {"lines": {}})
    guide = load_guide()
    force = load("out/force.json", {}) or {}
    scenes = {s["id"]: s for s in job["scenes"]}
    out_dir = os.path.join("public", "jobs", job["id"])
    retake = []
    for sid in sel["ids"]:
        s = scenes[sid]
        main = os.path.join(out_dir, f"{sid}.mp3")
        line = qc["lines"].get(sid)
        if line is None:
            r = judge(s, main, guide)
            line = {"id": sid, "expected": s["narration"], "takes": 1, **r, "retaken": False}
            print(f"{sid}: {r['score']}  {'MISPRONOUNCED ' + str([m['word'] for m in r['mispronounced']]) if r['mispronounced'] else ''} {r['heard'][:60]}")
        for n in range(2, MAX_TAKES + 1):
            take = os.path.join(out_dir, f"{sid}.take{n}.mp3")
            if not os.path.exists(take) or n <= line["takes"]:
                continue
            r = judge(s, take, guide)
            line["takes"] = n
            line["retaken"] = True
            print(f"{sid} take {n}: {r['score']} mispronounced={[m['word'] for m in r['mispronounced']]} (was {line['score']})")
            if rank(r) > rank(line):
                shutil.copyfile(take, main)
                line.update(r)
                line["file"] = main
        line["flagged"] = bad(line)
        qc["lines"][sid] = line
        if line["flagged"] and line["takes"] < MAX_TAKES:
            retake.append(sid)
            # Before the last take, give the voice the dictionary spelling of words still said wrongly.
            if line["takes"] == MAX_TAKES - 1 and line["mispronounced"]:
                force[sid] = sorted({m["word"] for m in line["mispronounced"]})
    retake = retake[:MAX_RETAKES_PER_ROUND]
    lines = [qc["lines"][i] for i in sel["ids"]]
    qc["summary"] = {
        "lines": len(lines),
        "average_score": round(sum(l["score"] for l in lines) / max(1, len(lines)), 1),
        "retaken": [l["id"] for l in lines if l["retaken"]],
        "forced": [{"id": k, "words": v} for k, v in force.items()],
        "still_flagged": [{"id": l["id"], "score": l["score"], "mispronounced": l["mispronounced"], "hindi_numbers": l["hindi_numbers"], "heard": l["heard"]} for l in lines if l["flagged"]],
        "english_words_checked": sum(1 for l in lines for w in words(l["expected"]) if re.search(r"[A-Za-z]", w) and w.lower() in guide),
        "lines_heard": [{"id": l["id"], "said": l["expected"], "heard": l["heard"], "score": l["score"], "unsure": l.get("unsure", [])} for l in lines],
    }
    save(QC_PATH, qc)
    save("out/force.json", force)
    with open("out/retake.txt", "w") as f:
        f.write(",".join(retake))
    print(f"Retake next: {retake or 'none'}  forced: {force or 'none'}")


# ---------- voice depth ----------
def analyse(files):
    import parselmouth

    f0s, low, total = [], 0.0, 0.0
    for p in files:
        x = pcm(p)
        if len(x) < 1600:
            continue
        snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=16000)
        pitch = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=300).selected_array["frequency"]
        f0s.extend(v for v in pitch if v > 0)
        spec = np.abs(np.fft.rfft(x)) ** 2
        freqs = np.fft.rfftfreq(len(x), 1 / 16000)
        low += spec[(freqs >= 60) & (freqs < 250)].sum()
        total += spec[(freqs >= 60) & (freqs < 4000)].sum()
    return (float(np.median(f0s)) if f0s else 0.0), (float(low / total) if total else 0.0)


def voice():
    """Give the cloned voice more body (Ujjwal: "previous voice was thinner but style was good").

    The ElevenLabs settings that shape the style are left alone. After recording:
      - pitch: lowered slightly when the median is above TARGET_F0 (at most 6 %, tempo kept)
      - warmth: +3 dB low shelf around 120 Hz and +1.5 dB body around 250 Hz, more if the
        measured low end is thin
      - density: gentle 2:1 compression and a limiter, so the voice sounds fuller and steadier
    Applied the same way to every line, so all clips match.
    """
    job = load("out/job.final.json")
    sel = load("out/selected.json", {"ids": []})
    qc = load(QC_PATH, {"lines": {}})
    files = [os.path.join("public", "jobs", job["id"], f"{i}.mp3") for i in sel["ids"]]
    if not files:
        return
    f0, bass = analyse(files)
    factor = 1.0
    if f0 > TARGET_F0:
        factor = max(MAX_SHIFT, TARGET_F0 / f0)
    bass_min = float(os.environ.get("QC_BASS_MIN", "0.18"))
    low_gain = 4.5 if bass < bass_min else 3.0
    body = float(os.environ.get("QC_BODY", "1"))  # 0 turns the treatment off
    # Trim the silence ElevenLabs leaves before and after each line, so the pause between
    # lines is exactly the one the render adds (production rules: 0.75 s).
    trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse"
    filters = [trim]
    if factor < 0.999:
        filters += [f"asetrate=44100*{factor:.4f}", "aresample=44100", f"atempo={1 / factor:.4f}"]
    if body > 0:
        filters += [
            f"bass=g={low_gain * body:.1f}:f=120:w=0.7",
            f"equalizer=f=250:t=q:w=1.2:g={1.5 * body:.1f}",
            f"equalizer=f=4200:t=q:w=1.5:g={-1.0 * body:.1f}",
            "acompressor=threshold=0.125:ratio=2:attack=15:release=180:makeup=1.6",
            "alimiter=limit=0.95",
        ]
    if filters:
        for p in files:
            tmp = p + ".tmp.mp3"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", p, "-af", ",".join(filters), "-c:a", "libmp3lame", "-b:a", "160k", "-ar", "44100", tmp], check=True)
            os.replace(tmp, p)
    after_f0, after_bass = analyse(files) if filters else (f0, bass)
    qc["voice"] = {
        "median_pitch_hz": round(f0, 1),
        "bass_share": round(bass, 3),
        "pitch_factor": round(factor, 3),
        "low_boost_db": round(low_gain * body, 1),
        "after_pitch_hz": round(after_f0, 1),
        "after_bass_share": round(after_bass, 3),
        "target_pitch_hz": TARGET_F0,
        "verdict": ("pitch lowered " + str(round((1 - factor) * 100, 1)) + "% and " if factor < 0.999 else "pitch kept, ") + ("fuller body added (warmth + compression)" if body > 0 else "no body treatment"),
    }
    save(QC_PATH, qc)
    print(json.dumps(qc["voice"], indent=2))


if __name__ == "__main__":
    {"check": check, "voice": voice}[sys.argv[1]]()

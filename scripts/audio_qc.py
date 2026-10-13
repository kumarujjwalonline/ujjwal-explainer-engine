"""Audio check for the narration, run on GitHub between the voice steps (free, no API).

usage:
  python scripts/audio_qc.py check   transcribe every selected clip (and any retakes), keep the best
                                     take per line, write out/audio-qc.json and out/retake.txt
  python scripts/audio_qc.py voice   measure pitch and bass across the narration and deepen the
                                     voice slightly when it sounds light; updates out/audio-qc.json

How a line is judged:
  - Whisper (large-v3-turbo, on the runner's CPU) writes down what was actually said.
  - Script and transcript are reduced to a sound skeleton (Devanagari transliterated, vowels
    dropped, similar letters merged) so Hindi/English spelling differences don't count as errors.
  - Similarity below RETAKE_BELOW, or Hindi number words that are not in the script
    (numbers must be spoken in English), asks for a fresh take. At most MAX_TAKES per line.
  - Words of the script with no close match in the transcript are listed as "suspects", so
    Claude can review them and suggest pronunciation fixes.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from difflib import SequenceMatcher

import numpy as np

RETAKE_BELOW = float(os.environ.get("QC_RETAKE_BELOW", "72"))
MAX_TAKES = int(os.environ.get("QC_MAX_TAKES", "3"))
# A "medium to heavy" male narration voice. Deepen only when the median pitch is above this.
TARGET_F0 = float(os.environ.get("QC_TARGET_F0", "118"))
MAX_SHIFT = 0.94  # never lower pitch by more than 6 %, so it still sounds like Ujjwal
QC_PATH = "out/audio-qc.json"

HINDI_NUMBERS = {
    "एक", "दो", "तीन", "चार", "पांच", "पाँच", "छह", "छः", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह",
    "बीस", "तीस", "चालीस", "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे", "सौ", "हज़ार", "हजार", "लाख",
    "करोड़", "दशमलव", "प्रतिशत", "डेढ़", "ढाई",
}


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- text normalisation ----------
_translit = None


def latin(text):
    global _translit
    if _translit is None:
        from indic_transliteration import sanscript
        from indic_transliteration.sanscript import transliterate

        _translit = lambda t: transliterate(t, sanscript.DEVANAGARI, sanscript.ITRANS)
    return _translit(text)


def words(text):
    text = re.sub(r"\[[^\]]+\]", " ", text)
    return [w for w in re.split(r"[^\wऀ-ॿ]+", text) if w]


def skeleton(word):
    w = latin(word).lower()
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


def suspects(expected, heard):
    """Script words with no close match in what was heard."""
    exp = words(expected)
    heard_sk = [skeleton(w) for w in words(heard)]
    out = []
    for w in exp:
        sk = skeleton(w)
        if len(sk) < 3:
            continue
        best = max((SequenceMatcher(None, sk, h).ratio() for h in heard_sk), default=0)
        if best < 0.6:
            out.append(w)
    return out[:6]


def hindi_numbers(expected, heard):
    exp = set(words(expected))
    return sorted({w for w in words(heard) if w in HINDI_NUMBERS and w not in exp})


# ---------- speech recognition ----------
_model = None


def transcribe(path):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(os.environ.get("QC_WHISPER", "large-v3-turbo"), device="cpu", compute_type="int8")
    segments, _ = _model.transcribe(path, language="hi", beam_size=5, word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
    text, wl = [], []
    for seg in segments:
        text.append(seg.text.strip())
        for w in seg.words or []:
            wl.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)})
    return " ".join(text).strip(), wl


def judge(scene, path):
    heard, wl = transcribe(path)
    expected = scene["narration"]
    return {
        "file": path,
        "heard": heard,
        "words": wl,
        "score": similarity(expected, heard),
        "suspects": suspects(expected, heard),
        "hindi_numbers": hindi_numbers(expected, heard),
    }


def bad(r):
    return r["score"] < RETAKE_BELOW or bool(r["hindi_numbers"])


def check():
    job = load("out/job.final.json")
    sel = load("out/selected.json", {"ids": []})
    qc = load(QC_PATH, {"lines": {}})
    scenes = {s["id"]: s for s in job["scenes"]}
    out_dir = os.path.join("public", "jobs", job["id"])
    retake = []
    for sid in sel["ids"]:
        s = scenes[sid]
        main = os.path.join(out_dir, f"{sid}.mp3")
        line = qc["lines"].get(sid)
        if line is None:
            r = judge(s, main)
            line = {"id": sid, "expected": s["narration"], "takes": 1, **r, "retaken": False}
            print(f"{sid}: {r['score']}  {r['heard'][:70]}")
        # Judge any new retakes of this line and keep the best one.
        for n in range(2, MAX_TAKES + 1):
            take = os.path.join(out_dir, f"{sid}.take{n}.mp3")
            if not os.path.exists(take) or n <= line["takes"]:
                continue
            r = judge(s, take)
            line["takes"] = n
            line["retaken"] = True
            print(f"{sid} take {n}: {r['score']} (was {line['score']})")
            better = (not r["hindi_numbers"] and line["hindi_numbers"]) or (bool(r["hindi_numbers"]) == bool(line["hindi_numbers"]) and r["score"] > line["score"])
            if better:
                shutil.copyfile(take, main)
                line.update(r)
                line["file"] = main
        line["flagged"] = bad(line)
        qc["lines"][sid] = line
        if line["flagged"] and line["takes"] < MAX_TAKES:
            retake.append(sid)
    lines = [qc["lines"][i] for i in sel["ids"]]
    qc["summary"] = {
        "lines": len(lines),
        "average_score": round(sum(l["score"] for l in lines) / max(1, len(lines)), 1),
        "retaken": [l["id"] for l in lines if l["retaken"]],
        "still_flagged": [{"id": l["id"], "score": l["score"], "suspects": l["suspects"], "hindi_numbers": l["hindi_numbers"], "heard": l["heard"]} for l in lines if l["flagged"]],
        "suspect_words": sorted({w for l in lines for w in l["suspects"]}),
    }
    save(QC_PATH, qc)
    with open("out/retake.txt", "w") as f:
        f.write(",".join(retake))
    print(f"Retake next: {retake or 'none'}")


# ---------- voice depth ----------
def pcm(path, rate=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


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
    return (float(np.median(f0s)) if f0s else 0.0), (low / total if total else 0.0)


def voice():
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
    # Low end below 250 Hz: if the voice is thin, lift it a little. Thresholds were set on the
    # first measured runs and can be tuned with QC_BASS_MIN.
    bass_min = float(os.environ.get("QC_BASS_MIN", "0.18"))
    bass_gain = 3.0 if bass < bass_min else (1.5 if factor < 1 else 0.0)
    filters = []
    if factor < 0.999:
        filters += [f"asetrate=44100*{factor:.4f}", "aresample=44100", f"atempo={1 / factor:.4f}"]
    if bass_gain:
        filters.append(f"bass=g={bass_gain}:f=110:w=0.7")
    if filters:
        for p in files:
            tmp = p + ".tmp.mp3"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", p, "-af", ",".join(filters), "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", tmp], check=True)
            os.replace(tmp, p)
    after_f0, after_bass = analyse(files) if filters else (f0, bass)
    qc["voice"] = {
        "median_pitch_hz": round(f0, 1),
        "bass_share": round(bass, 3),
        "pitch_factor": round(factor, 3),
        "bass_boost_db": bass_gain,
        "after_pitch_hz": round(after_f0, 1),
        "after_bass_share": round(after_bass, 3),
        "target_pitch_hz": TARGET_F0,
        "verdict": "deepened" if filters else "already medium-heavy, left unchanged",
    }
    save(QC_PATH, qc)
    print(json.dumps(qc["voice"], indent=2))


if __name__ == "__main__":
    {"check": check, "voice": voice}[sys.argv[1]]()

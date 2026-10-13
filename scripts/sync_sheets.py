"""Sync check sheets: for every scene, three frames from the rendered long video, each captioned
with the words being spoken at that moment (from the audio check's word timings), so Claude can
check that narration and graphics line up.

usage: python scripts/sync_sheets.py out/job.final.json out/<id>-long.mp4
writes out/sync-01.jpg, out/sync-02.jpg, ... (4 scenes per sheet) and out/sync.json
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

FPS = 30
job = json.load(open(sys.argv[1], encoding="utf-8"))
video = sys.argv[2]
qc = {}
if os.path.exists("out/audio-qc.json"):
    qc = json.load(open("out/audio-qc.json", encoding="utf-8")).get("lines", {})

FONT_DIR = "/usr/share/fonts/truetype/noto"
def font(name, size):
    p = os.path.join(FONT_DIR, name)
    if os.path.exists(p):
        try:
            return ImageFont.truetype(p, size, layout_engine=ImageFont.Layout.RAQM)
        except Exception:
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# Hindi and English are drawn with separate fonts: Noto Sans has no Devanagari letters and
# Noto Sans Devanagari has no Latin ones, so each run of text uses the font that covers it.
SIZES = {"head": 26, "text": 21, "cap": 19}
FONTS = {k: (font("NotoSans-Bold.ttf" if k == "head" else "NotoSans-Regular.ttf", v), font("NotoSansDevanagari-Bold.ttf" if k == "head" else "NotoSansDevanagari-Regular.ttf", v)) for k, v in SIZES.items()}
import re as _re
_RUN = _re.compile(r"([\u0900-\u097F\u200c\u200d]+(?:\s+[\u0900-\u097F\u200c\u200d]+)*)")

def runs(text):
    out = []
    for i, part in enumerate(_RUN.split(text)):
        if part:
            out.append((part, i % 2 == 1))
    return out

def textlen(draw, text, kind):
    lat, dev = FONTS[kind]
    return sum(draw.textlength(t, font=dev if is_dev else lat) for t, is_dev in runs(text))

def draw_text(draw, xy, text, kind, fill):
    x, y = xy
    lat, dev = FONTS[kind]
    for t, is_dev in runs(text):
        f = dev if is_dev else lat
        draw.text((x, y), t, font=f, fill=fill)
        x += draw.textlength(t, font=f)

def frames(s):
    return max(15, round((s.get("durationSec") or 4) * FPS))

def spoken_at(s, t, line):
    """Words spoken within ±0.9 s of time t (seconds from the start of the scene)."""
    ws = (line or {}).get("words") or []
    if ws:
        near = [w["w"] for w in ws if w["e"] >= t - 0.9 and w["s"] <= t + 0.9]
        return " ".join(near) or "(pause)"
    # No timings (preview without voice): estimate from the script, evenly spread.
    import re
    toks = re.sub(r"\[[^\]]+\]", "", s["narration"]).split()
    dur = (s.get("durationSec") or 4)
    i = int(len(toks) * min(0.999, t / dur))
    return " ".join(toks[max(0, i - 2): i + 3])

def wrap(draw, text, kind, width):
    out, cur = [], ""
    for w in text.split():
        nxt = (cur + " " + w).strip()
        if textlen(draw, nxt, kind) > width and cur:
            out.append(cur); cur = w
        else:
            cur = nxt
    if cur: out.append(cur)
    return out

FW, FH = 480, 270
ROW_H = FH + 150
W = 3 * FW + 4 * 16
rows, at = [], 0
tmp = tempfile.mkdtemp()
for s in job["scenes"]:
    n = frames(s)
    line = qc.get(s["id"])
    shots = []
    for frac in (0.15, 0.55, 0.92):
        t = n * frac / FPS
        path = os.path.join(tmp, f"{s['id']}-{int(frac*100)}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{(at / FPS) + t:.3f}", "-i", video, "-frames:v", "1", "-vf", f"scale={FW}:{FH}", path], check=True)
        shots.append((t, path, spoken_at(s, t, line)))
    rows.append({"id": s["id"], "start": round(at / FPS, 2), "end": round((at + n) / FPS, 2), "narration": s["narration"], "visual": s.get("visual", {}).get("type"), "onScreen": s.get("onScreen"), "shots": shots})
    at += n

sheets = []
for k in range(0, len(rows), 4):
    chunk = rows[k:k + 4]
    img = Image.new("RGB", (W, 16 + ROW_H * len(chunk)), (245, 245, 245))
    d = ImageDraw.Draw(img)
    y = 16
    for r in chunk:
        draw_text(d, (16, y), f"{r['id']}  {r['start']:.1f}–{r['end']:.1f}s  visual: {r['visual']}" + (f"  on-screen: {r['onScreen']}" if r['onScreen'] else ""), "head", (20, 20, 20))
        ly = y + 36
        for ln in wrap(d, "Narration: " + r["narration"], "text", W - 32)[:2]:
            draw_text(d, (16, ly), ln, "text", (60, 60, 60)); ly += 28
        fy = y + 100
        for j, (t, path, words) in enumerate(r["shots"]):
            x = 16 + j * (FW + 16)
            img.paste(Image.open(path), (x, fy))
            d.rectangle([x, fy + FH, x + FW, fy + FH + 44], fill=(255, 236, 200))
            cap = wrap(d, f"{t:.1f}s spoken: {words}", "cap", FW - 12)[:2]
            for i2, c in enumerate(cap):
                draw_text(d, (x + 6, fy + FH + 2 + i2 * 21), c, "cap", (30, 30, 30))
        y += ROW_H
    name = f"sync-{len(sheets) + 1:02d}.jpg"
    img.save(os.path.join("out", name), quality=82)
    sheets.append({"file": name, "scenes": [r["id"] for r in chunk]})

json.dump({"sheets": sheets, "scenes": [{k: v for k, v in r.items() if k != "shots"} for r in rows]}, open("out/sync.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(sheets)} sync sheets for {len(rows)} scenes")

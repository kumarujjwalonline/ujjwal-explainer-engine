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
    for n in (name, "NotoSans-Regular.ttf"):
        p = os.path.join(FONT_DIR, n)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, layout_engine=ImageFont.Layout.RAQM)
            except Exception:
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_HEAD = font("NotoSans-Bold.ttf", 26)
F_TEXT = font("NotoSansDevanagari-Regular.ttf", 21)
F_CAP = font("NotoSansDevanagari-Regular.ttf", 19)

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

def wrap(draw, text, fnt, width):
    out, cur = [], ""
    for w in text.split():
        nxt = (cur + " " + w).strip()
        if draw.textlength(nxt, font=fnt) > width and cur:
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
        d.text((16, y), f"{r['id']}  {r['start']:.1f}–{r['end']:.1f}s  visual: {r['visual']}" + (f"  on-screen: {r['onScreen']}" if r['onScreen'] else ""), font=F_HEAD, fill=(20, 20, 20))
        ly = y + 36
        for ln in wrap(d, "Narration: " + r["narration"], F_TEXT, W - 32)[:2]:
            d.text((16, ly), ln, font=F_TEXT, fill=(60, 60, 60)); ly += 28
        fy = y + 100
        for j, (t, path, words) in enumerate(r["shots"]):
            x = 16 + j * (FW + 16)
            img.paste(Image.open(path), (x, fy))
            d.rectangle([x, fy + FH, x + FW, fy + FH + 44], fill=(255, 236, 200))
            cap = wrap(d, f"{t:.1f}s spoken: {words}", F_CAP, FW - 12)[:2]
            for i2, c in enumerate(cap):
                d.text((x + 6, fy + FH + 2 + i2 * 21), c, font=F_CAP, fill=(30, 30, 30))
        y += ROW_H
    name = f"sync-{len(sheets) + 1:02d}.jpg"
    img.save(os.path.join("out", name), quality=82)
    sheets.append({"file": name, "scenes": [r["id"] for r in chunk]})

json.dump({"sheets": sheets, "scenes": [{k: v for k, v in r.items() if k != "shots"} for r in rows]}, open("out/sync.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(sheets)} sync sheets for {len(rows)} scenes")

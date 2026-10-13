"""Real copyright-free footage (production rule 19), fetched on GitHub.

For every scene whose visual is {"type": "footage", "query": ...}:
  1. Wikimedia Commons (free licences, no API key needed) — always tried first.
  2. Pexels — only if a PEXELS_API_KEY secret exists (Pexels paused new keys in 2026).
The clip is converted to a silent 1280px-wide H.264 mp4 and looped if shorter than the scene.
The licence and author go into the on-screen credit (Commons licences need attribution).
No match -> the scene shows its caption instead.
usage: python scripts/fetch_footage.py out/job.final.json
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "ujjwal-explainer-engine/1.0 (github.com/kumarujjwalonline/ujjwal-explainer-engine)"}
COMMONS = "https://commons.wikimedia.org/w/api.php"
BAD = re.compile(r"\b(logo|map|diagram|animation|slides?|lecture|interview|trailer|screencast)\b", re.I)

path = sys.argv[1] if len(sys.argv) > 1 else "out/job.final.json"
job = json.load(open(path, encoding="utf-8"))
scenes = [s for s in job["scenes"] if (s.get("visual") or {}).get("type") == "footage"]
if not scenes:
    print("No footage scenes")
    sys.exit(0)
out_dir = os.path.join("public", "jobs", job["id"], "footage")
tmp_dir = os.path.join("out", "footage-raw")
os.makedirs(out_dir, exist_ok=True)
os.makedirs(tmp_dir, exist_ok=True)
pexels_key = os.environ.get("PEXELS_API_KEY", "").strip()
used = set()
report = []


def get_json(url, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return json.load(urllib.request.urlopen(req, timeout=40))


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def commons(query, need):
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrsearch": f"{query} filetype:video", "gsrlimit": 20,
        "prop": "videoinfo", "viprop": "url|size|mime|extmetadata|derivatives",
    }
    data = get_json(COMMONS + "?" + urllib.parse.urlencode(params))
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        title = p.get("title", "")
        if title in used or BAD.search(title):
            continue
        info = (p.get("videoinfo") or [{}])[0]
        dur = float(info.get("duration") or 0)
        w, h = info.get("width") or 0, info.get("height") or 0
        if dur < 3 or w < 960 or h > w:  # need landscape, at least ~HD, a few seconds long
            continue
        meta = info.get("extmetadata") or {}
        lic = strip_html((meta.get("LicenseShortName") or {}).get("value"))
        if not lic or "fair use" in lic.lower():
            continue
        # prefer a ready-made ~720p transcode (smaller download); else the original
        derivs = [d for d in info.get("derivatives") or [] if 640 <= (d.get("width") or 0) <= 1920]
        derivs.sort(key=lambda d: abs((d.get("width") or 0) - 1280))
        src = derivs[0]["src"] if derivs else info.get("url")
        if not src:
            continue
        artist = strip_html((meta.get("Artist") or {}).get("value"))[:60] or "Wikimedia Commons"
        return {"id": title, "url": src, "duration": dur, "credit": f"Video: {artist} / Wikimedia Commons ({lic})", "page": info.get("descriptionurl")}
    return None


def pexels(query, need):
    if not pexels_key:
        return None
    q = urllib.parse.urlencode({"query": query, "orientation": "landscape", "size": "medium", "per_page": 12})
    data = get_json(f"https://api.pexels.com/videos/search?{q}", {"Authorization": pexels_key})
    for vid in data.get("videos", []):
        if vid["id"] in used or vid.get("duration", 0) < 3:
            continue
        files = sorted((f for f in vid.get("video_files", []) if f.get("file_type") == "video/mp4" and 1280 <= (f.get("width") or 0) <= 1920), key=lambda f: -(f.get("width") or 0))
        if files:
            return {"id": vid["id"], "url": files[0]["link"], "duration": vid.get("duration", 0), "credit": f"Video: {vid.get('user', {}).get('name', 'Pexels')} / Pexels", "page": vid.get("url")}
    return None


for s in scenes:
    v = s["visual"]
    query = (v.get("query") or "").strip()
    need = (s.get("durationSec") or 6) + 0.5
    pick, err = None, None
    words = query.split()
    tries = [query] + ([" ".join(words[:3])] if len(words) > 3 else []) + ([" ".join(words[:2])] if len(words) > 2 else [])
    for q in tries:  # Commons search is literal, so shorten the query if nothing matches
        for finder in (commons, pexels):
            try:
                pick = finder(q, need)
            except Exception as e:  # noqa: BLE001
                err = f"{finder.__name__}: {e}"
            if pick:
                break
        if pick:
            break
    if not pick:
        print(s["id"], "no clip for", repr(query), err or "")
        report.append({"scene": s["id"], "query": query, "found": False, "error": err})
        continue
    used.add(pick["id"])
    raw = os.path.join(tmp_dir, f"{s['id']}.src")
    dest = os.path.join(out_dir, f"{s['id']}.mp4")
    try:
        req = urllib.request.Request(pick["url"], headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r, open(raw, "wb") as f:
            f.write(r.read())
        loop = ["-stream_loop", "-1"] if pick["duration"] < need else []
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *loop, "-i", raw, "-t", f"{need:.2f}", "-an",
                        "-vf", "scale=1280:-2,fps=30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                        "-pix_fmt", "yuv420p", dest], check=True, timeout=300)
    except Exception as e:  # noqa: BLE001
        print(s["id"], "download/convert failed", e)
        report.append({"scene": s["id"], "query": query, "found": False, "error": str(e)[:200]})
        continue
    v["src"] = f"jobs/{job['id']}/footage/{s['id']}.mp4"
    v["credit"] = pick["credit"]
    print(s["id"], "->", v["src"], "|", pick["credit"])
    report.append({"scene": s["id"], "query": query, "found": True, "credit": pick["credit"], "page": pick["page"]})

json.dump(job, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(report, open(os.path.join("out", "footage-report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

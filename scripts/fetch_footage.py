"""Real copyright-free footage (production rule 19) from Pexels, fetched on GitHub.

For every scene whose visual is {"type": "footage", "query": ...}, search Pexels videos and
download a landscape HD clip at least as long as the scene. Needs the free PEXELS_API_KEY
repository secret; without it (or with no match) the scene shows its caption instead.
Pexels licence: free to use, no attribution required (we credit the videographer anyway).
usage: python scripts/fetch_footage.py out/job.final.json
"""
import json
import os
import sys
import urllib.parse
import urllib.request

path = sys.argv[1] if len(sys.argv) > 1 else "out/job.final.json"
job = json.load(open(path, encoding="utf-8"))
scenes = [s for s in job["scenes"] if (s.get("visual") or {}).get("type") == "footage"]
key = os.environ.get("PEXELS_API_KEY", "").strip()
if not scenes:
    print("No footage scenes")
    sys.exit(0)
if not key:
    print("PEXELS_API_KEY not set: footage scenes will show their caption")
    sys.exit(0)
out_dir = os.path.join("public", "jobs", job["id"], "footage")
os.makedirs(out_dir, exist_ok=True)
used = set()
for s in scenes:
    v = s["visual"]
    q = urllib.parse.urlencode({"query": v.get("query", ""), "orientation": "landscape", "size": "medium", "per_page": 12})
    req = urllib.request.Request(f"https://api.pexels.com/videos/search?{q}", headers={"Authorization": key, "User-Agent": "ujjwal-explainer-engine"})
    try:
        data = json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:  # noqa: BLE001
        print(s["id"], "search failed", e)
        continue
    need = (s.get("durationSec") or 6) + 0.5
    pick = None
    for vid in data.get("videos", []):
        if vid["id"] in used or vid.get("duration", 0) < need:
            continue
        files = sorted((f for f in vid.get("video_files", []) if f.get("file_type") == "video/mp4" and (f.get("width") or 0) >= 1280 and (f.get("width") or 0) <= 1920), key=lambda f: -(f.get("width") or 0))
        if files:
            pick = (vid, files[0])
            break
    if not pick:
        print(s["id"], "no suitable clip for", v.get("query"))
        continue
    vid, f = pick
    used.add(vid["id"])
    dest = os.path.join(out_dir, f"{s['id']}.mp4")
    urllib.request.urlretrieve(f["link"], dest)
    v["src"] = f"jobs/{job['id']}/footage/{s['id']}.mp4"
    v["credit"] = f"Video: {vid.get('user', {}).get('name', 'Pexels')} / Pexels"
    print(s["id"], "->", v["src"], v["credit"])
json.dump(job, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

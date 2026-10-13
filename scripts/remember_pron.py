"""Keep pronunciation knowledge for all future videos (production rule 22).

Merges into pronunciations/indian-english.json:
  - job.voice.guide         new dictionary entries Claude wrote for this script  -> guide
  - job.voice.pronunciations fixes from change requests                          -> always
  - words the audio check had to force (still wrong after retakes)              -> always
Prints "changed" when the file was updated (the workflow then commits it).
"""
import json
import sys

PATH = "pronunciations/indian-english.json"
job = json.load(open("out/job.final.json", encoding="utf-8"))
try:
    qc = json.load(open("out/audio-qc.json", encoding="utf-8"))
except FileNotFoundError:
    qc = {}
d = json.load(open(PATH, encoding="utf-8"))
before = json.dumps(d, ensure_ascii=False, sort_keys=True)
v = job.get("voice") or {}
for k, say in (v.get("guide") or {}).items():
    if k and say and k.lower() not in d["guide"] and k.lower() not in d["always"]:
        d["guide"][k.lower()] = say
for x in v.get("pronunciations") or []:
    if x.get("word") and x.get("say_as"):
        d["always"][x["word"].lower()] = x["say_as"]
guide = {**d["guide"], **d["always"]}
for f in (qc.get("summary") or {}).get("forced") or []:
    for w in f.get("words") or []:
        if w.lower() in guide:
            d["always"][w.lower()] = guide[w.lower()]
d["guide"] = dict(sorted(d["guide"].items()))
d["always"] = dict(sorted(d["always"].items()))
if json.dumps(d, ensure_ascii=False, sort_keys=True) != before:
    json.dump(d, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("changed")

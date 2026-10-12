#!/usr/bin/env bash
# Purposeful SFX, synthesised with ffmpeg so there is nothing to license.
set -euo pipefail
OUT="${1:-public/sfx}"
mkdir -p "$OUT"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
# whoosh: band-passed noise sweeping up then fading
ff -f lavfi -i "anoisesrc=d=0.7:c=pink:a=0.6" -af "highpass=f=300,lowpass=f=3000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.4,volume=1.4" "$OUT/whoosh.wav"
# ping: soft bell tone with a quick decay
ff -f lavfi -i "sine=f=1320:d=0.9" -af "afade=t=out:st=0.05:d=0.85,volume=0.5" "$OUT/ping.wav"
# tick: very short click for counters and timeline nodes
ff -f lavfi -i "sine=f=2200:d=0.05" -af "afade=t=out:st=0:d=0.05,volume=0.6" "$OUT/tick.wav"
# hit: low thump for a key reveal
ff -f lavfi -i "sine=f=60:d=0.6" -af "afade=t=out:st=0.02:d=0.55,volume=2.2" "$OUT/hit.wav"
# pop: short rising blip for items appearing
ff -f lavfi -i "sine=f=660:d=0.12" -af "afade=t=out:st=0.02:d=0.1,volume=0.5" "$OUT/pop.wav"
echo "SFX ready in $OUT"

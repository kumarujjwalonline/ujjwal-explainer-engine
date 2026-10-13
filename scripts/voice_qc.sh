#!/usr/bin/env bash
# Voice + audio check: generate clips, transcribe them, re-record lines said wrongly
# (up to 2 retakes each), cache the best raw takes, deepen the voice if it is light,
# then measure final durations.
# usage: bash scripts/voice_qc.sh jobs/<id>.json <full|sample|none>
set -euo pipefail
JOB="$1"; MODE="$2"
node scripts/voice.mjs "$JOB" "$MODE"
if [ "$MODE" = "none" ] || [ -z "${ELEVENLABS_API_KEY:-}" ]; then exit 0; fi
rm -f out/audio-qc.json
python3 scripts/audio_qc.py check
for TAKE in 2 3; do
  RETAKE="$(cat out/retake.txt)"
  [ -z "$RETAKE" ] && break
  RETAKE="$RETAKE" TAKE="$TAKE" node scripts/voice.mjs out/job.final.json retake
  python3 scripts/audio_qc.py check
done
node scripts/voice.mjs out/job.final.json cache
python3 scripts/audio_qc.py voice
node scripts/voice.mjs out/job.final.json finish

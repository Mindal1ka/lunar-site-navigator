#!/usr/bin/env sh
# AI-assisted: written with Claude, reviewed by the team.
# Builds the 30 s demo video: frame-exact 3D capture of the running site + synthesized music.
# Needs the site on http://127.0.0.1:44000 (node serve.mjs) and the venv (scipy, imageio-ffmpeg).
# usage: sh scripts/video/make.sh   -> video/lunar-landing-site-navigator-30s.mp4
set -e
cd "$(dirname "$0")/../.."
PY=.venv/Scripts/python
FF=$($PY -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
mkdir -p video
$PY scripts/video/music.py video/music.wav
node scripts/video/capture.mjs video/scene.mp4 60 0 30 1.5
"$FF" -y -loglevel error -i video/scene.mp4 -i video/music.wav \
	-map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart \
	video/lunar-landing-site-navigator-30s.mp4
echo "video/lunar-landing-site-navigator-30s.mp4"

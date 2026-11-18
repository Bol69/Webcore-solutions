#!/usr/bin/env bash
# Usine à vidéos : une voix off + un dossier vidéo -> la vidéo finale prête à publier.
#
#   ./fabrique/fabriquer.sh videos/<sujet> <voix.mp3>
#
# Le dossier vidéo contient :
#   script.txt   une phrase par ligne (exactement ce que dit la voix, une petite pause entre chaque phrase)
#   scenes.json  {"starts": [début de chaque scène dans l'animation], "end": fin, "tail": secondes après la voix}
#   build.js     génère l'animation (video.html, fonction seek(t))
#   sfx.py       place les bruitages (sur le temps de l'animation)
# Sortie : videos/<sujet>/final.mp4
set -euo pipefail
DIR="$(cd "$1" && pwd)"; VOIX="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "1/5  Repérage des phrases dans la voix"
python3 -I "$HERE/aligner.py" "$VOIX" "$DIR/script.txt" "$DIR/scenes.json" "$DIR/warp.json"
DUREE=$(python3 -c "import json;print(json.load(open('$DIR/warp.json'))[-1][0])")

echo "2/5  Animation"
node "$DIR/build.js" "$TMP/video.html" >/dev/null

echo "3/5  Rendu image par image (quelques minutes)"
node "$HERE/render.js" "$TMP/video.html" "$DUREE" "$TMP/image.mp4" "$DIR/warp.json"

echo "4/5  Bruitages"
WARP="$DIR/warp.json" PEAK_DB=-15 python3 -I "$DIR/sfx.py" "$TMP/sfx.wav" >/dev/null

echo "5/5  Mixage voix + bruitages"
ffmpeg -v error -y -i "$TMP/image.mp4" -i "$VOIX" -i "$TMP/sfx.wav" -filter_complex \
  "[1:a]aresample=48000,aformat=channel_layouts=stereo[v];[2:a]aresample=48000[s];[v][s]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUREE" -movflags +faststart "$DIR/final.mp4"
echo "Terminé : $DIR/final.mp4"

# Contenu e-com : usine à vidéos

## Ce qu'il y a ici
- `personnage/` : le personnage vert (8 poses SVG, planche, générateur `gen.js`).
- `checklist/` : la checklist PDF « page produit » et les messages ManyChat.
- `fabrique/` : l'usine (alignement voix, rendu, mixage).
- `videos/<sujet>/` : une vidéo = script + scènes + animation + bruitages + voix + `final.mp4`.

## Faire une nouvelle vidéo
1. **Sujet** : donne le sujet à Claude. Il écrit `script.txt` (une phrase par ligne) avec les skills
   `viral-hook-writer`, `virality` et `reel-scripter`, puis crée l'animation (`build.js`, `scenes.json`, `sfx.py`).
2. **Voix** : colle le script dans ElevenLabs avec ta voix, en laissant une petite pause entre chaque phrase.
   Télécharge le MP3 et envoie-le à Claude.
3. **Fabrication** (automatique, ~1 à 2 min) :
   ```
   ./fabrique/fabriquer.sh videos/<sujet> chemin/vers/voix.mp3
   ```
   → `videos/<sujet>/final.mp4`, avec l'animation calée sur chaque phrase et les bruitages.
4. **Publication** : tu relis la vidéo, puis tu publies (ou Claude publie sur TikTok via Higgsfield).

## Règle d'or
Toujours regarder la vidéo avant de la publier.

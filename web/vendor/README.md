# vendor/

`supabase.js` est le client officiel **@supabase/supabase-js v2.45.4**, pré-compilé
en un seul fichier ESM (esbuild, ~100 Ko) et **commité volontairement** :

- l'app ne dépend d'aucun CDN au moment de l'exécution ;
- elle continue de démarrer hors-ligne (le service worker le met en cache) ;
- rien à installer pour l'utiliser.

Ne le modifie pas à la main. Pour changer de version :

```bash
bash tools/build-vendor.sh 2.45.4
```

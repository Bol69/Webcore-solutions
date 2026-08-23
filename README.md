<div align="center">

# 🏆 TeamSport

**Le pointage sport privé, entre potes.**
Tu fais ta séance → tu postes la preuve → tu marques des points → tes potes reçoivent une notif.

*100 % gratuit · aucune carte bancaire · groupe fermé à 3 personnes*

</div>

---

## Ce que ça fait

- 📸 **Preuve obligatoire** — pas de photo, pas de séance. La photo est compressée
  sur le téléphone et stockée dans un espace **privé** (URLs signées, valables 1 h).
- 🏅 **Points automatiques** — calculés **côté serveur**, impossible à truquer
  depuis le téléphone.
- 🔥 **Séries (streaks)** — les jours consécutifs rapportent plus.
- 📊 **Classement** semaine / mois / total, avec podium.
- 🔔 **Notifications push** — « Bilel a fait sa séance 🏋️ · Muscu · 60 min · +12 pts ».
- ⚡ **Feed en direct** — pas besoin de rafraîchir, ça arrive tout seul.
- 💬 **Réactions** 💪 🔥 👏 😤 🐐 sous chaque séance.
- 🎯 **Objectif hebdo** par personne, avec barre de progression.
- 📱 **PWA** — s'installe sur l'écran d'accueil et s'ouvre en plein écran, comme une vraie app.
  Fonctionne sur iPhone **et** Android, sans passer par l'App Store.

## Le barème

| Règle | Points |
|---|---|
| Une séance prouvée | **+10** |
| Chaque tranche de 10 min au-delà de 30 min | **+1** (max +10) |
| Chaque jour de série en cours | **+2** (max +10) |
| 3ᵉ séance du même jour et suivantes | **0** (anti-spam) |

*Exemple : 60 min de muscu, 3ᵉ jour d'affilée → 10 + 3 + 4 = **17 points**.*

Tout se règle dans `web/config.js` (sports, objectif hebdo, nom du groupe) et
dans la fonction `compute_workout_points()` de `supabase/schema.sql` pour le barème.

## Démarrage

👉 **[Le guide complet est ici : `docs/SETUP.md`](docs/SETUP.md)** (≈ 20 min)

En résumé :

1. Créer un projet gratuit sur [supabase.com](https://supabase.com)
2. Coller `supabase/schema.sql` dans le SQL Editor et faire **Run**
3. Remplir `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `web/config.js`
4. Publier le dossier `web/` (GitHub Pages, Cloudflare Pages ou Netlify — gratuit)
5. Chacun crée son compte, puis on **ferme les inscriptions** dans Supabase
6. *(optionnel)* `node tools/gen-vapid.mjs` + déployer la fonction `notify` pour les push

## Tester en local

```bash
cd web && python3 -m http.server 5173
# puis http://localhost:5173
```

> Le service worker et les notifications ont besoin de `localhost` ou de HTTPS.
> C'est le cas ici, donc tout fonctionne.

## Structure

```
web/                      l'application (aucun build, aucune dépendance à installer)
  index.html              écrans : connexion, feed, classement, profil
  app.js                  toute la logique
  styles.css              thème sombre, mobile first
  config.js               ⚙️ LE SEUL FICHIER À REMPLIR
  sw.js                   cache hors-ligne + réception des notifications
  manifest.webmanifest    pour l'installation sur l'écran d'accueil
  vendor/supabase.js      le client Supabase, pré-compilé et embarqué (aucun CDN)
supabase/
  schema.sql              tables, sécurité (RLS), calcul des points, stockage
  functions/notify/       Edge Function qui envoie les push
tools/
  gen-vapid.mjs           génère les clés de notification
  gen_icons.py            régénère les icônes de l'app
docs/SETUP.md             le guide pas à pas
```

## Sécurité & vie privée

- Chaque table est protégée par **Row Level Security** : il faut un compte du groupe
  pour lire quoi que ce soit, et personne ne peut écrire à la place d'un autre.
- Les photos sont dans un bucket **privé** ; l'app génère des liens signés temporaires.
- Une fois les 3 comptes créés, **les inscriptions se ferment** : le groupe est verrouillé.
- La clé `anon` présente dans `config.js` est publique par conception — seule, elle
  ne donne accès à rien.

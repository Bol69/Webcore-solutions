<div align="center">

# 🏆 TeamSport

**Le pointage sport privé, entre potes.**
Tu fais ta séance → tu postes la preuve → tes potes reçoivent une notif.
Tu rates ton contrat de la semaine → tu prends un gage le lundi.

*100 % gratuit · aucune carte bancaire · groupe fermé à 3 personnes*

</div>

---

## Ce que ça fait

- 📸 **Preuve obligatoire** — pas de photo, pas de séance. La photo est compressée
  sur le téléphone et stockée dans un espace **privé** (URLs signées, valables 1 h).
- 📝 **Chacun son contrat hebdo** — tu choisis *toi-même* ton nombre de séances
  par semaine et, si tu veux, un nombre de **kilomètres** (course, vélo, marche…).
  Chacun des trois règle le sien.
- 🎲 **Système de gages** — chaque lundi, le serveur fait le bilan de la semaine
  écoulée. Celui qui n'a pas tenu son contrat se voit tirer **un gage au hasard**
  dans la liste que vous écrivez ensemble. Impossible d'y échapper : le calcul et
  le tirage sont faits par la base, pas par le téléphone.
- 🎯 **Objectif long terme** — un poids à atteindre, un temps au 10 km, un nombre
  de tractions… sur quelques mois ou un an, avec courbe de suivi et progression.
- 🔥 **Séries (streaks)** — les jours d'affilée sont comptés et affichés.
- 📊 **Classement au contrat** — pas de points : ceux qui tiennent leur contrat sont
  premiers ex æquo, les autres derrière. Semaine / mois / total, avec podium.
- 🗓️ **Tableau des séances** — une grille qui montre, semaine par semaine, qui a
  fait quoi et quel jour. On remonte les semaines passées avec les flèches.
- 🔔 **Notifications push** — « Bilel a fait sa séance 🏋️ · Muscu · 60 min », et le
  bilan du lundi avec les gages tirés.
- ⚡ **Feed en direct** — pas besoin de rafraîchir, ça arrive tout seul.
- 💬 **Réactions** 💪 🔥 👏 😤 🐐 sous chaque séance.
- 📱 **PWA** — s'installe sur l'écran d'accueil et s'ouvre en plein écran, comme une vraie app.
  Fonctionne sur iPhone **et** Android, sans passer par l'App Store.

## Le classement

**Il n'y a pas de points.** Le seul but, c'est de tenir son contrat.

| Situation | Place |
|---|---|
| Contrat tenu | **1er** — et si vous êtes plusieurs, vous êtes **tous 1ers** |
| Contrat raté | derrière, avec un **gage le lundi** |

*Exemple : deux d'entre vous tiennent leur contrat, le troisième rate une séance
→ les deux sont 1ers, le troisième est 2e et prend le gage.*

En **Mois** et **Total**, le classement compte le nombre de **semaines tenues**.

## Le contrat hebdo et les gages

Chacun définit son propre contrat dans l'onglet **Moi** :

| Réglage | Exemple |
|---|---|
| Séances par semaine | *Bilel : 3 · Yanis : 4 · Sofiane : 2* |
| Kilomètres par semaine | *Sofiane : 20 km de course* (0 = pas d'objectif km) |

Puis, automatiquement :

1. La semaine va du **lundi au dimanche** (heure de Paris).
2. Une séance = **un jour** où tu as posté au moins une preuve — poster deux fois
   le même jour ne compte pas double.
3. Le lundi, à la première ouverture de l'app par n'importe qui, le serveur clôture
   la semaine écoulée. C'est **idempotent** : peu importe qui ouvre en premier,
   le résultat est identique et ne peut pas être recalculé.
4. Contrat non tenu → **un gage tiré au hasard**, visible par tout le groupe
   jusqu'à ce que la personne appuie sur « C'est fait ».
5. La **semaine d'inscription est offerte** (elle est presque toujours incomplète).

### La roue

Le tirage passe par une roue, dans l'onglet **Gages** :

1. La roue est **ouverte le samedi et le dimanche**. Chacun la tourne **une fois**
   dans le week-end : ça donne jusqu'à **3 gages candidats**, visibles par tous.
2. Le lundi, chaque personne qui n'a pas tenu son contrat se voit tirer un gage
   **parmi ces candidats** — deux perdants peuvent donc tomber sur des gages
   différents.
3. Si personne n'a tourné sa roue, on retombe sur un tirage dans la liste complète.
   Un oubli ne bloque rien.

Vous tournez donc **avant** de savoir qui a perdu : au moment du tirage, personne
ne sait encore pour qui le gage tombera.

> Le résultat est décidé par la base (`spin_wheel()`), la roue affichée ne fait que
> s'arrêter dessus. Impossible de se choisir un gage tranquille depuis son téléphone,
> et une fois tourné le résultat ne change plus.

La liste des gages se remplit dans l'onglet **Gages** — chacun peut en ajouter et
en retirer. Sept gages de départ sont livrés avec le schéma, à vous de les adapter.

> Pour que le bilan tombe tout seul le lundi matin même sans ouvrir l'app, il y a
> un `cron.schedule` prêt à décommenter en bas de `supabase/schema.sql` (extension
> `pg_cron`, incluse dans l'offre gratuite).

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
  index.html              écrans : connexion, feed, classement, tableau, gages, profil
  app.js                  toute la logique
  styles.css              thème sombre, mobile first
  config.js               ⚙️ LE SEUL FICHIER À REMPLIR
  sw.js                   cache hors-ligne + réception des notifications
  manifest.webmanifest    pour l'installation sur l'écran d'accueil
  vendor/supabase.js      le client Supabase, pré-compilé et embarqué (aucun CDN)
supabase/
  schema.sql              tables, sécurité (RLS), contrats hebdo, gages, roue
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

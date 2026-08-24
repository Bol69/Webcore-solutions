# Installation pas à pas (≈ 20 min, 100 % gratuit)

Tu n'as **rien à payer** et **aucune carte bancaire à donner**.
Il te faut juste un compte GitHub (déjà fait) et un compte Supabase gratuit.

| Ce qu'on utilise | Pourquoi | Coût |
|---|---|---|
| **Supabase** (offre gratuite) | base de données, comptes, stockage des photos, temps réel | 0 € |
| **GitHub Pages / Netlify / Cloudflare Pages** | héberger la page web | 0 € |
| **Web Push** (VAPID) | les notifications sur le téléphone | 0 € |

> ⚠️ Un projet Supabase gratuit se met en pause après **7 jours sans aucune activité**.
> Vu que vous postez vos séances régulièrement, ça n'arrivera pas. Si ça arrive,
> un clic sur « Restore » dans le dashboard le relance.

---

## Étape 1 — Créer le projet Supabase

1. Va sur <https://supabase.com> → **Start your project** → connexion avec GitHub.
2. **New project** :
   - Name : `teamsport`
   - Database password : mets-en un et note-le quelque part
   - Region : **Europe (Frankfurt / Paris)** — plus proche = plus rapide
   - Plan : **Free**
3. Attends ~2 minutes que le projet se crée.

## Étape 2 — Créer les tables

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Ouvre le fichier `supabase/schema.sql` de ce dépôt, **copie tout**, colle dans l'éditeur.
3. Clique **Run**.

Ça crée : les profils, les séances, les réactions, les contrats hebdomadaires,
les objectifs long terme, la liste de gages, la roue, la clôture automatique
des semaines, les règles de sécurité et le bucket privé pour les photos.

> Le fichier est **ré-exécutable** : si tu l'avais déjà lancé dans une version
> précédente, relance-le simplement en entier, rien ne sera cassé ni effacé.

## Étape 3 — Récupérer les clés et remplir `web/config.js`

1. **Project Settings** (roue crantée) → **Data API** → copie l'**URL du projet**
   (`https://xxxxxxxx.supabase.co`).
2. **Project Settings** → **API Keys** → copie la clé **`anon` / `publishable`**.
3. Ouvre `web/config.js` et remplis :

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
GROUP_NAME: "Les Bourrins",     // le nom de votre groupe
DEFAULT_SESSIONS_TARGET: 3,     // contrat par défaut, chacun règle le sien ensuite
```

> Le nombre de séances et de kilomètres par semaine ne se règle **pas** ici :
> chacun choisit le sien dans l'app, onglet **Moi → Mon contrat de la semaine**.

> La clé `anon` est **faite pour être publique** : elle ne donne accès à rien
> toute seule. Ce sont les règles RLS (étape 2) qui protègent les données,
> et elles exigent d'être connecté avec un compte du groupe.

## Étape 4 — Ouvrir les comptes (vous 3), puis fermer la porte

1. Dans Supabase : **Authentication** → **Sign In / Providers** → **Email** :
   - laisse **Email** activé,
   - **désactive « Confirm email »** → l'inscription est immédiate, pas d'email à recevoir.
2. Mets l'app en ligne (étape 6), puis **chacun crée son compte** depuis son téléphone
   (email + mot de passe + pseudo + avatar).
3. Une fois vos 3 comptes créés : reviens dans **Authentication → Sign In / Providers**
   et **désactive « Allow new users to sign up »**.
   👉 Même si quelqu'un tombe sur le lien, il ne pourra plus entrer. Le groupe est fermé.

## Étape 5 — Les notifications push (facultatif mais c'est le plus sympa)

Sans cette étape, l'app fonctionne quand même : le feed se met à jour **en direct**
quand l'app est ouverte. Mais pour recevoir une alerte **téléphone fermé**, il faut ceci.

1. Génère tes clés :

```bash
node tools/gen-vapid.mjs
```

2. Copie la **clé publique** dans `web/config.js` → `VAPID_PUBLIC_KEY`.
3. Installe le CLI Supabase et déploie la fonction :

```bash
npm install -g supabase
supabase login
supabase link --project-ref xxxxxxxx     # l'identifiant dans ton URL Supabase

supabase secrets set \
  VAPID_PUBLIC_KEY="...la clé publique..." \
  VAPID_PRIVATE_KEY="...la clé privée..." \
  VAPID_SUBJECT="mailto:ton@email.com"

supabase functions deploy notify
```

> Pas envie de la ligne de commande ? Tu peux aussi créer la fonction depuis
> **Edge Functions → Deploy a new function** dans le dashboard, en collant le
> contenu de `supabase/functions/notify/index.ts`, puis ajouter les 3 secrets
> dans **Edge Functions → Secrets**.

4. Dans l'app, onglet **Moi** → **Activer les notifications**. À faire par chacun.

**Sur iPhone c'est obligatoire** : ouvre le site dans Safari → bouton *Partager* →
**« Sur l'écran d'accueil »**, puis lance l'app **depuis l'icône**. iOS n'autorise
les notifications web que dans ce mode (iOS 16.4 minimum).

## Étape 6 — Mettre l'app en ligne

### Option A — GitHub Pages (le plus simple si le dépôt est public)

Le workflow `.github/workflows/deploy-pages.yml` est déjà prêt.

1. Dans ton dépôt GitHub : **Settings → Pages → Source : GitHub Actions**.
2. Pousse sur `main` : le site se publie sur
   `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

### Option B — Cloudflare Pages ou Netlify (marche aussi avec un dépôt privé)

- Cloudflare Pages : **Create project → Connect to Git**, build command : *(vide)*,
  output directory : `web`.
- Netlify : glisse-dépose simplement le dossier `web/` sur <https://app.netlify.com/drop>.

## Étape 6 bis — Régler vos contrats (à faire une fois, chacun)

1. Onglet **Moi → Mon contrat de la semaine** : choisis ton nombre de séances
   par semaine, et éventuellement des kilomètres. Puis **Enregistrer**.
2. Onglet **Moi → Mon objectif long terme** : facultatif — un poids à atteindre,
   un temps, un nombre de tractions… avec une échéance dans quelques mois.
3. Onglet **Gages** : écrivez ensemble votre liste de gages. Sept sont déjà là
   pour démarrer, supprimez ceux qui ne vous parlent pas et ajoutez les vôtres.
4. **La roue** (même onglet) s'ouvre le **samedi** et se ferme **dimanche à minuit**.
   Chacun la tourne une fois dans le week-end pour sortir un gage candidat.
   Le lundi, celui qui a raté son contrat récupère un des candidats.

Le premier bilan tombe le lundi suivant : la semaine où vous démarrez est offerte.

### (Facultatif) Que le bilan tombe tout seul le lundi matin

L'app clôture les semaines dès que l'un de vous l'ouvre, donc ce n'est pas
nécessaire. Si tu veux que ça parte même sans ouvrir l'app : dans Supabase,
**Database → Extensions**, active **pg_cron**, puis décommente le bloc
`cron.schedule` tout en bas de `supabase/schema.sql` et exécute-le.

### Étape 7 — L'installer sur le téléphone

- **Android / Chrome** : menu ⋮ → « Installer l'application ».
- **iPhone / Safari** : Partager → « Sur l'écran d'accueil ».

Elle s'ouvre alors en plein écran, comme une vraie app. 🎉

---

## Limites de l'offre gratuite (vous êtes très loin de les atteindre)

| Ressource | Gratuit | Votre usage à 3 |
|---|---|---|
| Base de données | 500 Mo | quelques Mo par an |
| Stockage photos | 1 Go | ~150 Ko/photo compressée → ~6 000 séances |
| Utilisateurs | 50 000 | 3 |
| Edge Functions | 500 000 appels/mois | ~100/mois |
| Notifications push | illimité (service des navigateurs) | — |

## Problèmes fréquents

**« Les photos ne s'affichent pas »**
Le bucket `proofs` doit exister et être **privé**. Ré-exécute `schema.sql`.

**« Impossible de créer un compte »**
Vérifie que « Allow new users to sign up » est encore activé (étape 4), et que
« Confirm email » est désactivé.

**« Je ne reçois pas les notifications »**
- iPhone : l'app doit être lancée **depuis l'icône de l'écran d'accueil**.
- Vérifie que `VAPID_PUBLIC_KEY` est bien dans `config.js` **et** que les 3 secrets
  sont posés sur Supabase.
- Regarde les logs : **Edge Functions → notify → Logs**.

**« Le projet est en pause »**
Dashboard Supabase → bouton **Restore**. Puis postez une séance de temps en temps 😉

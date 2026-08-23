// =====================================================================
//  CONFIGURATION — c'est le SEUL fichier à remplir.
//  Voir docs/SETUP.md pour savoir où trouver ces valeurs (tout est gratuit).
// =====================================================================

export const CONFIG = {
  // Supabase > Project Settings > Data API  (et > API Keys pour la clé)
  SUPABASE_URL: "https://kfcebupnbgoydnxlaabk.supabase.co",       // ex: "https://abcdefghijkl.supabase.co"
  SUPABASE_ANON_KEY: "sb_publishable_O5M56Z7PpUXfcLcz3JbJ-w_gPAKqhEa",  // la clé "anon / publishable" — elle est publique, c'est normal

  // Notifications push (facultatif au début, voir docs/SETUP.md étape 5)
  // Générer avec :  node tools/gen-vapid.mjs
  VAPID_PUBLIC_KEY: "",

  // ---- Réglages du groupe -------------------------------------------
  GROUP_NAME: "projet BAF",   // affiché en haut de l'app
  TIMEZONE: "Europe/Paris",

  // Contrat hebdo par défaut, tant que la personne n'a pas réglé le sien
  // dans l'onglet « Moi » (chacun choisit ensuite son nombre de séances
  // et ses kilomètres par semaine).
  DEFAULT_SESSIONS_TARGET: 3,

  // Sports pour lesquels on demande une distance (elle alimente l'objectif km)
  DISTANCE_SPORTS: ["Course", "Vélo", "Marche", "Natation"],

  // Sports proposés dans le formulaire (libre à toi de modifier)
  SPORTS: [
    { key: "Muscu",     emoji: "🏋️" },
    { key: "Course",    emoji: "🏃" },
    { key: "Vélo",      emoji: "🚴" },
    { key: "Natation",  emoji: "🏊" },
    { key: "Foot",      emoji: "⚽" },
    { key: "Basket",    emoji: "🏀" },
    { key: "Boxe",      emoji: "🥊" },
    { key: "Padel",     emoji: "🎾" },
    { key: "Marche",    emoji: "🥾" },
    { key: "Autre",     emoji: "🤸" },
  ],

  // Réactions disponibles sous chaque séance
  REACTIONS: ["💪", "🔥", "👏", "😤", "🐐"],
};

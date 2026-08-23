// =====================================================================
//  CONFIGURATION — c'est le SEUL fichier à remplir.
//  Voir docs/SETUP.md pour savoir où trouver ces valeurs (tout est gratuit).
// =====================================================================

export const CONFIG = {
  // Supabase > Project Settings > Data API  (et > API Keys pour la clé)
  SUPABASE_URL: "",       // ex: "https://abcdefghijkl.supabase.co"
  SUPABASE_ANON_KEY: "",  // la clé "anon / publishable" — elle est publique, c'est normal

  // Notifications push (facultatif au début, voir docs/SETUP.md étape 5)
  // Générer avec :  node tools/gen-vapid.mjs
  VAPID_PUBLIC_KEY: "",

  // ---- Réglages du groupe -------------------------------------------
  GROUP_NAME: "La Team",   // affiché en haut de l'app
  WEEKLY_GOAL: 4,          // objectif de séances par semaine et par personne
  TIMEZONE: "Europe/Paris",

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

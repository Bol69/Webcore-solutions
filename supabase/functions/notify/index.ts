// =====================================================================
//  Edge Function « notify »
//  Envoie une notification push aux autres membres du groupe quand
//  quelqu'un poste une séance.
//
//  Déploiement :  supabase functions deploy notify
//  Secrets requis : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//  (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement)
// =====================================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const SPORT_EMOJI: Record<string, string> = {
  Muscu: "🏋️", Course: "🏃", Vélo: "🚴", Natation: "🏊", Foot: "⚽",
  Basket: "🏀", Boxe: "🥊", Padel: "🎾", Marche: "🥾", Autre: "🤸",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:team@example.com";
  if (!publicKey || !privateKey) {
    return json({ skipped: "VAPID non configuré" }, 200);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const authHeader = req.headers.get("Authorization") ?? "";

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: {
    workout_id?: string;
    type?: string;
    results?: WeekResult[];
  } = {};
  try {
    body = await req.json();
  } catch { /* corps vide */ }

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // ---- Cas 3 : le cron des rappels -----------------------------------
  // Appelé par pg_cron avec la clé service_role, sans utilisateur connecté.
  if (body.type === "reminders") {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!sameSecret(token, service)) return json({ error: "non authentifié" }, 401);
    return await notifyReminders(admin);
  }

  // ---- Les autres cas exigent un membre connecté ----------------------
  if (!authHeader) return json({ error: "non authentifié" }, 401);

  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await asUser.auth.getUser();
  if (authErr || !user) return json({ error: "non authentifié" }, 401);

  // ---- Cas 2 : bilan de fin de semaine (gages tirés) -----------------
  if (body.type === "week") {
    return await notifyWeek(admin, body.results ?? []);
  }

  // ---- Cas 1 : quelqu'un vient de poster une séance ------------------
  const workoutId = body.workout_id;
  if (!workoutId) return json({ error: "workout_id manquant" }, 400);

  const { data: workout } = await admin
    .from("workouts")
    .select("id, user_id, sport, duration_min, distance_km, streak_at")
    .eq("id", workoutId)
    .single();

  if (!workout) return json({ error: "séance introuvable" }, 404);
  if (workout.user_id !== user.id) return json({ error: "interdit" }, 403);

  const { data: profile } = await admin
    .from("profiles").select("pseudo, emoji").eq("id", user.id).single();

  const pseudo = profile?.pseudo ?? "Un pote";
  const emoji = SPORT_EMOJI[workout.sport] ?? "🤸";
  const streak = workout.streak_at > 2 ? ` · série de ${workout.streak_at} jours 🔥` : "";
  const km = workout.distance_km ? ` · ${workout.distance_km} km` : "";

  const payload = JSON.stringify({
    title: `${pseudo} a fait sa séance ${emoji}`,
    body: `${workout.sport} · ${workout.duration_min} min${km}${streak}`,
    tag: `workout-${workout.id}`,
    url: "./",
  });

  // 3. Envoi à tout le monde sauf l'auteur
  return json(await push(admin, payload, { exclude: user.id }));
});

// =====================================================================
//  Bilan de fin de semaine : qui a tenu son contrat, qui écope d'un gage
// =====================================================================
type WeekResult = {
  user_id: string;
  pseudo?: string;
  success: boolean;
  forfeit_label?: string | null;
  sessions_done?: number;
  sessions_target?: number;
};

async function notifyWeek(admin: SupabaseAdmin, results: WeekResult[]) {
  const failed = results.filter((r) => !r.success);
  if (!failed.length) {
    if (!results.length) return json({ sent: 0 });
    return json(await push(admin, JSON.stringify({
      title: "Semaine bouclée 🏁",
      body: "Tout le monde a tenu son contrat. Aucun gage cette semaine.",
      tag: "week-result",
      url: "./",
    })));
  }

  const names = failed.map((r) => r.pseudo ?? "quelqu'un");
  const title = failed.length === 1
    ? `${names[0]} a raté sa semaine 🎲`
    : `${names.join(" et ")} ont raté leur semaine 🎲`;

  const body = failed.length === 1 && failed[0].forfeit_label
    ? `Gage : ${failed[0].forfeit_label}`
    : failed.map((r) => `${r.pseudo} : ${r.forfeit_label ?? "gage à définir"}`).join(" · ");

  return json(await push(admin, JSON.stringify({
    title, body, tag: "week-result", url: "./",
  })));
}

// =====================================================================
//  Rappels « pense à pointer »
//  Appelé chaque minute par le cron. La base décide qui est dû et
//  marque l'envoi au passage, donc jamais deux notifs pour un rappel.
// =====================================================================
async function notifyReminders(admin: SupabaseAdmin) {
  const { data, error } = await admin.rpc("take_due_reminders");
  if (error) return json({ error: error.message }, 500);

  const due = (data ?? []) as { r_user_id: string; r_pseudo: string }[];
  let sent = 0;

  for (const r of due) {
    const res = await push(admin, JSON.stringify({
      title: "C'est l'heure de ta séance 💪",
      body: `${r.r_pseudo}, pense à poster ta preuve pour tenir ton contrat.`,
      tag: "reminder",
      url: "./",
    }), { only: r.r_user_id });
    sent += res.sent;
  }

  return json({ reminders: due.length, sent });
}

/** Comparaison à temps constant : ne fuite pas la clé octet par octet */
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// =====================================================================
//  Envoi d'une notification à tous les abonnés (sauf exclusion)
// =====================================================================
type SupabaseAdmin = ReturnType<typeof createClient>;

async function push(
  admin: SupabaseAdmin,
  payload: string,
  opts: { exclude?: string; only?: string } = {},
) {
  let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (opts.exclude) query = query.neq("user_id", opts.exclude);
  if (opts.only) query = query.eq("user_id", opts.only);

  const { data: subs } = await query;
  if (!subs?.length) return { sent: 0, removed: 0 };

  const dead: string[] = [];
  let sent = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600, urgency: "normal" },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id); // abonnement expiré
      else console.error("push error", code, String(err));
    }
  }));

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length };
}

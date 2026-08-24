// =====================================================================
//  TeamSport — logique de l'application
// =====================================================================
import { CONFIG } from "./config.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------------------------------------------------------ *
 *  0. Config manquante ?
 * ------------------------------------------------------------------ */
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  $("#screen-setup").classList.remove("hidden");
  throw new Error("Configuration Supabase manquante (web/config.js)");
}

// Client Supabase embarqué dans le dépôt (aucun CDN : l'app marche hors-ligne)
const { createClient } = await import("./vendor/supabase.js");
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ------------------------------------------------------------------ *
 *  1. Petits utilitaires
 * ------------------------------------------------------------------ */
const TZ = CONFIG.TIMEZONE || "Europe/Paris";
const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }); // -> YYYY-MM-DD

const todayStr = () => dayFmt.format(new Date());
const dateFromStr = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const strFromDate = (dt) => dt.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const dt = dateFromStr(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return strFromDate(dt);
};
/** Lundi de la semaine de `s` */
const weekStart = (s) => {
  const dt = dateFromStr(s);
  const dow = (dt.getUTCDay() + 6) % 7; // lundi = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return strFromDate(dt);
};
const monthStart = (s) => s.slice(0, 8) + "01";

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  const j = Math.floor(diff / 86400);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} jours`;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", timeZone: TZ,
  }).format(new Date(iso));
}

const sportEmoji = (key) =>
  CONFIG.SPORTS.find((s) => s.key === key)?.emoji || "🤸";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

/** Série de jours consécutifs à partir d'un ensemble de dates (YYYY-MM-DD) */
function streakOf(daySet) {
  const t = todayStr();
  let cursor = daySet.has(t) ? t : addDays(t, -1);
  if (!daySet.has(cursor)) return 0;
  let n = 0;
  while (daySet.has(cursor) && n < 400) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/* ------------------------------------------------------------------ *
 *  2. État
 * ------------------------------------------------------------------ */
const state = {
  user: null,
  profile: null,
  profiles: new Map(),   // id -> profil
  workouts: [],          // les plus récentes d'abord
  reactions: [],
  goals: new Map(),      // user_id -> { sessions_target, km_target }
  longGoals: new Map(),  // user_id -> objectif long terme
  measurements: [],      // relevés de tout le groupe
  forfeits: [],          // la liste de gages partagée
  wheelSpins: [],        // les tirages de roue (candidats de la semaine)
  wheelReady: true,      // false tant que schema.sql n'a pas été relancé
  weekResults: [],       // bilans hebdo figés (les plus récents d'abord)
  period: "week",
  tab: "feed",
  tableWeek: null,       // null = semaine en cours, sinon un lundi (YYYY-MM-DD)
  draft: { sport: CONFIG.SPORTS[0].key, duration: 45, distance: "", photo: null },
};
const signedUrls = new Map(); // photo_path -> { url, exp }

/* ------------------------------------------------------------------ *
 *  3. Authentification
 * ------------------------------------------------------------------ */
const AVATARS = ["💪","🔥","🐐","🦍","🐺","🦊","🐻","🦁","🐯","🚀","😤","🥷","👑","🍀"];
let authMode = "login";
let chosenEmoji = AVATARS[0];

function buildEmojiPicker(container, current, onPick) {
  container.innerHTML = "";
  AVATARS.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-opt" + (e === current ? " sel" : "");
    b.textContent = e;
    b.onclick = () => {
      container.querySelectorAll(".emoji-opt").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      onPick(e);
    };
    container.appendChild(b);
  });
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $$(".signup-only").forEach((el) => el.classList.toggle("hidden", !signup));
  $("#auth-submit").textContent = signup ? "Créer mon compte" : "Se connecter";
  $("#auth-switch-label").textContent = signup ? "Déjà un compte ?" : "Pas encore de compte ?";
  $("#auth-switch").textContent = signup ? "Se connecter" : "Créer un compte";
  $("#f-password").autocomplete = signup ? "new-password" : "current-password";
  $("#auth-error").classList.add("hidden");
}

$("#auth-switch").onclick = () => setAuthMode(authMode === "login" ? "signup" : "login");

$("#auth-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = $("#auth-submit");
  const err = $("#auth-error");
  const email = $("#f-email").value.trim();
  const password = $("#f-password").value;
  const pseudo = $("#f-pseudo").value.trim();

  if (authMode === "signup" && !pseudo) {
    err.textContent = "Choisis un pseudo.";
    err.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  err.classList.add("hidden");
  const label = btn.textContent;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    if (authMode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { pseudo, emoji: chosenEmoji } },
      });
      if (error) throw error;
      if (!data.session) {
        err.textContent =
          "Compte créé. Confirme ton email puis reviens te connecter.";
        err.classList.remove("hidden");
        setAuthMode("login");
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) {
    const msg = String(e.message || e);
    err.textContent =
      /Invalid login/i.test(msg)      ? "Email ou mot de passe incorrect."
      : /already registered/i.test(msg) ? "Cet email a déjà un compte."
      : /signups not allowed|disabled/i.test(msg) ? "Les inscriptions sont fermées sur ce groupe."
      : msg;
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

$("#btn-logout").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

/* ------------------------------------------------------------------ *
 *  4. Chargement des données
 * ------------------------------------------------------------------ */
async function ensureProfile() {
  const { data } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  if (data) { state.profile = data; return; }
  // filet de sécurité si le trigger n'a pas tourné
  const meta = state.user.user_metadata || {};
  const { data: created } = await sb.from("profiles").insert({
    id: state.user.id,
    pseudo: meta.pseudo || state.user.email.split("@")[0],
    emoji: meta.emoji || "💪",
  }).select().single();
  state.profile = created;
}

async function loadAll() {
  const [profiles, workouts, reactions, goals, longGoals, measurements, forfeits, weeks, spins] =
    await Promise.all([
      sb.from("profiles").select("*"),
      sb.from("workouts").select("*").order("created_at", { ascending: false }).limit(300),
      sb.from("reactions").select("*"),
      sb.from("goals").select("*"),
      sb.from("long_goals").select("*"),
      sb.from("measurements").select("*").order("taken_on", { ascending: true }),
      sb.from("forfeits").select("*").order("created_at", { ascending: true }),
      sb.from("week_results").select("*").order("week_start", { ascending: false }).limit(60),
      sb.from("wheel_spins").select("*").order("spun_at", { ascending: true }).limit(60),
    ]);

  if (profiles.data) {
    state.profiles = new Map(profiles.data.map((p) => [p.id, p]));
    if (state.profiles.has(state.user.id)) state.profile = state.profiles.get(state.user.id);
  }
  state.workouts     = workouts.data || [];
  state.reactions    = reactions.data || [];
  state.goals        = new Map((goals.data || []).map((g) => [g.user_id, g]));
  state.longGoals    = new Map((longGoals.data || []).map((g) => [g.user_id, g]));
  state.measurements = measurements.data || [];
  state.forfeits     = forfeits.data || [];
  state.weekResults  = weeks.data || [];
  state.wheelSpins   = spins.data || [];
  // La table n'existe pas encore = schema.sql pas relancé depuis l'ajout de la roue
  state.wheelReady   = !spins.error;
  render();
}

/** Objectif hebdo de quelqu'un (valeurs par défaut s'il n'a rien réglé) */
function goalOf(userId) {
  const g = state.goals.get(userId);
  return {
    sessions_target: g ? g.sessions_target : CONFIG.DEFAULT_SESSIONS_TARGET,
    km_target: g ? Number(g.km_target) : 0,
  };
}

/** Ce qu'une personne a fait pendant la semaine commençant le lundi `ws` */
function weekProgress(userId, ws) {
  const end = addDays(ws, 6);
  const rows = state.workouts.filter(
    (w) => w.user_id === userId && w.done_on >= ws && w.done_on <= end);
  return {
    sessions: new Set(rows.map((w) => w.done_on)).size,
    km: rows.reduce((a, w) => a + Number(w.distance_km || 0), 0),
  };
}

/** URLs signées (bucket privé) — mises en cache 50 min */
async function signPhotos(paths) {
  const now = Date.now();
  const missing = paths.filter((p) => {
    const c = signedUrls.get(p);
    return !c || c.exp < now;
  });
  if (missing.length) {
    const { data } = await sb.storage.from("proofs").createSignedUrls(missing, 3600);
    (data || []).forEach((row) => {
      if (row.signedUrl) signedUrls.set(row.path, { url: row.signedUrl, exp: now + 50 * 60000 });
    });
  }
}

/* ------------------------------------------------------------------ *
 *  5. Rendu
 * ------------------------------------------------------------------ */
function render() {
  $("#group-name").textContent = CONFIG.GROUP_NAME;
  $("#my-emoji").textContent = state.profile?.emoji || "💪";
  const ws = weekStart(todayStr());
  $("#week-label").textContent =
    "Semaine du " +
    new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })
      .format(dateFromStr(ws));

  renderBanner();
  renderFeed();
  renderRanking();
  renderTable();
  renderGages();
  renderMe();
}

/* ---------- bandeau du jour ---------- */
function renderBanner() {
  const el = $("#today-banner");
  const t = todayStr();
  const mine = state.workouts.filter((w) => w.user_id === state.user.id && w.done_on === t);
  const others = state.workouts.filter((w) => w.user_id !== state.user.id && w.done_on === t);
  const names = [...new Set(others.map((w) => state.profiles.get(w.user_id)?.pseudo).filter(Boolean))];

  el.classList.remove("hidden", "done");
  if (mine.length) {
    el.classList.add("done");
    const g = goalOf(state.user.id);
    const prog = weekProgress(state.user.id, weekStart(t));
    const left = Math.max(0, g.sessions_target - prog.sessions);
    el.textContent = left
      ? `✅ Séance validée — encore ${left} séance${left > 1 ? "s" : ""} pour tenir ton contrat`
      : `✅ Séance validée — contrat de la semaine tenu 🎉`;
  } else if (names.length) {
    el.textContent = `👀 ${names.join(" et ")} ${names.length > 1 ? "ont" : "a"} déjà posté aujourd'hui. Et toi ?`;
  } else {
    el.textContent = "🔥 Personne n'a encore posté aujourd'hui. À toi de lancer la journée.";
  }
}

/* ---------- feed ---------- */
async function renderFeed() {
  const feed = $("#feed");
  if (!state.workouts.length) {
    feed.innerHTML = "";
    $("#feed-empty").classList.remove("hidden");
    return;
  }
  $("#feed-empty").classList.add("hidden");

  const shown = state.workouts.slice(0, 60);
  await signPhotos(shown.map((w) => w.photo_path).filter(Boolean));

  feed.innerHTML = shown.map((w) => {
    const p = state.profiles.get(w.user_id);
    const reacts = state.reactions.filter((r) => r.workout_id === w.id);
    const url = signedUrls.get(w.photo_path)?.url || "";

    const reactBtns = CONFIG.REACTIONS.map((e) => {
      const n = reacts.filter((r) => r.emoji === e).length;
      const mine = reacts.some((r) => r.emoji === e && r.user_id === state.user.id);
      return `<button class="react${mine ? " on" : ""}" data-react="${e}" data-w="${w.id}">${e}${
        n ? `<span class="react-count">${n}</span>` : ""
      }</button>`;
    }).join("");

    return `
      <article class="post">
        <div class="post-head">
          <div class="post-avatar">${esc(p?.emoji || "🙂")}</div>
          <div>
            <div class="post-who">${esc(p?.pseudo || "Inconnu")}</div>
            <div class="post-meta">${timeAgo(w.created_at)}</div>
          </div>
        </div>
        <img class="post-photo" src="${url}" alt="Preuve de séance" loading="lazy" data-full="${url}">
        <div class="post-tags">
          <span class="tag">${sportEmoji(w.sport)} ${esc(w.sport)}</span>
          <span class="tag">⏱ ${w.duration_min} min</span>
          ${w.distance_km ? `<span class="tag">📍 ${fmtKm(w.distance_km)} km</span>` : ""}
          ${w.streak_at > 1 ? `<span class="tag fire">🔥 ${w.streak_at} jours</span>` : ""}
        </div>
        ${w.note ? `<div class="post-note">${esc(w.note)}</div>` : ""}
        <div class="post-react">
          ${reactBtns}
          ${w.user_id === state.user.id ? `<button class="post-del" data-del="${w.id}">supprimer</button>` : ""}
        </div>
      </article>`;
  }).join("");
}

/* ---------- classement ---------- */
function periodFilter(w) {
  const t = todayStr();
  if (state.period === "week") return w.done_on >= weekStart(t);
  if (state.period === "month") return w.done_on >= monthStart(t);
  return true;
}

/** Où en est quelqu'un sur son contrat : 1 = tenu. Sert à départager. */
function contractRatio(sessions, target, km, kmTarget) {
  const a = target > 0 ? Math.min(1, sessions / target) : 1;
  if (!kmTarget) return a;
  return (a + Math.min(1, km / kmTarget)) / 2;
}

/** Une ligne de classement par personne, selon la période choisie */
function rankRows() {
  const t = todayStr();
  const ws = weekStart(t);

  return [...state.profiles.values()].map((p) => {
    // --- semaine en cours : on juge en direct
    if (state.period === "week") {
      const g = goalOf(p.id);
      const prog = weekProgress(p.id, ws);
      const held = prog.sessions >= g.sessions_target && prog.km >= g.km_target;
      const missing = Math.max(0, g.sessions_target - prog.sessions);
      const kmLeft = Math.max(0, g.km_target - prog.km);
      return {
        p, held,
        score: held ? 1 : 0,
        ratio: contractRatio(prog.sessions, g.sessions_target, prog.km, g.km_target),
        main: `${prog.sessions}/${g.sessions_target}`,
        unit: "séances",
        sub: held ? "contrat tenu 💪"
           : missing ? `il manque ${missing} séance${missing > 1 ? "s" : ""}`
           : `il manque ${fmtKm(kmLeft)} km`,
      };
    }

    // --- mois / total : on compte les semaines déjà clôturées
    const since = state.period === "month" ? monthStart(t) : null;
    const rows = state.weekResults.filter(
      (r) => r.user_id === p.id && (!since || r.week_start >= since));
    const ok = rows.filter((r) => r.success).length;
    const missed = rows.length - ok;
    return {
      p,
      held: rows.length > 0 && missed === 0,
      score: ok,
      ratio: rows.length ? ok / rows.length : 0,
      main: `${ok}/${rows.length}`,
      unit: rows.length > 1 ? "semaines" : "semaine",
      sub: !rows.length ? "rien de clôturé"
         : missed === 0 ? "sans faute 💪"
         : `${missed} ratée${missed > 1 ? "s" : ""}`,
    };
  }).sort((a, b) => b.score - a.score || b.ratio - a.ratio);
}

function renderRanking() {
  const rows = rankRows();

  // Ex æquo : même score = même place, et la place suivante s'enchaîne.
  // Deux qui tiennent leur contrat sont 1ers tous les deux, celui qui rate est 2e.
  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.score !== r.score || prev.ratio !== r.ratio) rank++;
    r.rank = rank;
  });

  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);

  $("#podium").innerHTML = rows.slice(0, 3).map((r) => `
    <div class="pod">
      <div class="pod-emoji">${esc(r.p.emoji)}</div>
      <div class="pod-name">${esc(r.p.pseudo)}</div>
      <div class="pod-bar${r.held ? " ok" : ""}"
           style="height:${28 + r.ratio * 84}px">${r.main}</div>
    </div>`).join("");

  $("#ranking").innerHTML = rows.map((r) => `
    <div class="rank-row${r.p.id === state.user.id ? " me" : ""}">
      <div class="rank-pos">${medal(r.rank)}</div>
      <div class="rank-emoji">${esc(r.p.emoji)}</div>
      <div>
        <div class="rank-name">${esc(r.p.pseudo)}</div>
        <div class="rank-sub">${esc(r.sub)}</div>
      </div>
      <div class="rank-score${r.held ? " ok" : ""}">${r.main}<span> ${r.unit}</span></div>
    </div>`).join("");
}

/* ---------- moi ---------- */
function renderMe() {
  const p = state.profile;
  if (!p) return;
  $("#me-emoji").textContent = p.emoji;
  $("#me-pseudo").textContent = p.pseudo;
  $("#me-email").textContent = state.user.email;

  const mine = state.workouts.filter((w) => w.user_id === state.user.id);
  $("#me-weeks").textContent = state.weekResults.filter(
    (r) => r.user_id === state.user.id && r.success).length;
  $("#me-count").textContent = mine.length;
  $("#me-streak").textContent = streakOf(new Set(mine.map((w) => w.done_on)));

  const ws = weekStart(todayStr());
  const prog = weekProgress(state.user.id, ws);
  const g = goalOf(state.user.id);
  const okSessions = prog.sessions >= g.sessions_target;
  const okKm = prog.km >= g.km_target;

  $("#goal-text").textContent = g.km_target
    ? `${prog.sessions}/${g.sessions_target} séances · ${fmtKm(prog.km)}/${fmtKm(g.km_target)} km`
    : `${prog.sessions} / ${g.sessions_target}`;

  const fill = $("#goal-fill");
  const pct = g.km_target
    ? (Math.min(1, prog.sessions / Math.max(1, g.sessions_target)) * 50) +
      (Math.min(1, prog.km / g.km_target) * 50)
    : Math.min(1, prog.sessions / Math.max(1, g.sessions_target)) * 100;
  fill.style.width = pct + "%";
  fill.classList.toggle("done", okSessions && okKm);

  renderGoalForm();
  renderLongGoal();
}

/* ================================================================== *
 *  5 bis. OBJECTIFS PERSONNELS & GAGES
 * ================================================================== */

const fmtKm = (n) =>
  Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const fmtVal = (n) =>
  Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const frDate = (s, opts = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(dateFromStr(s));

/** Jours restants dans la semaine en cours (aujourd'hui compris) */
function daysLeftInWeek() {
  const dow = (dateFromStr(todayStr()).getUTCDay() + 6) % 7; // 0 = lundi
  return 7 - dow;
}

function renderGages() {
  renderWheel();
  renderWeekStatus();
  renderPendingForfeits();
  renderForfeitList();
  renderHistory();

  const mine = state.weekResults.some(
    (r) => r.user_id === state.user.id && r.status === "pending");
  $("#gage-dot").classList.toggle("hidden", !mine);
}

/* ---------- la roue des gages ---------- *
 *  Ouverte le samedi et le dimanche. Chacun tourne une fois : ça donne
 *  jusqu'à 3 gages candidats. Lundi, celui qui a raté son contrat reçoit
 *  l'un de ces 3, tiré au hasard.
 *
 *  Le résultat est décidé par le serveur (spin_wheel), la roue ne fait
 *  que s'arrêter dessus : impossible de se choisir un gage tranquille.
 * --------------------------------------------------------------------- */
let wheelSig = "";     // liste actuellement dessinée
let wheelAngle = 0;    // rotation cumulée, toujours croissante
let wheelBusy = false;

/** La roue est-elle ouverte ? (samedi ou dimanche, heure du groupe) */
const wheelIsOpen = () => (dateFromStr(todayStr()).getUTCDay() + 6) % 7 >= 5;

const shortLabel = (s, n = 16) =>
  String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + "…" : String(s);

function drawWheel(items) {
  const sig = items.map((f) => f.id).join(",");
  if (sig === wheelSig) return;          // pas de redessin pendant qu'elle tourne
  wheelSig = sig;
  wheelAngle = 0;

  const host = $("#wheel-svg");
  if (!items.length) { host.innerHTML = ""; return; }

  const C = 110, R = 100, seg = 360 / items.length;
  const withText = seg >= 24;            // en dessous, les parts sont trop fines
  const pt = (a, r) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
  };

  // Deux teintes en alternance ; avec un nombre impair de parts, la dernière
  // en prend une troisième pour ne pas toucher la première.
  const TINTS = ["rgba(255,176,32,.16)", "rgba(255,95,46,.32)", "rgba(77,141,255,.22)"];
  const tintOf = (i) =>
    TINTS[items.length % 2 && i === items.length - 1 ? 2 : i % 2];

  // Les libellés se posent près du bord haut, puis tournent avec leur part.
  // On les coupe à la largeur d'arc réellement disponible, sinon deux parts
  // voisines se marchent dessus.
  const FS = 8.5, TR = R - 14, TY = C - TR;
  const arc = 2 * Math.PI * TR * (seg / 360);
  const maxChars = Math.max(4, Math.floor((arc - 8) / (FS * 0.54)));
  const parts = items.map((f, i) => {
    const a0 = i * seg, a1 = a0 + seg, mid = a0 + seg / 2;
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    const big = seg > 180 ? 1 : 0;
    const wedge = items.length === 1
      ? `<circle cx="${C}" cy="${C}" r="${R}" fill="${tintOf(i)}" stroke="#252c3a"/>`
      : `<path d="M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} Z"
               fill="${tintOf(i)}" stroke="#252c3a" stroke-width="1"/>`;
    // dans la moitié basse, on retourne le texte sur place pour qu'il reste lisible
    const flip = mid > 90 && mid < 270 ? ` rotate(180 ${C} ${TY})` : "";
    const text = withText
      ? `<text transform="rotate(${mid} ${C} ${C})${flip}" x="${C}" y="${TY}"
               text-anchor="middle" fill="#eef2f8" font-size="${FS}" font-weight="600"
               >${esc(shortLabel(f.label, maxChars))}</text>`
      : "";
    return wedge + text;
  }).join("");

  host.innerHTML = `
    <svg viewBox="0 0 220 220" role="img"
         aria-label="Roue des ${items.length} gages">
      <g id="wheel-rotor" class="wheel-rotor">${parts}</g>
      <circle cx="${C}" cy="${C}" r="19" fill="#171c26" stroke="#252c3a" stroke-width="2"/>
      <text x="${C}" y="${C + 6}" text-anchor="middle" font-size="16">🎲</text>
    </svg>`;
}

/** Amène la part `index` sous le repère du haut, avec au moins 5 tours */
function spinTo(index, count) {
  const rotor = $("#wheel-rotor");
  if (!rotor || !count) return Promise.resolve();

  const seg = 360 / count;
  const want = -(index * seg + seg / 2);        // position finale, modulo 360
  let next = wheelAngle + 360 * 5;
  next += (((want - next) % 360) + 360) % 360;  // on n'avance jamais à reculons
  wheelAngle = next;

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => {
    if (still) { rotor.style.transform = `rotate(${wheelAngle}deg)`; return resolve(); }
    const done = () => { rotor.removeEventListener("transitionend", done); resolve(); };
    rotor.addEventListener("transitionend", done);
    setTimeout(done, 5000);                     // filet de sécurité
    requestAnimationFrame(() => {
      rotor.style.transform = `rotate(${wheelAngle}deg)`;
    });
  });
}

function renderWheel() {
  const ws = weekStart(todayStr());
  const open = wheelIsOpen();
  const items = state.forfeits.filter((f) => f.active);
  const spins = state.wheelSpins.filter((s) => s.week_start === ws);
  const mine = spins.find((s) => s.user_id === state.user.id);

  drawWheel(items);

  const btn = $("#wheel-spin");
  const help = $("#wheel-help");
  $("#wheel-state").textContent = open ? "ouverte jusqu'à dimanche minuit"
                                       : "elle ouvre samedi";

  if (!state.wheelReady) {
    $("#wheel-state").textContent = "à activer";
    help.innerHTML =
      "La roue n'est pas encore activée sur la base. Dans <b>Supabase → SQL Editor</b>, " +
      "relance tout le fichier <code>supabase/schema.sql</code>, puis exécute " +
      "<code>notify pgrst, 'reload schema';</code>. Rien ne sera effacé.";
    btn.disabled = true;
    btn.textContent = "Roue pas encore activée";
  } else if (!items.length) {
    help.textContent = "Ajoutez d'abord des gages à la liste, juste en dessous.";
    btn.disabled = true;
    btn.textContent = "Tourner la roue";
  } else if (mine) {
    help.innerHTML = `Ton tirage de la semaine : <b>${esc(mine.forfeit_label)}</b>.`;
    btn.disabled = true;
    btn.textContent = "Tu as déjà tourné 🎲";
  } else if (open) {
    help.textContent =
      "Tourne ta roue : elle sort un gage candidat. Lundi, celui qui n'a pas " +
      "tenu son contrat récupère un des candidats du week-end.";
    btn.disabled = wheelBusy;
    btn.textContent = "Tourner la roue";
  } else {
    help.textContent =
      "La roue s'ouvre samedi matin et se ferme dimanche à minuit. " +
      "Chacun tire un candidat, et lundi le sort choisit parmi eux.";
    btn.disabled = true;
    btn.textContent = "Fermée jusqu'à samedi";
  }

  // les candidats déjà sortis cette semaine
  $("#wheel-pool").innerHTML = !spins.length ? "" : `
    <div class="wheel-pool-title">Les candidats de la semaine (${spins.length}/${
      state.profiles.size})</div>
    ${spins.map((s) => {
      const p = state.profiles.get(s.user_id);
      return `<div class="wheel-pool-row">
                <span class="wp-who">${esc(p?.emoji || "")} ${esc(p?.pseudo || "?")}</span>
                <span class="wp-lab">${esc(s.forfeit_label)}</span>
              </div>`;
    }).join("")}`;
}

$("#wheel-spin").onclick = async () => {
  const btn = $("#wheel-spin");
  const items = state.forfeits.filter((f) => f.active);
  if (!items.length || wheelBusy) return;

  wheelBusy = true;
  btn.disabled = true;
  btn.textContent = "Ça tourne…";
  try {
    const { data, error } = await sb.rpc("spin_wheel");
    if (error) throw error;

    const i = items.findIndex((f) => f.id === data.forfeit_id);
    await spinTo(i >= 0 ? i : 0, items.length);
    toast(`🎲 ${data.forfeit_label}`, 4500);
    await loadAll();
  } catch (e) {
    const msg = String(e.message || e);
    if (/schema cache|could not find the function/i.test(msg)) {
      state.wheelReady = false;
      toast("Roue pas encore activée : relance supabase/schema.sql dans Supabase.", 5000);
    } else {
      toast(/samedi/i.test(msg) ? "La roue n'ouvre que samedi et dimanche."
          : /vide/i.test(msg)   ? "La liste des gages est vide."
          : "Impossible de tourner la roue : " + msg, 4000);
    }
  } finally {
    wheelBusy = false;
    renderWheel();
  }
};

/* ---------- où en est chacun cette semaine ---------- */
function renderWeekStatus() {
  const ws = weekStart(todayStr());
  const left = daysLeftInWeek();
  $("#week-remaining").textContent =
    left === 1 ? "dernier jour" : `encore ${left} jours`;

  const rows = [...state.profiles.values()].map((p) => {
    const g = goalOf(p.id);
    const prog = weekProgress(p.id, ws);
    const missing = Math.max(0, g.sessions_target - prog.sessions);
    const ok = prog.sessions >= g.sessions_target && prog.km >= g.km_target;
    return { p, g, prog, missing, ok, atRisk: !ok && missing > left };
  }).sort((a, b) => Number(a.ok) - Number(b.ok));

  $("#week-status").innerHTML = rows.map((r) => {
    const sPct = Math.min(100, (r.prog.sessions / Math.max(1, r.g.sessions_target)) * 100);
    const kPct = r.g.km_target ? Math.min(100, (r.prog.km / r.g.km_target) * 100) : 0;
    const pill = r.ok
      ? '<span class="pill ok">tenu ✓</span>'
      : r.atRisk
        ? '<span class="pill risk">mal parti</span>'
        : '<span class="pill">en cours</span>';

    return `
      <div class="member-row">
        <div class="member-emoji">${esc(r.p.emoji)}</div>
        <div class="member-main">
          <div class="member-top">
            <span class="member-name">${esc(r.p.pseudo)}${
              r.p.id === state.user.id ? " <span class='muted'>(toi)</span>" : ""}</span>
            ${pill}
          </div>
          <div class="member-top" style="margin-top:3px">
            <span class="member-num">${r.prog.sessions}/${r.g.sessions_target} séances${
              r.g.km_target ? ` · ${fmtKm(r.prog.km)}/${fmtKm(r.g.km_target)} km` : ""}</span>
          </div>
          <div class="mini-bar"><div class="mini-fill${
            r.prog.sessions >= r.g.sessions_target ? " ok" : ""}" style="width:${sPct}%"></div></div>
          ${r.g.km_target ? `<div class="mini-bar"><div class="mini-fill${
            r.prog.km >= r.g.km_target ? " ok" : ""}" style="width:${kPct}%"></div></div>` : ""}
        </div>
      </div>`;
  }).join("");
}

/* ---------- gages en attente ---------- */
function renderPendingForfeits() {
  const pending = state.weekResults
    .filter((r) => r.status === "pending")
    .sort((a, b) => (a.user_id === state.user.id ? -1 : 1) - (b.user_id === state.user.id ? -1 : 1));

  $("#pending-forfeits").innerHTML = pending.map((r) => {
    const p = state.profiles.get(r.user_id);
    const isMine = r.user_id === state.user.id;
    const why = `${r.sessions_done}/${r.sessions_target} séances${
      Number(r.km_target) ? ` · ${fmtKm(r.km_done)}/${fmtKm(r.km_target)} km` : ""
    } · semaine du ${frDate(r.week_start)}`;

    return `
      <div class="forfeit-card${isMine ? "" : " other"}">
        <div class="forfeit-head">${
          isMine ? "🎲 Ton gage" : `🎲 Gage de ${esc(p?.pseudo || "?")}`}</div>
        <div class="forfeit-text">${esc(r.forfeit_label || "Gage à définir par le groupe")}</div>
        <div class="forfeit-why">${why}</div>
        ${isMine
          ? `<button class="btn primary block" data-forfeit-done="${r.week_start}">C'est fait ✅</button>`
          : ""}
      </div>`;
  }).join("");
}

$("#pending-forfeits").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-forfeit-done]");
  if (!btn) return;
  btn.disabled = true;
  const { error } = await sb.rpc("set_forfeit_done", {
    p_week: btn.dataset.forfeitDone, p_done: true,
  });
  if (error) { toast("Erreur : " + error.message); btn.disabled = false; return; }
  toast("Gage validé, l'ardoise est propre 🧽");
  await loadAll();
});

/* ---------- la liste de gages ---------- */
function renderForfeitList() {
  const active = state.forfeits.filter((f) => f.active);
  $("#forfeit-count").textContent = `${active.length} gage${active.length > 1 ? "s" : ""}`;

  $("#forfeit-list").innerHTML = active.length
    ? active.map((f) => `
        <div class="forfeit-item">
          <span>${esc(f.label)}</span>
          <button class="forfeit-del" data-del-forfeit="${f.id}" aria-label="Supprimer">✕</button>
        </div>`).join("")
    : `<p class="empty-mini">La liste est vide : ajoutes-en au moins un, sinon rater sa semaine ne coûte rien 😇</p>`;
}

$("#forfeit-list").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-del-forfeit]");
  if (!btn) return;
  const f = state.forfeits.find((x) => x.id === btn.dataset.delForfeit);
  if (!confirm(`Supprimer « ${f?.label} » de la liste ?`)) return;
  state.forfeits = state.forfeits.filter((x) => x.id !== btn.dataset.delForfeit);
  renderForfeitList();
  await sb.from("forfeits").delete().eq("id", btn.dataset.delForfeit);
});

$("#forfeit-add").onclick = async () => {
  const input = $("#forfeit-input");
  const label = input.value.trim();
  if (label.length < 2) return;
  input.value = "";
  const { error } = await sb.from("forfeits").insert({ label, created_by: state.user.id });
  if (error) { toast("Erreur : " + error.message); return; }
  await loadAll();
  toast("Gage ajouté 🎲");
};
$("#forfeit-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#forfeit-add").click();
});

/* ---------- historique des semaines ---------- */
function renderHistory() {
  const weeks = [...new Set(state.weekResults.map((r) => r.week_start))].slice(0, 6);
  if (!weeks.length) {
    $("#week-history").innerHTML =
      `<p class="empty-mini">Le premier bilan tombera lundi prochain. La semaine où vous démarrez est offerte.</p>`;
    return;
  }

  $("#week-history").innerHTML = weeks.map((ws) => {
    const rows = state.weekResults
      .filter((r) => r.week_start === ws)
      .sort((a, b) => Number(b.success) - Number(a.success));
    return `
      <div class="hist-week">Semaine du ${frDate(ws, { day: "numeric", month: "long" })}</div>
      ${rows.map((r) => {
        const p = state.profiles.get(r.user_id);
        const detail = r.success
          ? `${r.sessions_done}/${r.sessions_target} séances — contrat tenu`
          : r.status === "done"
            ? `gage fait : ${r.forfeit_label || "—"}`
            : `gage en attente : ${r.forfeit_label || "—"}`;
        return `
          <div class="hist-row">
            <span class="who">${esc(p?.emoji || "")} ${esc(p?.pseudo || "?")}</span>
            <span class="what">${esc(detail)}</span>
            <span>${r.success ? "✅" : r.status === "done" ? "🫡" : "🎲"}</span>
          </div>`;
      }).join("")}`;
  }).join("");
}

/* ---------- tableau des séances ---------- *
 *  Une grille : une ligne par personne, une colonne par jour de la semaine.
 *  Les flèches permettent de remonter les semaines passées.
 * --------------------------------------------------------------------- */
const DOW_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

function renderTable() {
  const current = weekStart(todayStr());
  const ws = state.tableWeek || current;
  const t = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  $("#table-week-label").textContent =
    ws === current ? "Cette semaine"
                   : "Semaine du " + frDate(ws, { day: "numeric", month: "long" });
  $("#table-next").disabled = ws >= current;

  // moi en premier, puis les autres par ordre alphabétique
  const people = [...state.profiles.values()].sort((a, b) =>
    a.id === state.user.id ? -1
    : b.id === state.user.id ? 1
    : String(a.pseudo || "").localeCompare(String(b.pseudo || "")));

  const head =
    `<div class="tg-cell tg-corner"></div>` +
    days.map((d, i) => `
      <div class="tg-cell tg-head${d === t ? " today" : ""}">
        <span class="tg-dow">${DOW_SHORT[i]}</span>
        <span class="tg-num">${Number(d.slice(8, 10))}</span>
      </div>`).join("");

  const body = people.map((p) => {
    const g = goalOf(p.id);
    const prog = weekProgress(p.id, ws);
    const held = prog.sessions >= g.sessions_target &&
                 (!g.km_target || prog.km >= g.km_target);

    const cells = days.map((d) => {
      const done = state.workouts.filter((w) => w.user_id === p.id && w.done_on === d);
      const marks = (d === t ? " today" : "") + (d > t ? " future" : "");
      if (!done.length) return `<div class="tg-cell tg-day${marks}"></div>`;

      const detail = done.map((w) =>
        `${w.sport} ${w.duration_min} min` +
        (w.distance_km ? ` · ${fmtKm(w.distance_km)} km` : "")).join(" + ");
      const when = frDate(d, { weekday: "long", day: "numeric", month: "long" });
      return `
        <button type="button" class="tg-cell tg-day on${marks}"
                data-detail="${esc(`${p.pseudo || "?"} — ${when} : ${detail}`)}">
          <span class="tg-emoji">${sportEmoji(done[0].sport)}</span>
          ${done.length > 1 ? `<span class="tg-mult">${done.length}</span>` : ""}
        </button>`;
    }).join("");

    return `
      <div class="tg-cell tg-name" title="${esc(p.pseudo || "?")}">
        <span class="tg-av">${esc(p.emoji || "💪")}</span>
        <span class="tg-score${held ? " ok" : ""}">${prog.sessions}/${g.sessions_target}</span>
      </div>${cells}`;
  }).join("");

  $("#table-grid").innerHTML = head + body;

  // --- le détail, jour par jour
  const end = addDays(ws, 6);
  const rows = state.workouts
    .filter((w) => w.done_on >= ws && w.done_on <= end)
    .sort((a, b) =>
      b.done_on.localeCompare(a.done_on) ||
      String(b.created_at).localeCompare(String(a.created_at)));

  $("#table-count").textContent =
    rows.length ? `${rows.length} séance${rows.length > 1 ? "s" : ""}` : "";

  if (!rows.length) {
    $("#table-list").innerHTML =
      `<p class="empty-mini">Aucune séance cette semaine-là.</p>`;
    return;
  }

  let lastDay = "";
  $("#table-list").innerHTML = rows.map((w) => {
    const p = state.profiles.get(w.user_id);
    const dayHead = w.done_on === lastDay ? "" :
      `<div class="tl-day">${frDate(w.done_on, {
        weekday: "long", day: "numeric", month: "long" })}</div>`;
    lastDay = w.done_on;
    return dayHead + `
      <div class="tl-row">
        <span class="tl-who">${esc(p?.emoji || "")} ${esc(p?.pseudo || "?")}</span>
        <span class="tl-what">${sportEmoji(w.sport)} ${esc(w.sport)}${
          w.distance_km ? ` · ${fmtKm(w.distance_km)} km` : ""}</span>
        <span class="tl-dur">${w.duration_min} min</span>
      </div>`;
  }).join("");
}

$("#table-prev").onclick = () => {
  state.tableWeek = addDays(state.tableWeek || weekStart(todayStr()), -7);
  renderTable();
};
$("#table-next").onclick = () => {
  const next = addDays(state.tableWeek || weekStart(todayStr()), 7);
  state.tableWeek = next >= weekStart(todayStr()) ? null : next;
  renderTable();
};
$("#table-grid").addEventListener("click", (ev) => {
  const cell = ev.target.closest("[data-detail]");
  if (cell) toast(cell.dataset.detail, 3600);
});

/* ---------- réglage de mon contrat hebdo ---------- */
let goalChipsBuilt = false;
let goalDirty = false;   // ne pas écraser ce que la personne est en train de régler

function renderGoalForm() {
  if (!goalChipsBuilt) {
    $("#sessions-chips").innerHTML = [1, 2, 3, 4, 5, 6, 7].map(
      (n) => `<button type="button" class="chip" data-sessions="${n}">${n}</button>`).join("");
    goalChipsBuilt = true;
  }
  if (goalDirty) return;

  const g = goalOf(state.user.id);
  $$("#sessions-chips .chip").forEach((c) =>
    c.classList.toggle("sel", Number(c.dataset.sessions) === g.sessions_target));
  $("#km-target-input").value = g.km_target || 0;
}

$("#sessions-chips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-sessions]");
  if (!c) return;
  goalDirty = true;
  $$("#sessions-chips .chip").forEach((x) => x.classList.toggle("sel", x === c));
});
$("#km-target-input").addEventListener("input", () => { goalDirty = true; });

$("#save-goal").onclick = async () => {
  const sel = $("#sessions-chips .chip.sel");
  const sessions = sel ? Number(sel.dataset.sessions) : CONFIG.DEFAULT_SESSIONS_TARGET;
  const km = Math.max(0, Math.min(500, Number($("#km-target-input").value) || 0));
  const btn = $("#save-goal");
  btn.disabled = true;

  const { error } = await sb.from("goals").upsert({
    user_id: state.user.id, sessions_target: sessions, km_target: km, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  btn.disabled = false;
  if (error) { toast("Erreur : " + error.message); return; }
  goalDirty = false;
  toast(km ? `Contrat : ${sessions} séances + ${fmtKm(km)} km / semaine` : `Contrat : ${sessions} séances / semaine`);
  await loadAll();
};

/* ---------- objectif long terme ---------- */
function longGoalProgress(goal, current) {
  const span = Number(goal.target_value) - Number(goal.start_value);
  if (Math.abs(span) < 1e-9) return 100;
  const done = current - Number(goal.start_value);
  return Math.max(0, Math.min(100, (done / span) * 100));
}

function myMeasurements() {
  return state.measurements
    .filter((m) => m.user_id === state.user.id)
    .map((m) => ({ d: m.taken_on, v: Number(m.value) }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

function renderLongGoal() {
  const view = $("#long-goal-view");
  const goal = state.longGoals.get(state.user.id);
  const editing = !$("#long-goal-form").classList.contains("hidden");
  $("#edit-long-goal").textContent = goal ? "Modifier" : "Définir";
  if (editing) { view.innerHTML = ""; return; }

  if (!goal) {
    view.innerHTML = `<p class="empty-mini">Pas encore d'objectif long terme. Un poids à atteindre, un temps au 10&nbsp;km, un nombre de tractions… sur quelques mois ou un an.</p>`;
    return;
  }

  const pts = myMeasurements();
  const current = pts.length ? pts[pts.length - 1].v : Number(goal.start_value);
  const pct = longGoalProgress(goal, current);
  const delta = current - Number(goal.start_value);
  const remaining = Number(goal.target_value) - current;
  const goingDown = Number(goal.target_value) < Number(goal.start_value);
  const good = goingDown ? delta < 0 : delta > 0;

  let deadlineTxt = "";
  if (goal.deadline) {
    const days = Math.round(
      (dateFromStr(goal.deadline) - dateFromStr(todayStr())) / 86400000);
    deadlineTxt = days >= 0
      ? ` · échéance dans ${days > 60 ? Math.round(days / 30) + " mois" : days + " jours"}`
      : " · échéance dépassée";
  }

  view.innerHTML = `
    <div class="lg-hero">
      <span class="lg-value">${fmtVal(current)}</span>
      <span class="lg-unit">${esc(goal.unit)}</span>
    </div>
    <div class="lg-sub">
      ${esc(goal.title)} — cible ${fmtVal(goal.target_value)} ${esc(goal.unit)}${deadlineTxt}
    </div>
    <div class="goal-head">
      <span>${delta === 0 ? "Aucun changement pour l'instant"
        : `<span class="lg-delta${good ? "" : " up"}">${delta > 0 ? "+" : ""}${fmtVal(delta)} ${esc(goal.unit)}</span> depuis le départ`}</span>
      <span>${Math.round(pct)} %</span>
    </div>
    <div class="goal-bar"><div class="goal-fill${pct >= 100 ? " done" : ""}" style="width:${pct}%"></div></div>
    <div class="lg-sub" style="margin-top:8px">
      ${pct >= 100 ? "🎉 Objectif atteint." :
        `Il reste ${fmtVal(Math.abs(remaining))} ${esc(goal.unit)}.`}
    </div>

    <div class="chart-wrap" id="lg-chart"></div>

    <div class="measure-row">
      <input id="measure-input" type="number" step="0.1" inputmode="decimal"
             placeholder="Mesure du jour (${esc(goal.unit)})">
      <button id="measure-add" class="btn" type="button">Ajouter</button>
    </div>

    ${pts.length ? `
      <details class="data-table">
        <summary>Voir les ${pts.length} mesure${pts.length > 1 ? "s" : ""}</summary>
        <table>
          <thead><tr><th>Date</th><th>${esc(goal.unit)}</th></tr></thead>
          <tbody>${[...pts].reverse().map((m) => `
            <tr><td>${frDate(m.d, { day: "numeric", month: "short", year: "numeric" })}</td>
                <td>${fmtVal(m.v)}</td></tr>`).join("")}</tbody>
        </table>
      </details>` : ""}
  `;

  renderSparkline($("#lg-chart"), pts, {
    target: Number(goal.target_value),
    unit: goal.unit,
  });

  $("#measure-add").onclick = async () => {
    const input = $("#measure-input");
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) { toast("Entre une valeur valide."); return; }
    const { error } = await sb.from("measurements").upsert({
      user_id: state.user.id, taken_on: todayStr(), value,
    }, { onConflict: "user_id,taken_on" });
    if (error) { toast("Erreur : " + error.message); return; }
    input.value = "";
    toast("Mesure enregistrée 📈");
    await loadAll();
  };
}

/* ---------- formulaire de l'objectif long terme ---------- */
let lgKind = "poids";

function openLongGoalForm() {
  const g = state.longGoals.get(state.user.id);
  lgKind = g?.kind || "poids";
  $$("#long-goal-form [data-kind]").forEach((c) =>
    c.classList.toggle("sel", c.dataset.kind === lgKind));
  $("#lg-title").value    = g?.title || (lgKind === "poids" ? "Objectif poids" : "");
  $("#lg-start").value    = g?.start_value ?? "";
  $("#lg-target").value   = g?.target_value ?? "";
  $("#lg-unit").value     = g?.unit || "kg";
  $("#lg-deadline").value = g?.deadline || "";
  $("#lg-error").classList.add("hidden");
  $("#long-goal-form").classList.remove("hidden");
  $("#long-goal-view").innerHTML = "";
}

function closeLongGoalForm() {
  $("#long-goal-form").classList.add("hidden");
  renderLongGoal();
}

$("#edit-long-goal").onclick = () =>
  $("#long-goal-form").classList.contains("hidden") ? openLongGoalForm() : closeLongGoalForm();
$("#lg-cancel").onclick = closeLongGoalForm;

$("#long-goal-form").addEventListener("click", (e) => {
  const c = e.target.closest("[data-kind]");
  if (!c) return;
  lgKind = c.dataset.kind;
  $$("#long-goal-form [data-kind]").forEach((x) => x.classList.toggle("sel", x === c));
  if (lgKind === "poids") {
    $("#lg-unit").value = "kg";
    if (!$("#lg-title").value.trim()) $("#lg-title").value = "Objectif poids";
  }
});

$("#long-goal-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#lg-error");
  const title = $("#lg-title").value.trim();
  const start = Number($("#lg-start").value);
  const target = Number($("#lg-target").value);
  const unit = $("#lg-unit").value.trim() || "kg";
  const deadline = $("#lg-deadline").value || null;

  if (!title) { err.textContent = "Donne un intitulé à ton objectif."; err.classList.remove("hidden"); return; }
  if (!Number.isFinite(start) || !Number.isFinite(target)) {
    err.textContent = "Renseigne la valeur de départ et la cible.";
    err.classList.remove("hidden"); return;
  }
  if (start === target) {
    err.textContent = "Le départ et la cible doivent être différents.";
    err.classList.remove("hidden"); return;
  }

  const btn = $("#lg-save");
  btn.disabled = true;
  const { error } = await sb.from("long_goals").upsert({
    user_id: state.user.id, kind: lgKind, title,
    start_value: start, target_value: target, unit, deadline,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  btn.disabled = false;

  if (error) { err.textContent = error.message; err.classList.remove("hidden"); return; }
  $("#long-goal-form").classList.add("hidden");
  toast("Objectif enregistré 🎯");
  await loadAll();
});

/* ---------- courbe de suivi (une seule série, donc pas de légende) ---------- */
function renderSparkline(wrap, points, opts = {}) {
  if (!wrap) return;
  wrap.innerHTML = "";
  if (points.length < 2) {
    wrap.innerHTML =
      `<p class="empty-mini">Ajoute au moins deux mesures pour voir ta courbe.</p>`;
    return;
  }

  const W = Math.max(240, Math.round(wrap.clientWidth || 320));
  const H = 118;
  const PAD = { t: 14, r: 12, b: 22, l: 12 };
  const LINE = "#4d8dff";           // validé sur fond sombre (contraste ≥ 3:1)

  const vals = points.map((p) => p.v);
  const all = opts.target != null ? [...vals, opts.target] : vals;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;

  const X = (i) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${X(points.length - 1).toFixed(1)},${H - PAD.b} L${X(0).toFixed(1)},${H - PAD.b} Z`;
  const last = points[points.length - 1];

  const targetLine = opts.target != null && opts.target >= lo && opts.target <= hi
    ? `<line x1="${PAD.l}" y1="${Y(opts.target).toFixed(1)}" x2="${W - PAD.r}" y2="${Y(opts.target).toFixed(1)}"
             stroke="#8b94a7" stroke-width="1" stroke-dasharray="3 4" opacity=".7"></line>
       <text x="${W - PAD.r}" y="${(Y(opts.target) - 5).toFixed(1)}" text-anchor="end"
             fill="#8b94a7" font-size="10" font-weight="600">cible ${fmtVal(opts.target)}</text>`
    : "";

  wrap.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="Évolution de tes mesures, de ${fmtVal(points[0].v)} à ${fmtVal(last.v)} ${esc(opts.unit || "")}">
      <defs>
        <linearGradient id="lgfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${LINE}" stop-opacity=".26"></stop>
          <stop offset="100%" stop-color="${LINE}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${targetLine}
      <path d="${area}" fill="url(#lgfill)"></path>
      <path d="${line}" fill="none" stroke="${LINE}" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"></path>
      <line id="lg-cross" x1="0" y1="${PAD.t}" x2="0" y2="${H - PAD.b}"
            stroke="#8b94a7" stroke-width="1" opacity="0"></line>
      <circle id="lg-hover" r="4.5" fill="${LINE}" stroke="#171c26" stroke-width="2" opacity="0"></circle>
      <circle cx="${X(points.length - 1).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="4.5"
              fill="${LINE}" stroke="#171c26" stroke-width="2"></circle>
      <text x="${PAD.l}" y="${H - 6}" fill="#8b94a7" font-size="10">${frDate(points[0].d)}</text>
      <text x="${W - PAD.r}" y="${H - 6}" text-anchor="end" fill="#8b94a7" font-size="10">${frDate(last.d)}</text>
      <rect id="lg-hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"></rect>
    </svg>
    <div class="chart-tip" id="lg-tip"></div>`;

  // survol / toucher : point le plus proche
  const svg = wrap.querySelector("svg");
  const tip = wrap.querySelector("#lg-tip");
  const cross = wrap.querySelector("#lg-cross");
  const dot = wrap.querySelector("#lg-hover");
  const scale = () => (wrap.clientWidth || W) / W;

  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / (rect.width / W);
    const ratio = (x - PAD.l) / (W - PAD.l - PAD.r);
    const i = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    const p = points[i];
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
    cross.setAttribute("opacity", ".45");
    dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(p.v));
    dot.setAttribute("opacity", "1");
    tip.innerHTML = `<span class="tip-date">${frDate(p.d, {
      day: "numeric", month: "short", year: "numeric" })}</span>${fmtVal(p.v)} ${esc(opts.unit || "")}`;
    tip.style.left = X(i) * scale() + "px";
    tip.style.top = (Y(p.v) * scale() - 8) + "px";
    tip.classList.add("on");
  };
  const leave = () => {
    tip.classList.remove("on");
    cross.setAttribute("opacity", "0");
    dot.setAttribute("opacity", "0");
  };

  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", leave);
  svg.addEventListener("pointercancel", leave);
}

/* ------------------------------------------------------------------ *
 *  6. Interactions du feed (réactions, suppression, photo plein écran)
 * ------------------------------------------------------------------ */
$("#feed").addEventListener("click", async (ev) => {
  const react = ev.target.closest("[data-react]");
  if (react) {
    const emoji = react.dataset.react;
    const wid = react.dataset.w;
    const existing = state.reactions.find(
      (r) => r.workout_id === wid && r.user_id === state.user.id);

    if (existing && existing.emoji === emoji) {
      state.reactions = state.reactions.filter((r) => r !== existing);
      renderFeed();
      await sb.from("reactions").delete().match({ workout_id: wid, user_id: state.user.id });
    } else {
      state.reactions = state.reactions.filter((r) => r !== existing);
      state.reactions.push({ workout_id: wid, user_id: state.user.id, emoji });
      renderFeed();
      await sb.from("reactions").upsert(
        { workout_id: wid, user_id: state.user.id, emoji },
        { onConflict: "workout_id,user_id" });
    }
    return;
  }

  const del = ev.target.closest("[data-del]");
  if (del) {
    if (!confirm("Supprimer cette séance ?")) return;
    const w = state.workouts.find((x) => x.id === del.dataset.del);
    await sb.from("workouts").delete().eq("id", del.dataset.del);
    if (w?.photo_path) await sb.storage.from("proofs").remove([w.photo_path]);
    state.workouts = state.workouts.filter((x) => x.id !== del.dataset.del);
    render();
    return;
  }

  const photo = ev.target.closest(".post-photo");
  if (photo && photo.dataset.full) {
    $("#lightbox-img").src = photo.dataset.full;
    $("#lightbox").classList.remove("hidden");
  }
});
$("#lightbox").onclick = () => $("#lightbox").classList.add("hidden");

/* ------------------------------------------------------------------ *
 *  7. Onglets
 * ------------------------------------------------------------------ */
$$(".tab").forEach((t) => {
  t.onclick = () => {
    state.tab = t.dataset.tab;
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".tabpane").forEach((p) => p.classList.add("hidden"));
    $("#tab-" + state.tab).classList.remove("hidden");
    $("#fab").classList.toggle("hidden", state.tab === "me");
    // la courbe a besoin de la largeur réelle : on la redessine une fois visible
    if (state.tab === "me") renderLongGoal();
    window.scrollTo({ top: 0 });
  };
});
$("#btn-me").onclick = () => $('.tab[data-tab="me"]').click();

$$("#rank-period .seg").forEach((s) => {
  s.onclick = () => {
    state.period = s.dataset.period;
    $$("#rank-period .seg").forEach((x) => x.classList.toggle("active", x === s));
    renderRanking();
  };
});

/* ------------------------------------------------------------------ *
 *  8. Nouvelle séance
 * ------------------------------------------------------------------ */
function buildModal() {
  $("#sport-chips").innerHTML = CONFIG.SPORTS.map(
    (s) => `<button type="button" class="chip${
      s.key === state.draft.sport ? " sel" : ""}" data-sport="${esc(s.key)}">${s.emoji} ${esc(s.key)}</button>`
  ).join("");

  $("#duration-chips").innerHTML = [30, 45, 60, 90].map(
    (d) => `<button type="button" class="chip${
      d === state.draft.duration ? " sel" : ""}" data-dur="${d}">${d} min</button>`
  ).join("");
}

/** Le champ distance n'apparaît que pour les sports où ça a du sens. */
function syncDistanceField() {
  const on = (CONFIG.DISTANCE_SPORTS || []).includes(state.draft.sport);
  $("#distance-block").classList.toggle("hidden", !on);
  if (!on) { state.draft.distance = ""; $("#distance-input").value = ""; }
}

$("#sport-chips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-sport]");
  if (!c) return;
  state.draft.sport = c.dataset.sport;
  $$("#sport-chips .chip").forEach((x) => x.classList.toggle("sel", x === c));
  syncDistanceField();
});

$("#duration-chips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-dur]");
  if (!c) return;
  state.draft.duration = Number(c.dataset.dur);
  $("#duration-input").value = state.draft.duration;
  $$("#duration-chips .chip").forEach((x) => x.classList.toggle("sel", x === c));
});

$("#duration-input").addEventListener("input", (e) => {
  state.draft.duration = Number(e.target.value) || 0;
  $$("#duration-chips .chip").forEach((x) =>
    x.classList.toggle("sel", Number(x.dataset.dur) === state.draft.duration));
});

$("#fab").onclick = () => {
  buildModal();
  syncDistanceField();
  $("#modal").classList.remove("hidden");
};
$("#modal-close").onclick = closeModal;
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal-error").classList.add("hidden");
}

/** Réduit la photo pour ne pas exploser le quota gratuit (1 Go). */
async function compress(file, maxSide = 1280, quality = 0.75) {
  // imageOrientation : sinon les photos prises en portrait ressortent couchées
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    state.draft.photo = await compress(file);
    const img = $("#photo-preview");
    img.src = URL.createObjectURL(state.draft.photo);
    img.classList.remove("hidden");
    $("#photo-placeholder").classList.add("hidden");
  } catch {
    $("#modal-error").textContent = "Impossible de lire cette image.";
    $("#modal-error").classList.remove("hidden");
  }
});

$("#submit-workout").onclick = async () => {
  const err = $("#modal-error");
  const btn = $("#submit-workout");
  const duration = Number($("#duration-input").value);
  const wantsDistance = (CONFIG.DISTANCE_SPORTS || []).includes(state.draft.sport);
  const rawKm = Number(String($("#distance-input").value).replace(",", "."));
  const distance = wantsDistance && Number.isFinite(rawKm) && rawKm > 0
    ? Math.min(500, Math.round(rawKm * 100) / 100)
    : null;

  if (!state.draft.photo) {
    err.textContent = "Il faut une photo : c'est la preuve 😄";
    err.classList.remove("hidden");
    return;
  }
  if (!(duration >= 5 && duration <= 600)) {
    err.textContent = "La durée doit être entre 5 et 600 minutes.";
    err.classList.remove("hidden");
    return;
  }

  err.classList.add("hidden");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Envoi…';

  try {
    const path = `${state.user.id}/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from("proofs").upload(path, state.draft.photo, {
      contentType: "image/jpeg", upsert: false,
    });
    if (up.error) throw up.error;

    const ins = await sb.from("workouts").insert({
      user_id: state.user.id,
      sport: state.draft.sport,
      duration_min: duration,
      note: $("#note-input").value.trim() || null,
      photo_path: path,
      distance_km: distance,
    }).select().single();
    if (ins.error) throw ins.error;

    // notification aux potes (silencieuse si les push ne sont pas configurés)
    sb.functions.invoke("notify", { body: { workout_id: ins.data.id } }).catch(() => {});

    resetDraft();
    closeModal();
    toast("Séance validée 🔥");
    await loadAll();
    $('.tab[data-tab="feed"]').click();
  } catch (e) {
    err.textContent = "Échec de l'envoi : " + (e.message || e);
    err.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Valider ma séance";
  }
};

function resetDraft() {
  state.draft = { sport: CONFIG.SPORTS[0].key, duration: 45, distance: "", photo: null };
  $("#distance-input").value = "";
  $("#photo-input").value = "";
  $("#photo-preview").classList.add("hidden");
  $("#photo-preview").removeAttribute("src");
  $("#photo-placeholder").classList.remove("hidden");
  $("#note-input").value = "";
  $("#duration-input").value = 45;
}

/* ------------------------------------------------------------------ *
 *  9. Temps réel
 * ------------------------------------------------------------------ */
function subscribeRealtime() {
  sb.channel("teamsport")
    .on("postgres_changes", { event: "*", schema: "public", table: "workouts" }, async (payload) => {
      await loadAll();
      if (payload.eventType === "INSERT" && payload.new.user_id !== state.user.id) {
        const who = state.profiles.get(payload.new.user_id)?.pseudo || "Un pote";
        toast(`${who} vient de poster sa séance 💪`);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, async () => {
      const { data } = await sb.from("reactions").select("*");
      state.reactions = data || [];
      renderFeed();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, () => loadAll())
    .on("postgres_changes", { event: "*", schema: "public", table: "forfeits" }, () => loadAll())
    .on("postgres_changes", { event: "*", schema: "public", table: "week_results" }, async (payload) => {
      await loadAll();
      if (payload.eventType === "INSERT" &&
          payload.new.user_id === state.user.id && !payload.new.success) {
        toast("Semaine ratée… un gage t'attend 🎲");
      }
    })
    .subscribe();
}

/* ------------------------------------------------------------------ *
 *  9 bis. Clôture des semaines terminées
 *
 *  Le serveur calcule les bilans et tire les gages. C'est idempotent :
 *  peu importe qui ouvre l'app en premier, le résultat est le même.
 * ------------------------------------------------------------------ */
async function settleWeeks() {
  const { data, error } = await sb.rpc("settle_pending_weeks");
  if (error) {
    // schéma pas encore à jour : on n'embête pas l'utilisateur avec ça
    console.warn("clôture impossible :", error.message);
    return 0;
  }
  const created = Number(data?.created || 0);
  if (created) {
    // prévient les autres (l'edge function ignore l'appel si les push
    // ne sont pas configurés)
    sb.functions.invoke("notify", {
      body: { type: "week", results: data.results },
    }).catch(() => {});
  }
  return created;
}

/* ------------------------------------------------------------------ *
 *  10. Notifications push
 * ------------------------------------------------------------------ */
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function refreshPushUI() {
  const btn = $("#btn-push");
  const status = $("#push-status");
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!CONFIG.VAPID_PUBLIC_KEY) {
    btn.classList.add("hidden");
    status.textContent = "Push non configurés (voir docs/SETUP.md, étape 5). Le feed se met quand même à jour en direct.";
    return;
  }
  if (!supported || (isIOS && !standalone)) {
    btn.classList.add("hidden");
    status.textContent = isIOS
      ? "Sur iPhone : « Partager » → « Sur l'écran d'accueil », puis rouvre l'app depuis l'icône pour activer les notifications."
      : "Ton navigateur ne gère pas les notifications push.";
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === "granted") {
    btn.textContent = "Désactiver les notifications";
    status.textContent = "Notifications actives ✅";
    btn.onclick = async () => {
      await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
      refreshPushUI();
    };
  } else {
    btn.textContent = "Activer les notifications";
    status.textContent = Notification.permission === "denied"
      ? "Notifications bloquées dans les réglages du navigateur."
      : "";
    btn.onclick = enablePush;
  }
  btn.classList.remove("hidden");
}

async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return refreshPushUI();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
    });
    const j = sub.toJSON();
    await sb.from("push_subscriptions").upsert({
      user_id: state.user.id,
      endpoint: sub.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
    }, { onConflict: "endpoint" });
    toast("Notifications activées 🔔");
  } catch (e) {
    toast("Échec : " + (e.message || e));
  }
  refreshPushUI();
}

/* ------------------------------------------------------------------ *
 *  11. Démarrage
 * ------------------------------------------------------------------ */
buildEmojiPicker($("#emoji-picker"), chosenEmoji, (e) => (chosenEmoji = e));
setAuthMode("login");

async function start(session) {
  if (!session) {
    $("#screen-app").classList.add("hidden");
    $("#screen-auth").classList.remove("hidden");
    return;
  }
  state.user = session.user;
  $("#screen-auth").classList.add("hidden");
  $("#screen-app").classList.remove("hidden");

  await ensureProfile();
  buildEmojiPicker($("#me-emoji-picker"), state.profile.emoji, async (e) => {
    await sb.from("profiles").update({ emoji: e }).eq("id", state.user.id);
    state.profile.emoji = e;
    render();
  });

  await settleWeeks();   // clôture les semaines terminées avant d'afficher
  await loadAll();
  subscribeRealtime();
  refreshPushUI();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

const { data: { session } } = await sb.auth.getSession();
await start(session);

sb.auth.onAuthStateChange((event, s) => {
  if (event === "SIGNED_IN" && !state.user) start(s);
  if (event === "SIGNED_OUT") location.reload();
});

// Rafraîchit quand on revient dans l'app
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !state.user) return;
  await settleWeeks();     // au cas où on passe un lundi avec l'app ouverte
  await loadAll();
});

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
  period: "week",
  tab: "feed",
  draft: { sport: CONFIG.SPORTS[0].key, duration: 45, photo: null },
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
  const [profiles, workouts, reactions] = await Promise.all([
    sb.from("profiles").select("*"),
    sb.from("workouts").select("*").order("created_at", { ascending: false }).limit(300),
    sb.from("reactions").select("*"),
  ]);
  if (profiles.data) {
    state.profiles = new Map(profiles.data.map((p) => [p.id, p]));
    if (state.profiles.has(state.user.id)) state.profile = state.profiles.get(state.user.id);
  }
  state.workouts = workouts.data || [];
  state.reactions = reactions.data || [];
  render();
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
    const pts = mine.reduce((a, w) => a + w.points, 0);
    el.textContent = `✅ Séance validée aujourd'hui · +${pts} pts`;
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
          <div class="post-pts${w.points ? "" : " zero"}">${w.points ? "+" + w.points : "0"} pts</div>
        </div>
        <img class="post-photo" src="${url}" alt="Preuve de séance" loading="lazy" data-full="${url}">
        <div class="post-tags">
          <span class="tag">${sportEmoji(w.sport)} ${esc(w.sport)}</span>
          <span class="tag">⏱ ${w.duration_min} min</span>
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

function renderRanking() {
  const rows = [...state.profiles.values()].map((p) => {
    const mine = state.workouts.filter((w) => w.user_id === p.id);
    const inPeriod = mine.filter(periodFilter);
    return {
      p,
      pts: inPeriod.reduce((a, w) => a + w.points, 0),
      count: inPeriod.length,
      minutes: inPeriod.reduce((a, w) => a + w.duration_min, 0),
      streak: streakOf(new Set(mine.map((w) => w.done_on))),
    };
  }).sort((a, b) => b.pts - a.pts || b.count - a.count);

  const max = Math.max(1, ...rows.map((r) => r.pts));
  $("#podium").innerHTML = rows.slice(0, 3).map((r) => `
    <div class="pod">
      <div class="pod-emoji">${esc(r.p.emoji)}</div>
      <div class="pod-name">${esc(r.p.pseudo)}</div>
      <div class="pod-bar" style="height:${28 + (r.pts / max) * 84}px">${r.pts}</div>
    </div>`).join("");

  $("#ranking").innerHTML = rows.map((r, i) => `
    <div class="rank-row${r.p.id === state.user.id ? " me" : ""}">
      <div class="rank-pos">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
      <div class="rank-emoji">${esc(r.p.emoji)}</div>
      <div>
        <div class="rank-name">${esc(r.p.pseudo)}</div>
        <div class="rank-sub">${r.count} séance${r.count > 1 ? "s" : ""} · ${r.minutes} min${
          r.streak > 1 ? ` · 🔥 ${r.streak} j` : ""}</div>
      </div>
      <div class="rank-pts">${r.pts}<span> pts</span></div>
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
  $("#me-total").textContent = mine.reduce((a, w) => a + w.points, 0);
  $("#me-count").textContent = mine.length;
  $("#me-streak").textContent = streakOf(new Set(mine.map((w) => w.done_on)));

  const ws = weekStart(todayStr());
  const week = new Set(mine.filter((w) => w.done_on >= ws).map((w) => w.done_on)).size;
  const goal = CONFIG.WEEKLY_GOAL;
  $("#goal-text").textContent = `${week} / ${goal}`;
  const fill = $("#goal-fill");
  fill.style.width = Math.min(100, (week / goal) * 100) + "%";
  fill.classList.toggle("done", week >= goal);
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

$("#sport-chips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-sport]");
  if (!c) return;
  state.draft.sport = c.dataset.sport;
  $$("#sport-chips .chip").forEach((x) => x.classList.toggle("sel", x === c));
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
    }).select().single();
    if (ins.error) throw ins.error;

    // notification aux potes (silencieuse si les push ne sont pas configurés)
    sb.functions.invoke("notify", { body: { workout_id: ins.data.id } }).catch(() => {});

    resetDraft();
    closeModal();
    toast(ins.data.points ? `Séance validée · +${ins.data.points} pts 🔥` : "Séance ajoutée (0 pt aujourd'hui)");
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
  state.draft = { sport: CONFIG.SPORTS[0].key, duration: 45, photo: null };
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
    .subscribe();
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
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.user) loadAll();
});

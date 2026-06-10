/* ============================================================
   CONFIG / MODE
   ============================================================ */

const CFG = window.GAME_LIBRARY_CONFIG || {};
const SUPABASE_READY =
  !!CFG.SUPABASE_URL && !!CFG.SUPABASE_ANON_KEY &&
  !CFG.SUPABASE_URL.includes("YOUR_") &&
  !CFG.SUPABASE_ANON_KEY.includes("YOUR_");

const MODE = SUPABASE_READY ? "supabase" : "local";

let sb = null;
if (MODE === "supabase" && window.supabase) {
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
}

let allGames = [];
let session = null;     // supabase session (null = signed out)
let dirty = false;      // local mode: unsaved edits waiting to download

let state = { search: "", platforms: [], flags: [], sort: "none" };

// In local mode the page is your own machine, so you are always the owner.
// In supabase mode you are the owner only while signed in.
function isOwner() { return MODE === "local" ? true : !!session; }

/* ============================================================
   LABELS / HELPERS
   ============================================================ */

const PLATFORM_LABEL = { pc: "PC", ps3: "PS3", ps4: "PS4", ps5: "PS5" };
const STORE_LABEL    = { steam: "Steam", epic: "Epic", ps_store: "PS Store" };

function platformLabel(p) { return PLATFORM_LABEL[p] || p.toUpperCase(); }
function isPlayStation(p) { return p.startsWith("ps"); }

function copyLabel(c) {
  let txt = platformLabel(c.platform);
  if (c.type === "physical") txt += " · Disc";
  else if (c.store) txt += " · " + (STORE_LABEL[c.store] || c.store);
  return txt;
}

function slugify(name) {
  return (name || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Split a textarea into a clean list (one item per line, blanks removed)
function parseLines(value) {
  return (value || "").split("\n").map(s => s.trim()).filter(Boolean);
}

// Self-contained cover placeholder (no external service, works offline)
function placeholderFor(name) {
  const letter = ((name || "?").trim()[0] || "?").toUpperCase();
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>" +
        "<stop offset='0' stop-color='#1f2233'/>" +
        "<stop offset='1' stop-color='#14151f'/>" +
      "</linearGradient></defs>" +
      "<rect width='400' height='600' fill='url(#g)'/>" +
      "<text x='50%' y='50%' font-family='Inter,sans-serif' font-size='180' " +
        "font-weight='700' fill='#343a52' text-anchor='middle' " +
        "dominant-baseline='central'>" + letter + "</text>" +
    "</svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ============================================================
   FILTERING
   ============================================================ */

function matchesPlatform(game, selected) {
  if (selected.length === 0) return true;
  return game.copies?.some(c =>
    selected.some(p => (p === "ps" ? isPlayStation(c.platform) : c.platform === p))
  );
}

function matchesFlags(game, flags) {
  return flags.every(f => game[f] === true);
}

function setLibraryCounts(games) {
  let pc = 0, ps = 0;
  const platformSet = new Set();
  games.forEach(g => {
    const platforms = g.copies?.map(c => c.platform) || [];
    platforms.forEach(p => platformSet.add(p));
    if (platforms.includes("pc")) pc++;
    if (platforms.some(isPlayStation)) ps++;
  });
  document.getElementById("count-pc").innerText = pc;
  document.getElementById("count-ps").innerText = ps;
  document.getElementById("collectionStat").innerText =
    `${games.length} games · ${platformSet.size} platforms`;
}

function applyFilters() {
  let games = [...allGames];

  if (state.search) {
    games = games.filter(g => (g.name || "").toLowerCase().includes(state.search));
  }
  games = games.filter(g => matchesPlatform(g, state.platforms));
  games = games.filter(g => matchesFlags(g, state.flags));

  if (state.sort === "name_asc")  games.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === "name_desc") games.sort((a, b) => b.name.localeCompare(a.name));

  render(games);
}

/* ============================================================
   STATS PANEL
   ============================================================ */

const anyCopy = (g, f) => (g.copies || []).some(f);
const gamesWith = pred => allGames.filter(pred).length;

function renderStats() {
  const tiles = [
    { num: allGames.length, label: "Total" },
    { num: gamesWith(g => anyCopy(g, c => c.platform === "pc")), label: "PC", dot: "dot-pc" },
    { num: gamesWith(g => anyCopy(g, c => isPlayStation(c.platform))), label: "PlayStation", dot: "dot-ps" },
    { num: gamesWith(g => anyCopy(g, c => c.type === "physical")), label: "On disc" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "steam")), label: "Steam" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "epic")), label: "Epic" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "ps_store")), label: "PS Store" },
    { num: gamesWith(g => g.favorite === true), label: "Favorites", cls: "gold" },
    { num: gamesWith(g => g.played === true), label: "Played", cls: "accent" }
  ];

  const el = document.getElementById("stats");
  el.innerHTML = "";
  tiles.forEach(t => {
    const tile = document.createElement("div");
    tile.className = "stat" + (t.cls ? " " + t.cls : "");
    const num = document.createElement("div");
    num.className = "stat-num";
    num.innerText = t.num;
    const label = document.createElement("div");
    label.className = "stat-label";
    if (t.dot) {
      const dot = document.createElement("span");
      dot.className = "dot " + t.dot;
      label.appendChild(dot);
    }
    label.appendChild(document.createTextNode(t.label));
    tile.appendChild(num);
    tile.appendChild(label);
    el.appendChild(tile);
  });
}

/* ============================================================
   EDITING — toggle favorite / played
   ============================================================ */

function makeToggle(g, key, glyph, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "act " + (key === "favorite" ? "fav" : "played");
  btn.innerText = glyph;
  const on = g[key] === true;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", (on ? "Remove " : "Mark as ") + label);
  btn.title = label[0].toUpperCase() + label.slice(1);
  btn.addEventListener("click", () => toggleFlag(g, key));
  return btn;
}

async function toggleFlag(g, key) {
  if (!isOwner()) return;

  const prev = g[key] === true;
  g[key] = !prev;
  renderStats();
  applyFilters();

  if (MODE === "supabase") {
    const { error } = await sb.from("games").update({ [key]: g[key] }).eq("id", g.id);
    if (error) {
      g[key] = prev;                 // roll back on failure
      renderStats();
      applyFilters();
      alert("Could not save change: " + error.message);
    }
  } else {
    dirty = true;
    updateSaveBar();
  }
}

/* ============================================================
   ADD A GAME
   ============================================================ */

async function submitAddGame() {
  const name  = document.getElementById("gName").value.trim();
  const image = document.getElementById("gImage").value.trim();
  const platform = document.getElementById("gPlatform").value;
  const type     = document.getElementById("gType").value;
  const store    = document.getElementById("gStore").value;
  const dlc      = parseLines(document.getElementById("gDlc").value);
  const edition  = parseLines(document.getElementById("gEdition").value);
  const errEl = document.getElementById("addError");

  function fail(msg) { errEl.innerText = msg; errEl.hidden = false; }
  errEl.hidden = true;

  if (!name) return fail("Please enter a name.");

  const id = slugify(name);
  if (!id) return fail("That name has no usable letters or numbers.");
  if (allGames.some(g => g.id === id)) return fail("A game with this name already exists.");

  const copy = { platform, type };
  if (store) copy.store = store;

  const game = {
    id, name,
    copies: [copy],
    dlc, edition,
    image: image || "",
    favorite: false, played: false
  };

  if (MODE === "supabase") {
    const { error } = await sb.from("games").insert(game).select();
    if (error) return fail("Could not add game: " + error.message);
  } else {
    dirty = true;
    updateSaveBar();
  }

  allGames.unshift(game);
  renderStats();
  applyFilters();
  closeModal("addModal");

  // reset form
  document.getElementById("gName").value = "";
  document.getElementById("gImage").value = "";
  document.getElementById("gDlc").value = "";
  document.getElementById("gEdition").value = "";
}

/* ============================================================
   LOCAL-MODE SAVE BAR (download updated JSON)
   ============================================================ */

function updateSaveBar() {
  const bar = document.getElementById("savebar");
  bar.hidden = !dirty;
  if (dirty) {
    document.getElementById("savebarText").innerText = "You have unsaved changes";
  }
}

function saveChanges() {
  const blob = new Blob([JSON.stringify(allGames, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "games_enriched.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  dirty = false;
  updateSaveBar();
}

/* ============================================================
   RENDER
   ============================================================ */

function render(games) {
  const app = document.getElementById("app");
  const empty = document.getElementById("empty");
  const meta = document.getElementById("resultsMeta");

  app.innerHTML = "";
  meta.innerText = games.length === allGames.length
    ? `${games.length} games`
    : `${games.length} of ${allGames.length} games`;

  if (games.length === 0) {
    empty.hidden = false;
    empty.innerHTML = "<strong>No games match</strong>Try clearing the search or filters.";
    return;
  }
  empty.hidden = true;

  const owner = isOwner();
  const frag = document.createDocumentFragment();

  games.forEach(g => {
    const card = document.createElement("div");
    card.className = "card";

    const cover = document.createElement("div");
    cover.className = "cover";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = g.name || "Game cover";
    img.src = g.image || placeholderFor(g.name);
    img.onerror = () => { img.onerror = null; img.src = placeholderFor(g.name); };
    cover.appendChild(img);

    // toggle actions — only the owner can edit
    if (owner) {
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.appendChild(makeToggle(g, "favorite", "★", "favorite"));
      actions.appendChild(makeToggle(g, "played", "✔", "played"));
      cover.appendChild(actions);
    } else {
      // read-only: still show the status as static markers
      if (g.favorite === true || g.played === true) {
        const m = document.createElement("div");
        m.className = "actions";
        if (g.favorite === true) {
          const s = document.createElement("span");
          s.className = "act fav"; s.setAttribute("aria-pressed", "true"); s.innerText = "★";
          m.appendChild(s);
        }
        if (g.played === true) {
          const s = document.createElement("span");
          s.className = "act played"; s.setAttribute("aria-pressed", "true"); s.innerText = "✔";
          m.appendChild(s);
        }
        cover.appendChild(m);
      }
    }

    // hover overlay
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    (g.copies || []).forEach(c => {
      const line = document.createElement("div");
      line.className = "overlay-line";
      const dot = document.createElement("span");
      dot.className = "dot " + (isPlayStation(c.platform) ? "dot-ps" : "dot-pc");
      const text = document.createElement("span");
      text.innerText = copyLabel(c);
      line.appendChild(dot);
      line.appendChild(text);
      overlay.appendChild(line);
    });
    if (g.dlc?.length || g.edition?.length) {
      const meta2 = document.createElement("div");
      meta2.className = "overlay-meta";
      const parts = [];
      if (g.dlc?.length) parts.push(`${g.dlc.length} DLC`);
      if (g.edition?.length) parts.push(g.edition.join(", "));
      meta2.innerText = parts.join("  ·  ");
      overlay.appendChild(meta2);
    }
    cover.appendChild(overlay);

    const info = document.createElement("div");
    info.className = "info";
    const title = document.createElement("div");
    title.className = "title";
    title.innerText = g.name;
    const badges = document.createElement("div");
    badges.className = "badges";
    (g.copies || []).forEach(c => {
      const b = document.createElement("span");
      b.className = "badge";
      const dot = document.createElement("span");
      dot.className = "dot " + (isPlayStation(c.platform) ? "dot-ps" : "dot-pc");
      const lab = document.createElement("span");
      lab.innerText = platformLabel(c.platform);
      b.appendChild(dot); b.appendChild(lab);
      badges.appendChild(b);
    });
    info.appendChild(title);
    info.appendChild(badges);

    card.appendChild(cover);
    card.appendChild(info);
    frag.appendChild(card);
  });

  app.appendChild(frag);
}

/* ============================================================
   DATA LOADING
   ============================================================ */

async function loadGames() {
  if (MODE === "supabase") {
    const { data, error } = await sb.from("games").select("*").order("name");
    if (error) throw error;
    return data || [];
  }
  const res = await fetch("games_enriched.json?v=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function showLoadError(message) {
  document.getElementById("collectionStat").innerText = "Could not load library";
  const empty = document.getElementById("empty");
  empty.hidden = false;
  empty.innerHTML = "<strong>Couldn't load your games</strong>" + message;
}

loadGames()
  .then(games => {
    allGames = games;
    setLibraryCounts(allGames);
    renderStats();
    applyFilters();
  })
  .catch(err => {
    if (MODE === "supabase") {
      showLoadError("Check your Supabase keys in config.js and that you ran the setup SQL. (" + err.message + ")");
    } else {
      showLoadError("Check that games_enriched.json sits next to index.html. (" + err.message + ")");
    }
  });

/* ============================================================
   AUTH (supabase mode only)
   ============================================================ */

async function initAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  updateAuthUI();

  sb.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    updateAuthUI();
    applyFilters();   // re-render so edit buttons appear / disappear
  });
}

function updateAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const addBtn = document.getElementById("addBtn");

  if (MODE === "supabase") {
    loginBtn.hidden = false;
    loginBtn.innerText = session ? "Sign out" : "Sign in";
  } else {
    loginBtn.hidden = true;   // no login needed on your own machine
  }
  addBtn.hidden = !isOwner();
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;
  const errEl = document.getElementById("loginError");
  errEl.hidden = true;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.innerText = error.message;
    errEl.hidden = false;
    return;
  }
  document.getElementById("loginPass").value = "";
  closeModal("loginModal");
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */

function openModal(id) {
  document.getElementById(id).hidden = false;
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
}

/* ============================================================
   EVENTS
   ============================================================ */

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const runSearch = debounce(() => applyFilters(), 120);

document.getElementById("search").addEventListener("input", e => {
  state.search = e.target.value.toLowerCase().trim();
  runSearch();
});

document.querySelectorAll("#platformFilters input").forEach(cb => {
  cb.addEventListener("change", () => {
    state.platforms = [...document.querySelectorAll("#platformFilters input:checked")].map(c => c.value);
    applyFilters();
  });
});

document.querySelectorAll("#flagFilters input").forEach(cb => {
  cb.addEventListener("change", () => {
    state.flags = [...document.querySelectorAll("#flagFilters input:checked")].map(c => c.value);
    applyFilters();
  });
});

document.getElementById("sort").addEventListener("change", e => {
  state.sort = e.target.value;
  applyFilters();
});

// save bar (local mode)
document.getElementById("saveBtn").addEventListener("click", saveChanges);
document.getElementById("discardBtn").addEventListener("click", () => location.reload());
window.addEventListener("beforeunload", e => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

// add game
document.getElementById("addBtn").addEventListener("click", () => openModal("addModal"));
document.getElementById("addSubmit").addEventListener("click", submitAddGame);

// login
document.getElementById("loginBtn").addEventListener("click", () => {
  if (session) { sb.auth.signOut(); }
  else { openModal("loginModal"); }
});
document.getElementById("loginSubmit").addEventListener("click", doLogin);

// generic modal close (buttons + backdrop + Esc)
document.querySelectorAll("[data-close]").forEach(b => {
  b.addEventListener("click", () => closeModal(b.getAttribute("data-close")));
});
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m) m.hidden = true; });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => m.hidden = true);
});

// start auth
if (MODE === "supabase") initAuth();
updateAuthUI();
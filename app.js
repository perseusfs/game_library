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
let dirty = false;      // local mode: unsaved game edits waiting to download

let state = { search: "", platforms: [], flags: [], sort: "none" };

// ---- books + library switch ----
let library = "games";  // "games" | "books" | "stats"
let allBooks = [];
let gamesLoaded = false;
let booksLoaded = false;
let dirtyBooks = false;
let currentDetailGame = null;   // game shown in the detail/edit view
let bookState = { search: "", genre: "", language: "", shelf: "", status: "", sort: "title" };

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
  if (c.type === "physical") txt += " · Disk";
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

// Two copies are "the same" if platform, type, and store all match
function sameCopy(a, b) {
  return a.platform === b.platform &&
         a.type === b.type &&
         (a.store || "") === (b.store || "");
}

// Merge list b into a without duplicates (keeps order)
function union(a, b) {
  const out = [...(a || [])];
  (b || []).forEach(x => { if (!out.includes(x)) out.push(x); });
  return out;
}

// Self-contained cover placeholder (no external service, works offline)
function placeholderFor(name) {
  const letter = ((name || "?").trim()[0] || "?").toUpperCase();
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>" +
        "<stop offset='0' stop-color='#323746'/>" +
        "<stop offset='1' stop-color='#262a36'/>" +
      "</linearGradient></defs>" +
      "<rect width='400' height='600' fill='url(#g)'/>" +
      "<text x='50%' y='50%' font-family='Inter,sans-serif' font-size='180' " +
        "font-weight='700' fill='#4b5168' text-anchor='middle' " +
        "dominant-baseline='central'>" + letter + "</text>" +
    "</svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Rewrite a full-size RAWG image URL to a smaller, faster resized variant.
// e.g. .../media/games/ab/xyz.jpg -> .../media/resize/420/-/games/ab/xyz.jpg
// Non-RAWG or already-resized URLs are returned unchanged.
function rawgImg(url, width) {
  if (!url || url.indexOf("media.rawg.io/media/") === -1) return url;
  if (url.indexOf("/media/resize/") !== -1 || url.indexOf("/media/crop/") !== -1) return url;
  return url.replace("/media/", "/media/resize/" + width + "/-/");
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
    `${games.length} oyun · ${platformSet.size} platform`;
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
    { num: allGames.length, label: "Toplam" },
    { num: gamesWith(g => anyCopy(g, c => c.platform === "pc")), label: "PC", dot: "dot-pc" },
    { num: gamesWith(g => anyCopy(g, c => isPlayStation(c.platform))), label: "PlayStation", dot: "dot-ps" },
    { num: gamesWith(g => anyCopy(g, c => c.type === "physical")), label: "Disk" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "steam")), label: "Steam" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "epic")), label: "Epic" },
    { num: gamesWith(g => anyCopy(g, c => c.store === "ps_store")), label: "PS Store" },
    { num: gamesWith(g => g.favorite === true), label: "Favori", cls: "gold" },
    { num: gamesWith(g => g.played === true), label: "Oynandı", cls: "accent" }
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
  btn.setAttribute("aria-label", (on ? "Kaldır: " : "Ekle: ") + label);
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

  if (!name) return fail("Lütfen bir ad girin.");

  const id = slugify(name);
  if (!id) return fail("Bu adda kullanılabilir harf veya rakam yok.");

  const copy = { platform, type };
  if (store) copy.store = store;

  const existing = allGames.find(g => g.id === id);

  if (existing) {
    // Game is already in the library -> add this copy to it.
    if (existing.copies.some(c => sameCopy(c, copy))) {
      return fail("Bu oyunda tam olarak bu platform ve mağaza zaten var.");
    }

    const newCopies  = [...existing.copies, copy];
    const newDlc     = union(existing.dlc, dlc);
    const newEdition = union(existing.edition, edition);

    if (MODE === "supabase") {
      const { error } = await sb.from("games")
        .update({ copies: newCopies, dlc: newDlc, edition: newEdition })
        .eq("id", id);
      if (error) return fail("Oyun güncellenemedi: " + error.message);
    } else {
      dirty = true;
      updateSaveBar();
    }

    existing.copies  = newCopies;
    existing.dlc     = newDlc;
    existing.edition = newEdition;

  } else {
    // Brand-new game.
    const game = {
      id, name,
      copies: [copy],
      dlc, edition,
      image: image || "",
      favorite: false, played: false
    };

    if (MODE === "supabase") {
      const { error } = await sb.from("games").insert(game).select();
      if (error) return fail("Oyun eklenemedi: " + error.message);
    } else {
      dirty = true;
      updateSaveBar();
    }

    allGames.unshift(game);
  }

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
  bar.hidden = !(dirty || dirtyBooks);
  if (dirty || dirtyBooks) {
    document.getElementById("savebarText").innerText = "Kaydedilmemiş değişiklikler";
  }
}

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function saveChanges() {
  if (dirty)      { download("games_enriched.json", allGames); dirty = false; }
  if (dirtyBooks) { download("books.json", allBooks);          dirtyBooks = false; }
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
    ? `${games.length} oyun`
    : `${games.length} / ${allGames.length} oyun`;

  if (games.length === 0) {
    empty.hidden = false;
    empty.innerHTML = "<strong>Eşleşen oyun yok</strong>Aramayı veya filtreleri temizle.";
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
    img.decoding = "async";
    img.alt = g.name || "Game cover";
    const full = g.image || "";
    img.dataset.full = full;
    img.src = full ? rawgImg(full, 420) : placeholderFor(g.name);
    img.onerror = () => {
      // 1st failure: try the full-size original; 2nd: fall back to placeholder
      if (img.dataset.full && img.src !== img.dataset.full) {
        img.src = img.dataset.full;
      } else {
        img.onerror = null;
        img.src = placeholderFor(g.name);
      }
    };
    cover.appendChild(img);

    // toggle actions — only the owner can edit
    if (owner) {
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.appendChild(makeToggle(g, "favorite", "★", "favori"));
      actions.appendChild(makeToggle(g, "played", "✔", "oynandı"));
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
    card.addEventListener("click", e => {
      if (e.target.closest(".act")) return;   // let the toggle buttons do their thing
      openGameDetail(g);
    });
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
  document.getElementById("collectionStat").innerText = "Kütüphane yüklenemedi";
  const empty = document.getElementById("empty");
  empty.hidden = false;
  empty.innerHTML = "<strong>Oyunlar yüklenemedi</strong>" + message;
}

loadGames()
  .then(games => {
    allGames = games;
    gamesLoaded = true;
    setLibraryCounts(allGames);
    renderStats();
    applyFilters();
  })
  .catch(err => {
    if (MODE === "supabase") {
      showLoadError("config.js içindeki Supabase anahtarlarını ve kurulum SQL'ini çalıştırdığını kontrol et. (" + err.message + ")");
    } else {
      showLoadError("games_enriched.json dosyasının index.html ile aynı klasörde olduğunu kontrol et. (" + err.message + ")");
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
    renderActive();   // re-render active library so edit controls appear/disappear
  });
}

function updateAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const addBtn = document.getElementById("addBtn");

  if (MODE === "supabase") {
    loginBtn.hidden = false;
    loginBtn.innerText = session ? "Çıkış yap" : "Giriş yap";
  } else {
    loginBtn.hidden = true;   // no login needed on your own machine
  }
  addBtn.hidden = !isOwner() || library === "stats";
  addBtn.innerText = library === "games" ? "+ Oyun ekle" : "+ Kitap ekle";
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
  const v = e.target.value.toLowerCase().trim();
  if (library === "games") { state.search = v; runSearch(); }
  else { bookState.search = v; applyBookFilters(); }
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
  if (dirty || dirtyBooks) { e.preventDefault(); e.returnValue = ""; }
});

// add game
document.getElementById("addBtn").addEventListener("click", () => {
  if (library === "games") openModal("addModal");
  else openBookForm(null);
});
document.getElementById("addSubmit").addEventListener("click", submitAddGame);
document.getElementById("gdEditBtn").addEventListener("click", openGameEdit);
document.getElementById("editSubmit").addEventListener("click", submitEditGame);

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

// ---- books events ----
document.getElementById("bGenre").addEventListener("change", e => { bookState.genre = e.target.value; applyBookFilters(); });
document.getElementById("bLang").addEventListener("change", e => { bookState.language = e.target.value; applyBookFilters(); });
document.getElementById("bShelf").addEventListener("change", e => { bookState.shelf = e.target.value; applyBookFilters(); });
document.getElementById("bStatus").addEventListener("change", e => { bookState.status = e.target.value; applyBookFilters(); });
document.getElementById("bSort").addEventListener("change", e => { bookState.sort = e.target.value; applyBookFilters(); });
document.getElementById("bookSubmit").addEventListener("click", submitBook);

// ---- light / dark theme ----
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeBtn").innerText = theme === "light" ? "☾" : "☀";
}
let theme = "dark";
try { theme = localStorage.getItem("theme") || "dark"; } catch (e) {}
applyTheme(theme);
document.getElementById("themeBtn").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  applyTheme(theme);
  try { localStorage.setItem("theme", theme); } catch (e) {}
});

// ---- mode switch ----
document.querySelectorAll("#modeSwitch .ms-btn").forEach(btn => {
  btn.addEventListener("click", () => switchLibrary(btn.dataset.lib));
});

// start in the library named by the URL hash, else games
const startLib = location.hash.replace("#", "");
switchLibrary(["games", "books", "stats"].includes(startLib) ? startLib : "games");
updateAuthUI();

/* ============================================================
   BOOKS MODULE
   ============================================================ */

let editingBookId = null;

function parseYear(value) {
  const s = String(value == null ? "" : value).trim();
  const body = s.startsWith("-") ? s.slice(1) : s;
  if (!/^[0-9]+$/.test(body)) return null;
  const n = parseInt(s, 10);
  return (n >= -9999 && n <= 9999) ? n : null;
}

async function loadBooks() {
  if (MODE === "supabase") {
    const { data, error } = await sb.from("Books").select("*").order("title");
    if (error) throw error;
    return data || [];
  }
  const res = await fetch("books.json?v=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function ensureBooks() {
  if (booksLoaded) { renderBookStats(); applyBookFilters(); return; }
  loadBooks()
    .then(books => {
      allBooks = books;
      booksLoaded = true;
      buildBookFilters();
      renderBookStats();
      applyBookFilters();
    })
    .catch(err => {
      const empty = document.getElementById("bEmpty");
      empty.hidden = false;
      empty.innerHTML = "<strong>Kitaplar yüklenemedi</strong>" +
        (MODE === "supabase"
          ? "Supabase'de Books tablosu ve politikalar kurulu mu? (" + err.message + ")"
          : "books.json dosyası index.html ile aynı klasörde mi? (" + err.message + ")");
    });
}

function distinct(list, key) {
  return [...new Set(list.map(b => (b[key] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "tr"));
}

function fillSelect(id, values, firstLabel) {
  const sel = document.getElementById(id);
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = firstLabel;
  sel.appendChild(opt0);
  values.forEach(v => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

function fillDatalist(id, values) {
  const dl = document.getElementById(id);
  dl.innerHTML = "";
  values.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    dl.appendChild(o);
  });
}

function buildBookFilters() {
  fillSelect("bGenre", distinct(allBooks, "genre"), "Tür · hepsi");
  fillSelect("bLang",  distinct(allBooks, "original_language"), "Dil · hepsi");
  fillSelect("bShelf", distinct(allBooks, "shelf_id"), "Raf · hepsi");
  fillDatalist("dl-authors",    distinct(allBooks, "author"));
  fillDatalist("dl-publishers", distinct(allBooks, "publisher"));
  fillDatalist("dl-fields",     distinct(allBooks, "field"));
  fillDatalist("dl-genres",     distinct(allBooks, "genre"));
  fillDatalist("dl-langs",      distinct(allBooks, "original_language"));
  fillDatalist("dl-shelves",    distinct(allBooks, "shelf_id"));
}

function applyBookFilters() {
  let list = [...allBooks];
  const q = bookState.search;
  if (q) {
    list = list.filter(b =>
      [b.title, b.author, b.publisher].some(x => (x || "").toLowerCase().includes(q)));
  }
  if (bookState.genre)    list = list.filter(b => b.genre === bookState.genre);
  if (bookState.language) list = list.filter(b => b.original_language === bookState.language);
  if (bookState.shelf)    list = list.filter(b => b.shelf_id === bookState.shelf);
  if (bookState.status === "read")     list = list.filter(b => b.is_read);
  if (bookState.status === "unread")   list = list.filter(b => !b.is_read);
  if (bookState.status === "favorite") list = list.filter(b => b.is_favorite);

  const s = bookState.sort;
  if (s === "title")  list.sort((a, b) => (a.title || "").localeCompare(b.title || "", "tr"));
  if (s === "author") list.sort((a, b) => (a.author || "").localeCompare(b.author || "", "tr"));
  if (s === "year")   list.sort((a, b) => (parseYear(a.publication_year) ?? 99999) - (parseYear(b.publication_year) ?? 99999));
  if (s === "pages")  list.sort((a, b) => (b.pages || 0) - (a.pages || 0));
  if (s === "added")  list.sort((a, b) => String(b.date_added || "").localeCompare(String(a.date_added || "")));

  renderBooks(list);
}

function renderBookStats() {
  const total = allBooks.length;
  const read = allBooks.filter(b => b.is_read).length;
  const fav = allBooks.filter(b => b.is_favorite).length;
  const pages = allBooks.reduce((s, b) => s + (b.pages || 0), 0);
  const authors = new Set(allBooks.map(b => b.author).filter(Boolean)).size;
  const langs = new Set(allBooks.map(b => b.original_language).filter(Boolean)).size;
  const pct = total ? Math.round(100 * read / total) : 0;

  const tiles = [
    { num: total, label: "kitap" },
    { num: read + "  %" + pct, label: "okundu", cls: "accent" },
    { num: fav, label: "favori", cls: "gold" },
    { num: pages.toLocaleString("tr-TR"), label: "sayfa" },
    { num: authors, label: "yazar" },
    { num: langs, label: "orijinal dil" }
  ];
  const el = document.getElementById("bStats");
  el.innerHTML = "";
  tiles.forEach(t => {
    const tile = document.createElement("div");
    tile.className = "stat" + (t.cls ? " " + t.cls : "");
    const num = document.createElement("div");
    num.className = "stat-num";
    num.innerText = t.num;
    const label = document.createElement("div");
    label.className = "stat-label";
    label.innerText = t.label;
    tile.appendChild(num); tile.appendChild(label);
    el.appendChild(tile);
  });

  document.getElementById("collectionStat").innerText = `${total} kitap · ${authors} yazar`;
}

function bookToggleBtn(b, key, glyph, cls) {
  const on = !!b[key];
  if (isOwner()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btoggle " + cls + (on ? " on" : "");
    btn.innerText = glyph;
    btn.title = cls === "fav" ? "Favori" : "Okundu";
    btn.addEventListener("click", () => toggleBookFlag(b, key));
    return btn;
  }
  const span = document.createElement("span");
  span.className = "bstatic " + cls + (on ? " on" : "");
  span.innerText = on ? glyph : "";
  return span;
}

function renderBooks(list) {
  const wrap = document.getElementById("bApp");
  const empty = document.getElementById("bEmpty");
  const meta = document.getElementById("bResultsMeta");

  meta.innerText = list.length === allBooks.length
    ? `${list.length} kitap`
    : `${list.length} / ${allBooks.length} kitap`;

  if (list.length === 0) {
    wrap.innerHTML = "";
    empty.hidden = false;
    empty.innerHTML = "<strong>Eşleşen kitap yok</strong>Aramayı veya filtreleri temizle.";
    return;
  }
  empty.hidden = true;

  const table = document.createElement("table");
  table.className = "books";
  table.innerHTML =
    "<thead><tr>" +
      "<th class='b-fav'></th><th>Kitap</th><th>Tür</th><th>Orijinal Dil</th>" +
      "<th class='b-year'>Yıl</th><th class='b-pages'>Sayfa</th>" +
      "<th class='b-shelf'>Raf</th><th class='b-read'>Okundu</th>" +
    "</tr></thead>";
  const tbody = document.createElement("tbody");

  list.forEach(b => {
    const tr = document.createElement("tr");

    const favTd = document.createElement("td");
    favTd.className = "b-fav";
    favTd.appendChild(bookToggleBtn(b, "is_favorite", "★", "fav"));
    tr.appendChild(favTd);

    const titleTd = document.createElement("td");
    titleTd.className = "b-title-cell";
    const t = document.createElement("span");
    t.className = "b-title"; t.innerText = b.title || "";
    const a = document.createElement("span");
    a.className = "b-author";
    a.innerText = (b.author || "") + (b.publisher ? " · " + b.publisher : "");
    titleTd.appendChild(t); titleTd.appendChild(a);
    tr.appendChild(titleTd);

    const genreTd = document.createElement("td");
    genreTd.className = "b-genre"; genreTd.innerText = b.genre || "";
    tr.appendChild(genreTd);

    const langTd = document.createElement("td");
    langTd.className = "b-lang"; langTd.innerText = b.original_language || "";
    tr.appendChild(langTd);

    const yearTd = document.createElement("td");
    yearTd.className = "b-year"; yearTd.innerText = b.publication_year || "";
    tr.appendChild(yearTd);

    const pagesTd = document.createElement("td");
    pagesTd.className = "b-pages"; pagesTd.innerText = b.pages || "";
    tr.appendChild(pagesTd);

    const shelfTd = document.createElement("td");
    shelfTd.className = "b-shelf";
    if (b.shelf_id) {
      const chip = document.createElement("span");
      chip.className = "shelf-chip"; chip.innerText = b.shelf_id;
      shelfTd.appendChild(chip);
    }
    tr.appendChild(shelfTd);

    const readTd = document.createElement("td");
    readTd.className = "b-read";
    readTd.appendChild(bookToggleBtn(b, "is_read", "✔", "read"));
    tr.appendChild(readTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

async function toggleBookFlag(b, key) {
  if (!isOwner()) return;
  const prev = b[key] ? 1 : 0;
  b[key] = prev ? 0 : 1;
  renderBookStats();
  applyBookFilters();

  if (MODE === "supabase") {
    const { error } = await sb.from("Books").update({ [key]: b[key] }).eq("id", b.id);
    if (error) {
      b[key] = prev;
      renderBookStats();
      applyBookFilters();
      alert("Kaydedilemedi: " + error.message);
    }
  } else {
    dirtyBooks = true;
    updateSaveBar();
  }
}

/* ---- add a book ---- */

function openBookForm(book) {
  editingBookId = book ? book.id : null;
  document.getElementById("bookModalTitle").innerText = book ? "Kitabı düzenle" : "Yeni kitap";
  const v = (id, val) => { document.getElementById(id).value = val ?? ""; };
  v("bTitle", book && book.title);
  v("bAuthor", book && book.author);
  v("bPublisher", book && book.publisher);
  v("bField", book && book.field);
  v("bGenreIn", book && book.genre);
  v("bLangIn", book && book.original_language);
  v("bShelfIn", book && book.shelf_id);
  v("bPages", book && book.pages);
  v("bYear", book && book.publication_year);
  document.getElementById("bookError").hidden = true;
  openModal("bookModal");
}

async function submitBook() {
  const get = id => document.getElementById(id).value.trim();
  const errEl = document.getElementById("bookError");
  const fail = msg => { errEl.innerText = msg; errEl.hidden = false; };
  errEl.hidden = true;

  const title = get("bTitle");
  if (!title) return fail("Kitap adı gerekli.");

  const record = {
    title,
    author: get("bAuthor"),
    publisher: get("bPublisher"),
    field: get("bField"),
    genre: get("bGenreIn"),
    shelf_id: get("bShelfIn"),
    pages: parseInt(get("bPages"), 10) || 0,
    publication_year: get("bYear"),
    original_language: get("bLangIn"),
    is_favorite: 0,
    is_read: 0,
    date_added: new Date().toISOString().slice(0, 19).replace("T", " "),
    year_num: parseYear(get("bYear"))
  };

  if (MODE === "supabase") {
    const { data, error } = await sb.from("Books").insert(record).select();
    if (error) return fail("Eklenemedi: " + error.message);
    record.id = data && data[0] ? data[0].id : undefined;
  } else {
    record.id = allBooks.reduce((m, b) => Math.max(m, b.id || 0), 0) + 1;
    dirtyBooks = true;
    updateSaveBar();
  }

  allBooks.push(record);
  buildBookFilters();      // a new genre/author may now exist
  renderBookStats();
  applyBookFilters();
  closeModal("bookModal");
}

/* ============================================================
   LIBRARY SWITCH (shell)
   ============================================================ */

function renderActive() {
  if (library === "games") { renderStats(); applyFilters(); }
  else { renderBookStats(); applyBookFilters(); }
}

function switchLibrary(lib) {
  library = lib;
  document.body.className = "lib-" + lib;
  if (location.hash.replace("#", "") !== lib) location.hash = lib;

  document.getElementById("games-controls").hidden = lib !== "games";
  document.getElementById("books-controls").hidden = lib !== "books";
  document.getElementById("games-view").hidden = lib !== "games";
  document.getElementById("books-view").hidden = lib !== "books";
  document.getElementById("stats-view").hidden = lib !== "stats";

  document.querySelectorAll("#modeSwitch .ms-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.lib === lib));

  document.getElementById("wordmark").innerText =
    lib === "games" ? "Oyun Kütüphanesi" : lib === "books" ? "Kitaplık" : "İstatistik";

  // search box only applies to games/books
  const search = document.getElementById("search");
  document.querySelector(".search-box").style.display = lib === "stats" ? "none" : "";
  if (lib === "games") {
    search.placeholder = "Oyun ara…";
    search.value = state.search;
  } else if (lib === "books") {
    search.placeholder = "Kitap, yazar veya yayınevi ara…";
    search.value = bookState.search;
  }

  updateAuthUI();

  if (lib === "games") {
    if (allGames.length) { setLibraryCounts(allGames); renderStats(); applyFilters(); }
  } else if (lib === "books") {
    ensureBooks();
  } else {
    ensureStats();
  }
}

/* ============================================================
   STATS DASHBOARD (third mode)
   ============================================================ */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Count occurrences -> [[name, count], ...] sorted by count desc
function tally(items) {
  const m = new Map();
  items.forEach(x => {
    if (x == null || x === "") return;
    m.set(x, (m.get(x) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function tilesHTML(tiles) {
  return '<section class="big-grid">' + tiles.map(t =>
    `<div class="big-stat"><span class="big-num">${t.num}</span>` +
    `<span class="big-label">${esc(t.label)}</span></div>`).join("") + "</section>";
}

function panelHTML(title, entries, cls, opts) {
  opts = opts || {};
  if (!entries.length) return "";
  const limit = opts.limit || entries.length;
  const shown = entries.slice(0, limit);
  const max = Math.max(...shown.map(e => e[1]), 1);
  const rows = shown.map(([name, count]) => {
    const w = Math.max(2, Math.round(100 * count / max));
    const label = opts.chip
      ? `<span class="shelf-chip">${esc(name)}</span>`
      : esc(name);
    return `<div class="bar-row"><span class="bar-name">${label}</span>` +
           `<span class="bar-track"><span class="bar-fill ${cls}" style="width:${w}%"></span></span>` +
           `<span class="bar-val">${count}</span></div>`;
  }).join("");
  return `<section class="panel"><h2>${esc(title)}</h2>${rows}</section>`;
}

function gamesStatsHTML() {
  const G = allGames;
  if (!G.length) return "";
  const copies = G.flatMap(g => g.copies || []);
  const total = G.length;
  const fav = G.filter(g => g.favorite).length;
  const played = G.filter(g => g.played).length;
  const physical = copies.filter(c => c.type === "physical").length;
  const digital = copies.length - physical;
  const multi = G.filter(g => new Set((g.copies || []).map(c => c.platform)).size > 1).length;
  const withDlc = G.filter(g => (g.dlc || []).length).length;
  const withEd = G.filter(g => (g.edition || []).length).length;
  const playedPct = total ? Math.round(100 * played / total) : 0;

  const byPlatform = tally(copies.map(c => platformLabel(c.platform)));
  const byStore = tally(copies.map(c =>
    c.type === "physical" ? "Disk" : (STORE_LABEL[c.store] || c.store || "—")));

  const tiles = [
    { num: total, label: "oyun" },
    { num: copies.length, label: "kopya" },
    { num: `${fav}`, label: "favori" },
    { num: `${played} <small>%${playedPct}</small>`, label: "oynandı" },
    { num: physical, label: "disk" },
    { num: digital, label: "dijital" },
    { num: multi, label: "çok platform" },
    { num: withDlc, label: "DLC'li" },
    { num: withEd, label: "sürümlü" }
  ];

  const mostCopies = [...G].sort((a, b) => (b.copies || []).length - (a.copies || []).length)[0];
  const mostDlc = [...G].sort((a, b) => (b.dlc || []).length - (a.dlc || []).length)[0];

  let highlights = '<section class="panel highlights"><h2>Öne çıkanlar</h2>';
  if (mostCopies) highlights += `<p><span class="hl-label">En çok kopya</span> <strong>${esc(mostCopies.name)}</strong> — ${(mostCopies.copies || []).length}</p>`;
  if (mostDlc && (mostDlc.dlc || []).length) highlights += `<p><span class="hl-label">En çok DLC</span> <strong>${esc(mostDlc.name)}</strong> — ${mostDlc.dlc.length}</p>`;
  highlights += "</section>";

  return '<section class="stats-section">' +
    `<h2 class="section-title">🎮 Oyunlar <span class="pill-count">${total}</span></h2>` +
    tilesHTML(tiles) +
    '<div class="panels">' +
      panelHTML("Platforma göre", byPlatform, "coral") +
      panelHTML("Mağaza / formata göre", byStore, "blue") +
      highlights +
    "</div></section>";
}

function booksStatsHTML() {
  const B = allBooks;
  if (!B.length) return "";
  const total = B.length;
  const totalPages = B.reduce((s, b) => s + (b.pages || 0), 0);
  const avg = total ? Math.round(totalPages / total) : 0;
  const read = B.filter(b => b.is_read).length;
  const fav = B.filter(b => b.is_favorite).length;
  const readPct = total ? Math.round(100 * read / total) : 0;

  const authors = tally(B.map(b => b.author));
  const publishers = tally(B.map(b => b.publisher));
  const langs = tally(B.map(b => b.original_language));
  const genres = tally(B.map(b => b.genre));
  const shelves = tally(B.map(b => b.shelf_id));
  const fields = tally(B.map(b => b.field));

  // publication centuries
  const cmap = new Map();
  B.forEach(b => {
    if (b.year_num == null) return;
    const start = Math.floor(b.year_num / 100) * 100;
    cmap.set(start, (cmap.get(start) || 0) + 1);
  });
  const centuries = [...cmap.entries()].sort((a, b) => a[0] - b[0]).map(([start, c]) => {
    const label = start < 0 ? `MÖ ${Math.abs(start)}` : `${start}'ler`;
    return [label, c];
  });

  const tiles = [
    { num: total, label: "kitap" },
    { num: totalPages.toLocaleString("tr-TR"), label: "toplam sayfa" },
    { num: avg, label: "ort. sayfa" },
    { num: authors.length, label: "yazar" },
    { num: publishers.length, label: "yayınevi" },
    { num: langs.length, label: "orijinal dil" },
    { num: genres.length, label: "tür" },
    { num: shelves.length, label: "raf" },
    { num: `${read} <small>%${readPct}</small>`, label: "okundu" },
    { num: fav, label: "favori" }
  ];

  const longest = [...B].sort((a, b) => (b.pages || 0) - (a.pages || 0))[0];
  const shortest = [...B].filter(b => b.pages > 0).sort((a, b) => a.pages - b.pages)[0];
  const dated = B.filter(b => b.year_num != null);
  const oldest = [...dated].sort((a, b) => a.year_num - b.year_num)[0];
  const newest = [...dated].sort((a, b) => b.year_num - a.year_num)[0];

  let highlights = '<section class="panel highlights"><h2>Öne çıkanlar</h2>';
  if (longest)  highlights += `<p><span class="hl-label">En uzun</span> <strong>${esc(longest.title)}</strong> — ${longest.pages} sayfa</p>`;
  if (shortest) highlights += `<p><span class="hl-label">En kısa</span> <strong>${esc(shortest.title)}</strong> — ${shortest.pages} sayfa</p>`;
  if (oldest)   highlights += `<p><span class="hl-label">En eski</span> <strong>${esc(oldest.title)}</strong> — ${esc(oldest.publication_year)}</p>`;
  if (newest)   highlights += `<p><span class="hl-label">En yeni</span> <strong>${esc(newest.title)}</strong> — ${esc(newest.publication_year)}</p>`;
  if (authors[0]) highlights += `<p><span class="hl-label">En üretken</span> <strong>${esc(authors[0][0])}</strong> — ${authors[0][1]} kitap</p>`;
  highlights += "</section>";

  return '<section class="stats-section">' +
    `<h2 class="section-title">📚 Kitaplar <span class="pill-count">${total}</span></h2>` +
    tilesHTML(tiles) +
    '<div class="panels">' +
      panelHTML("Orijinal dile göre", langs, "teal", { limit: 10 }) +
      panelHTML("Türlere göre", genres, "blue", { limit: 10 }) +
      panelHTML("Alana göre", fields, "teal", { limit: 10 }) +
      panelHTML("Raflara göre", shelves, "warm", { chip: true }) +
      panelHTML("Basım dönemi", centuries, "blue") +
      panelHTML("En çok kitabı olan yazarlar", authors, "warm", { limit: 8 }) +
      highlights +
    "</div></section>";
}

function renderStatsDashboard() {
  document.getElementById("statsApp").innerHTML = gamesStatsHTML() + booksStatsHTML();
  document.getElementById("collectionStat").innerText =
    `${allGames.length} oyun · ${allBooks.length} kitap`;
}

async function ensureStats() {
  const app = document.getElementById("statsApp");
  app.innerHTML = '<p class="results-meta">Yükleniyor…</p>';
  try {
    if (!gamesLoaded) { allGames = await loadGames(); gamesLoaded = true; setLibraryCounts(allGames); }
    if (!booksLoaded) { allBooks = await loadBooks(); booksLoaded = true; buildBookFilters(); }
    renderStatsDashboard();
  } catch (err) {
    app.innerHTML = '<div class="empty"><strong>İstatistik yüklenemedi</strong>' + esc(err.message) + "</div>";
  }
}

/* ============================================================
   GAME DETAIL VIEW
   ============================================================ */

function openGameDetail(g) {
  currentDetailGame = g;
  const cover = document.getElementById("gdCover");
  const full = g.image || "";
  cover.dataset.full = full;
  cover.src = full ? rawgImg(full, 600) : placeholderFor(g.name);
  cover.onerror = () => {
    if (cover.dataset.full && cover.src !== cover.dataset.full) {
      cover.src = cover.dataset.full;
    } else {
      cover.onerror = null;
      cover.src = placeholderFor(g.name);
    }
  };
  cover.alt = g.name || "";
  document.getElementById("gdTitle").innerText = g.name || "";

  const meta = [];
  const yr = g.released ? String(g.released).slice(0, 4) : null;
  if (yr) meta.push(`<span class="yr">${esc(yr)}</span>`);
  if (g.favorite) meta.push("★ Favori");
  if (g.played) meta.push("✔ Oynandı");
  document.getElementById("gdMeta").innerHTML = meta.map(m => `<span>${m}</span>`).join("");

  const genres = g.genres || [];
  document.getElementById("gdGenres").innerHTML =
    genres.map(x => `<span class="detail-genre">${esc(x)}</span>`).join("");

  document.getElementById("gdPlatforms").innerHTML = (g.copies || []).map(c =>
    `<span class="badge"><span class="dot ${isPlayStation(c.platform) ? "dot-ps" : "dot-pc"}"></span>${esc(copyLabel(c))}</span>`
  ).join("");

  const summary = (g.description || "").trim();
  const sumEl = document.getElementById("gdSummary");
  sumEl.innerText = summary || "Özet bilgisi yok. Düzenle ile ekleyebilirsin.";
  sumEl.classList.toggle("muted-text", !summary);

  const extra = [];
  if ((g.dlc || []).length) extra.push(`${g.dlc.length} DLC`);
  if ((g.edition || []).length) extra.push("Sürümler: " + g.edition.join(", "));
  document.getElementById("gdExtra").innerText = extra.join("   ·   ");

  document.getElementById("gdEditBtn").hidden = !isOwner();

  openModal("gameDetail");
}

/* ---- edit a game's metadata (fix wrong / missing info) ---- */

function openGameEdit() {
  const g = currentDetailGame;
  if (!g || !isOwner()) return;
  document.getElementById("eName").value = g.name || "";
  document.getElementById("eImage").value = g.image || "";
  document.getElementById("eReleased").value = g.released || "";
  document.getElementById("eGenres").value = (g.genres || []).join(", ");
  document.getElementById("eDescription").value = g.description || "";
  document.getElementById("editError").hidden = true;
  openModal("editModal");
}

async function submitEditGame() {
  const g = currentDetailGame;
  if (!g) return;
  const errEl = document.getElementById("editError");
  errEl.hidden = true;

  const name = document.getElementById("eName").value.trim();
  if (!name) { errEl.innerText = "Ad boş olamaz."; errEl.hidden = false; return; }

  const changes = {
    name,
    image: document.getElementById("eImage").value.trim(),
    released: document.getElementById("eReleased").value.trim(),
    genres: document.getElementById("eGenres").value.split(",").map(s => s.trim()).filter(Boolean),
    description: document.getElementById("eDescription").value.trim()
  };

  if (MODE === "supabase") {
    const { error } = await sb.from("games").update(changes).eq("id", g.id);
    if (error) { errEl.innerText = "Kaydedilemedi: " + error.message; errEl.hidden = false; return; }
  } else {
    dirty = true;
    updateSaveBar();
  }

  Object.assign(g, changes);
  renderStats();
  applyFilters();
  closeModal("editModal");
  openGameDetail(g);   // refresh the detail view with the new data
}
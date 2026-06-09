let allGames = [];

let state = {
  search: "",
  platforms: [],
  flags: [],        // "favorite", "played"
  sort: "none"
};

// ---------- LABELS ----------

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

// ---------- SELF-CONTAINED PLACEHOLDER (no external service) ----------

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

// ---------- PLATFORM MATCH ----------

function matchesPlatform(game, selected) {
  if (selected.length === 0) return true;
  return game.copies?.some(c =>
    selected.some(p => (p === "ps" ? isPlayStation(c.platform) : c.platform === p))
  );
}

function matchesFlags(game, flags) {
  return flags.every(f => game[f] === true);
}

// ---------- FIXED LIBRARY COUNTS (computed once) ----------

function setLibraryCounts(games) {
  let pc = 0, ps = 0;
  let platformSet = new Set();

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

// ---------- FILTER + SORT ----------

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

// ---------- STATS PANEL ----------

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

// ---------- EDITING (favorite / played) ----------

let dirty = false;

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

function toggleFlag(g, key) {
  g[key] = g[key] !== true;
  dirty = true;
  updateSaveBar();
  renderStats();
  applyFilters();   // keeps the view right if a flag filter is active
}

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

// ---------- RENDER ----------

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
    empty.innerHTML =
      "<strong>No games match</strong>Try clearing the search or filters.";
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();

  games.forEach(g => {
    const card = document.createElement("div");
    card.className = "card";

    // --- cover (positioned parent so the overlay stays on the art) ---
    const cover = document.createElement("div");
    cover.className = "cover";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = g.name || "Game cover";
    img.src = g.image || placeholderFor(g.name);
    img.onerror = () => {
      img.onerror = null;                 // guard against an infinite loop
      img.src = placeholderFor(g.name);
    };
    cover.appendChild(img);

    // toggle actions (favorite / played)
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(makeToggle(g, "favorite", "★", "favorite"));
    actions.appendChild(makeToggle(g, "played", "✔", "played"));
    cover.appendChild(actions);

    // hover overlay — full copy details + dlc + editions
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

    // --- info footer ---
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
      const label = document.createElement("span");
      label.innerText = platformLabel(c.platform);
      b.appendChild(dot);
      b.appendChild(label);
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

// ---------- LOAD (with error handling) ----------

fetch("games_enriched.json?v=" + Date.now())
  .then(res => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  })
  .then(games => {
    allGames = games;
    setLibraryCounts(allGames);   // fixed totals, computed once
    renderStats();
    applyFilters();
  })
  .catch(err => {
    document.getElementById("collectionStat").innerText = "Could not load library";
    const empty = document.getElementById("empty");
    empty.hidden = false;
    empty.innerHTML =
      "<strong>Couldn't load your games</strong>" +
      "Check that games_enriched.json sits next to index.html. (" + err.message + ")";
  });

// ---------- EVENTS ----------

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
    state.platforms = [...document.querySelectorAll("#platformFilters input:checked")]
      .map(c => c.value);
    applyFilters();
  });
});

document.querySelectorAll("#flagFilters input").forEach(cb => {
  cb.addEventListener("change", () => {
    state.flags = [...document.querySelectorAll("#flagFilters input:checked")]
      .map(c => c.value);
    applyFilters();
  });
});

document.getElementById("sort").addEventListener("change", e => {
  state.sort = e.target.value;
  applyFilters();
});

document.getElementById("saveBtn").addEventListener("click", saveChanges);
document.getElementById("discardBtn").addEventListener("click", () => location.reload());

window.addEventListener("beforeunload", e => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});
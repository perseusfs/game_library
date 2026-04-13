let allGames = [];

let state = {
  search: "",
  platforms: [],
  sort: "none"
};

// PLATFORM MATCH
function matchesPlatform(game, selectedPlatforms) {
  if (selectedPlatforms.length === 0) return true;

  return game.copies?.some(c =>
    selectedPlatforms.some(p => {
      if (p === "ps") return c.platform.startsWith("ps");
      return c.platform === p;
    })
  );
}

// PLATFORM ICON
function getPlatformIcon(p) {
  if (p === "pc") return "🖥️";
  if (p.startsWith("ps")) return "🎮";
  return "🎯";
}

// SOURCE ICON
function getSourceIcon(copy) {
  if (copy.type === "physical") return "📀";
  if (copy.store === "steam") return "🟦";
  if (copy.store === "epic") return "🟪";
  if (copy.store === "ps_store") return "🟥";
  return "⬜";
}

// PLATFORM COUNT (filtered)
function updatePlatformCounts(games) {
  const counts = { pc: 0, ps: 0 };

  games.forEach(g => {
    const platforms = g.copies?.map(c => c.platform) || [];

    if (platforms.includes("pc")) counts.pc++;
    if (platforms.some(p => p.startsWith("ps"))) counts.ps++;
  });

  document.getElementById("count-pc").innerText = counts.pc;
  document.getElementById("count-ps").innerText = counts.ps;
}

// FILTER + SORT
function applyFilters() {
  let games = [...allGames];

  if (state.search) {
    games = games.filter(g =>
      (g.name || "").toLowerCase().includes(state.search)
    );
  }

  games = games.filter(g => matchesPlatform(g, state.platforms));

  switch (state.sort) {
    case "score_desc":
      games.sort((a, b) => (b.score || 0) - (a.score || 0));
      break;
    case "score_asc":
      games.sort((a, b) => (a.score || 0) - (b.score || 0));
      break;
    case "name_asc":
      games.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name_desc":
      games.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }

  updatePlatformCounts(games);
  render(games);
}

// RENDER
function render(games) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  games.forEach(g => {
    const card = document.createElement("div");
    card.className = "card";

    // IMAGE
    const img = document.createElement("img");
    img.src = g.image || "https://via.placeholder.com/200x260";

    // OVERLAY
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    if (g.copies) {
      const grouped = groupCopiesByPlatform(g.copies);

      const lines = Object.entries(grouped).map(([platform, sources]) => {
        const uniqueSources = [...new Set(sources)];
        return `${platform}: ${uniqueSources.join(", ")}`;
      });

      const p = document.createElement("span");
      p.innerText = lines.join(" | ");
      overlay.appendChild(p);
    }

    if (g.dlc && g.dlc.length > 0) {
      const d = document.createElement("span");
      d.innerText = "DLC: " + g.dlc.length;
      overlay.appendChild(d);
    }

    if (g.edition && g.edition.length > 0) {
      const e = document.createElement("span");
      e.innerText = "Edition: " + g.edition.join(", ");
      overlay.appendChild(e);
    }

    if (g.score === null || g.score === undefined) {
      const s = document.createElement("span");
      s.innerText = "No score";
      overlay.appendChild(s);
    }

    if (overlay.children.length > 0) {
      card.appendChild(overlay);
    }

    // INFO
    const info = document.createElement("div");
    info.className = "info";

    const title = document.createElement("div");
    title.className = "title";
    title.innerText = g.name;

    const score = document.createElement("div");
    score.className = "score";
    score.innerText = g.score ? "★ " + g.score : "";

    const badges = document.createElement("div");
    badges.className = "badges";

    // COPY BASED BADGES (FIXED)
    if (g.copies) {
      const grouped = groupCopiesByPlatform(g.copies);

      Object.entries(grouped).forEach(([platform, sources]) => {
        const b = document.createElement("span");
        b.className = "badge";

        const icon = getPlatformIcon(platform);

        // duplicate source temizle
        const uniqueSources = [...new Set(sources)];

        b.innerText = `${icon} ${platform} → ${uniqueSources.join(", ")}`;

        badges.appendChild(b);
      });
    }

    info.appendChild(title);
    info.appendChild(score);
    info.appendChild(badges);

    card.appendChild(img);
    card.appendChild(info);

    app.appendChild(card);
  });
}

function groupCopiesByPlatform(copies) {
  const map = {};

  copies.forEach(c => {
    if (!map[c.platform]) {
      map[c.platform] = [];
    }

    if (c.type === "physical") {
      map[c.platform].push("disc");
    } else if (c.store) {
      map[c.platform].push(c.store);
    }
  });

  return map;
}

// LOAD
fetch("games_enriched.json")
  .then(res => res.json())
  .then(games => {
    allGames = games;
    applyFilters();
  });

// EVENTS

document.getElementById("search").addEventListener("input", e => {
  state.search = e.target.value.toLowerCase();
  applyFilters();
});

document.querySelectorAll("#platformFilters input")
  .forEach(cb => {
    cb.addEventListener("change", () => {
      const selected = [];

      document.querySelectorAll("#platformFilters input:checked")
        .forEach(c => selected.push(c.value));

      state.platforms = selected;
      applyFilters();
    });
  });

document.getElementById("sort").addEventListener("change", e => {
  state.sort = e.target.value;
  applyFilters();
});
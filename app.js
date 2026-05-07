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

// PLATFORM COUNT
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

    // TOP ICONS
    const topIcons = document.createElement("div");
    topIcons.className = "top-icons";

    if (g.favorite === true) {
      const fav = document.createElement("span");
      fav.innerText = "⭐";
      topIcons.appendChild(fav);
    }

    if (g.played === true) {
      const played = document.createElement("span");
      played.innerText = "✔";
      topIcons.appendChild(played);
    }

    card.appendChild(topIcons);

    // IMAGE
    const img = document.createElement("img");
    img.src = g.image || "https://via.placeholder.com/200x260";

    // OVERLAY
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    if (g.copies) {
      const lines = g.copies.map(c => {
        let txt = c.platform;

        if (c.type === "physical") {
          txt += " (disc)";
        } else if (c.store) {
          txt += " (" + c.store + ")";
        }

        return txt;
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

    if (overlay.children.length > 0) {
      card.appendChild(overlay);
    }

    // INFO
    const info = document.createElement("div");
    info.className = "info";

    // TITLE
    const title = document.createElement("div");
    title.className = "title";
    title.innerText = g.name;

    // BADGES
    const badges = document.createElement("div");
    badges.className = "badges";

    if (g.copies) {
      g.copies.forEach(c => {
        const b = document.createElement("span");
        b.className = "badge";

        const icon = getPlatformIcon(c.platform);

        let label = c.platform;

        if (c.type === "physical") {
          label += " (disc)";
        } else if (c.store) {
          label += " (" + c.store + ")";
        }

        b.innerText = `${icon} ${label}`;

        badges.appendChild(b);
      });
    }

    info.appendChild(title);
    info.appendChild(badges);

    card.appendChild(img);
    card.appendChild(info);

    app.appendChild(card);
  });
}

// LOAD
fetch("games_enriched.json?v=" + Date.now())
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
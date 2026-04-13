import json

FILES = {
    "physical_library": "pc",
}

games = []

for file, platform in FILES.items():
    with open(file, "r", encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if not name:
                continue

            games.append({
                "name": name,
                "copies": [
                    {"platform": "pc",
                     "type": "physical"}
                ],
                "dlc": [],
                "edition": None,
                "image": None,
                "score": None
            })

with open("games_test.json", "w", encoding="utf-8") as f:
    json.dump(games, f, indent=2, ensure_ascii=False)

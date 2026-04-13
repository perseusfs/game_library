import json
import requests
import time
import re

API_KEY = "ebf8bd3e27574feeb94ca681f2a00a91"

suspicious = []

def normalize(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def fetch_from_rawg(slug):
    url = "https://api.rawg.io/api/games"

    query = slug.replace("-", " ")

    params = {
        "key": API_KEY,
        "search": query,
        "page_size": 1
    }

    try:
        res = requests.get(url, params=params)
        data = res.json()

        if data.get("results"):
            game = data["results"][0]

            name = game.get("name", "")

            query_clean = normalize(query)
            name_clean = normalize(name)

            # iki yönlü kontrol (daha doğru)
            if query_clean not in name_clean and name_clean not in query_clean:
                print(f"[ŞÜPHELİ] {query} -> {name}")

                suspicious.append({
                    "slug": slug,
                    "query": query,
                    "found": name
                })

            return game.get("background_image"), game.get("metacritic")

    except Exception as e:
        print("HATA:", e)

    return None, None


# JSON oku
with open("games_slugified.json", "r", encoding="utf-8") as f:
    games = json.load(f)


for i, g in enumerate(games):
    if g.get("image") and g.get("score"):
        continue

    print(f"[{i+1}/{len(games)}] {g['name']}")

    image, score = fetch_from_rawg(g["id"])

    g["image"] = image
    g["score"] = score

    time.sleep(1)


# kaydet
with open("../games_enriched.json", "w", encoding="utf-8") as f:
    json.dump(games, f, indent=2, ensure_ascii=False)


# şüphelileri en sonda bas
print("\n=== ŞÜPHELİLER ===")
for s in suspicious:
    print(f"{s['slug']} -> {s['found']}")

print("Bitti.")
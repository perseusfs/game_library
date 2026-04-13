
import requests
import time

API_KEY = "ebf8bd3e27574feeb94ca681f2a00a91"

# senin verdiğin liste
games = [
    "assassin’s creed iv: black flag",
    "god of war ragnarök"
    "marvel's spider-man: miles morales",
    "uncharted 2: among thieves",
    "divine knockout",
    "marvel's spider-man",
    "half-life 2: downfall",
    "half-life 2: update",
    "half-life 2",
    "half-life",
    "ball 3d: soccer online",
    "age of history 2",
    "observеr",
    "braveland",
    "counter-strike: global offensive",
    "mount & blade: warband",
    "total war saga: troy",
    "superbrothers: sword & sworcery",
    "borderlands: the pre-sequel",
    "scooby-doo! two: monsters unleashed",
    "hugo: the evil mirror",
    "call of duty: black ops"
]

def fetch(name):
    url = "https://api.rawg.io/api/games"

    params = {
        "key": API_KEY,
        "search": name,
        "page_size": 1
    }

    res = requests.get(url, params=params)
    data = res.json()

    if data.get("results"):
        g = data["results"][0]

        return {
            "query": name,
            "found": g.get("name"),
            "image": g.get("background_image"),
            "score": g.get("metacritic")
        }

    return {
        "query": name,
        "found": None,
        "image": None,
        "score": None
    }


for g in games:
    result = fetch(g)

    print("QUERY:", result["query"])
    print("FOUND:", result["found"])
    print("SCORE:", result["score"])
    print("IMAGE:", result["image"])
    print("-" * 40)

    time.sleep(1)
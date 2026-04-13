from bs4 import BeautifulSoup

with open("steam_history.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

games = []

rows = soup.find_all("tr")

for row in rows:
    cols = row.find_all("td")

    # header row'u atla
    if len(cols) < 2:
        continue

    product_td = cols[1]

    # içindeki "Kaldır" div'lerini temizle
    for div in product_td.find_all("div"):
        div.decompose()

    game_name = product_td.get_text(strip=True)

    if game_name:
        games.append(game_name)

for game in games:
    print(game)
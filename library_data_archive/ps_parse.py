from bs4 import BeautifulSoup

with open("ps_history.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

games = []

for card in soup.find_all("div", class_="transaction-history-card"):
    description_span = card.find("span", class_="transaction-history-card-content-description")
    if description_span:
        game_name_span = description_span.find("span", class_="transaction-history-card-details-field")
        if game_name_span:
            # text al ve virgüllere göre ayır
            names = [name.strip() for name in game_name_span.get_text().split(",")]
            games.extend(names)

for game in games:
    if "Üyelik" in game or "Cüzdan" in game or "Aylık" in game:
        pass
    else:
        print(game)
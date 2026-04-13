import json

# dosyayı oku
with open("../games_enriched.json", "r", encoding="utf-8") as f:
    data = json.load(f)


for i in data:
    if i["image"] == None:
        print(i["name"])


# geri yaz
#with open("games_slugified.json", "w", encoding="utf-8") as f:
#    json.dump(data, f, indent=2, ensure_ascii=False)


""" bu aşağıdakilerin görseli ve puanı yok

My First Gran Turismo
Bus Driving Simulator EVO
World of Tanks Modern Armor
ENFYNYTY SANDBOX
Buggy Game
Business Tour - Online Multiplayer Board Game
Skillshot City
SAMURAI SHODOWN V Perfect
spider man 2
world tours 2 golf
bundesliga manager X elfmeter
vr world cup soccer tournament
toyota trafik oyunu
zombex
botonoid
west bang
baga
fish's revenge
chicken run
elimination - justin hoffman
hibis domino 1.99 - karibicom
puzznic - michael heyduk
quadragon - paul wlodarski
rockfall - tim and andy
sokoban 2k - brian kent
toyland racing
Farcry 3
"""
with open("epic_history.txt", "r", encoding="utf-8") as f:
    txt = f.readlines()
cnt = 1
for i in txt:
    if "DescriptionPurchased" in i:
        print(i.split("DescriptionPurchased")[1])
        cnt += 1

#print(cnt)
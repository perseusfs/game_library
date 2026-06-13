"""
db_to_json.py
-------------
Turns your local SQLite book database into books.json — the file the unified
library app loads in local (offline) mode.

    python db_to_json.py                       # reads books.db -> books.json
    python db_to_json.py --source books.db --dest books.json

Your .db file is only read, never changed.
"""
import argparse, json, sqlite3
from datetime import datetime

COLS = ["title", "author", "publisher", "field", "genre", "shelf_id",
        "pages", "publication_year", "original_language",
        "is_favorite", "is_read", "date_added"]

def parse_year(value):
    s = str(value or "").strip()
    body = s[1:] if s.startswith("-") else s
    if not body.isdigit():
        return None
    n = int(s)
    return n if -9999 <= n <= 9999 else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="books.db")
    ap.add_argument("--dest", default="books.json")
    args = ap.parse_args()

    conn = sqlite3.connect(args.source)
    conn.row_factory = sqlite3.Row
    have = {r[1] for r in conn.execute("PRAGMA table_info(Books)")}
    rows = conn.execute("SELECT * FROM Books").fetchall()
    conn.close()

    out = []
    for i, r in enumerate(rows, start=1):
        b = {c: (r[c] if c in have else None) for c in COLS}
        b["id"] = r["id"] if "id" in have else i
        b["pages"] = int(b["pages"] or 0)
        b["is_favorite"] = int(b["is_favorite"] or 0)
        b["is_read"] = int(b["is_read"] or 0)
        b["date_added"] = b["date_added"] or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        b["year_num"] = parse_year(b["publication_year"])
        out.append(b)

    with open(args.dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(out)} books -> {args.dest}")

if __name__ == "__main__":
    main()
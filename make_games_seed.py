"""
make_games_seed.py
------------------
Builds supabase_seed.sql from your (enriched) games_enriched.json.

Unlike the first seed, this one UPSERTS: it inserts new games and, for games
already online, updates the metadata columns — including the enriched
released / description / genres — WITHOUT touching favorite/played, so any
stars or "played" marks you toggled on the live site are preserved.

    python make_games_seed.py            # games_enriched.json -> supabase_seed.sql

Run supabase_setup.sql first (it adds the released/description/genres columns),
then paste the generated supabase_seed.sql into the SQL Editor and Run.
"""
import argparse, json

def s(v):
    if v is None: return "null"
    return "'" + str(v).replace("'", "''") + "'"

def j(v):
    return "'" + json.dumps(v or [], ensure_ascii=False).replace("'", "''") + "'::jsonb"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="games_enriched.json")
    ap.add_argument("--out", default="supabase_seed.sql")
    args = ap.parse_args()

    games = json.load(open(args.file, encoding="utf-8"))
    rows = []
    for g in games:
        rows.append("({})".format(", ".join([
            s(g.get("id")), s(g.get("name")),
            j(g.get("copies")), j(g.get("dlc")), j(g.get("edition")),
            s(g.get("image")),
            s(g.get("released", "")), s(g.get("description", "")), j(g.get("genres")),
            "true" if g.get("favorite") else "false",
            "true" if g.get("played") else "false",
        ])))

    header = (
        "-- ============================================================\n"
        f"--  Game Library — seed ({len(games)} games, with enriched fields)\n"
        "--  Run AFTER supabase_setup.sql. Safe to re-run.\n"
        "--  Upserts metadata; keeps favorite/played you set online.\n"
        "-- ============================================================\n\n"
        "insert into public.games\n"
        "  (id, name, copies, dlc, edition, image, released, description, genres, favorite, played)\n"
        "values\n"
    )
    on_conflict = (
        "\non conflict (id) do update set\n"
        "  name        = excluded.name,\n"
        "  copies      = excluded.copies,\n"
        "  dlc         = excluded.dlc,\n"
        "  edition     = excluded.edition,\n"
        "  image       = excluded.image,\n"
        "  released    = excluded.released,\n"
        "  description = excluded.description,\n"
        "  genres      = excluded.genres;\n"
    )
    open(args.out, "w", encoding="utf-8").write(header + ",\n".join(rows) + on_conflict)
    enriched = sum(1 for g in games if (g.get("description") or "").strip())
    print(f"Wrote {len(games)} games -> {args.out}  ({enriched} have a summary)")

if __name__ == "__main__":
    main()
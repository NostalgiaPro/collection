#!/usr/bin/env python3
"""Sync new GameEye (thenostalgiapro) owned games into the site shelf.

Reads the public GameEye collection API, compares against
tools/data/gameye_baseline.json, and inserts only brand-new game ids into the
RAW shelf in index.html (and mirrored RAW copies). Never removes games from
the site; disappearances are flagged in tools/data/gameye_removed_flags.json.

Usage:
  python3 tools/gameye_sync.py              # live sync (writes files)
  python3 tools/gameye_sync.py --dry-run    # report only, no writes
  python3 tools/gameye_sync.py --seed       # (re)build baseline from live API + site RAW
  python3 tools/gameye_sync.py --simulate-new "Title|Nintendo Switch"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "tools", "data")
BASELINE_PATH = os.path.join(DATA, "gameye_baseline.json")
REMOVED_PATH = os.path.join(DATA, "gameye_removed_flags.json")
PENDING_PATH = os.path.join(DATA, "gameye_pending_new.json")
STATE_PATH = os.path.join(DATA, "gameye_sync_state.json")

USERNAME = "thenostalgiapro"
API = "https://www.gameye.app/api/user_collection_search/" + USERNAME
UA = (
    "NostalgiaProGameyeSync/1.0 (+https://thenostalgiapro.com; daily shelf sync)"
)

# GameEye platform_id -> site ## system section.
# NES/Famicom (7): default NES; Famicom Metal Gear is remapped by title.
# Switch 2 (178): no site section; matched as cross-system variant when seeding.
PLATFORM_MAP = {
    7: "NES",
    6: "SNES",
    3: "Nintendo 64",
    2: "GameCube",
    4: "Game Boy",
    39: "Game Boy Color",
    8: "Nintendo DS",
    41: "Nintendo 3DS",
    9: "Wii",
    97: "Nintendo Switch",
    10: "PlayStation 1",
    11: "PlayStation 2",
    12: "PlayStation 3",
    13: "PSP",
    46: "PlayStation 4",
    14: "Xbox",
    15: "Xbox 360",
    47: "Xbox One",
    106: "Xbox Series X/S",
    18: "Sega Genesis",
    16: "Sega Dreamcast",
    17: "Sega Saturn",
    34: "Sega Master System",
    26: "Atari 7800+",
    31: "Intellivision",
    152: "Arcade1Up",
    1: "PC",
}

# Files that embed a const RAW = `...` shelf copy. Only production pages.
RAW_FILES = ["index.html", "stats.html", "consoles.html"]

# Condition for auto-added lines. Site parser falls back to "unknown" if missing;
# we use an explicit neutral label that renders as dim text and counts as loose.
AUTO_COND = "owned"

MIN_FRACTION = 0.90  # refuse to sync if API game count < 90% of last good


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def nkey(t: str) -> str:
    t = fold(t)
    # Turn [Subtitle] / (Subtitle) into plain words so "Battlefield 4 [China Rising
    # Expansion Pack]" matches the site's colon form. Short edition tags are
    # stripped later in soft().
    t = re.sub(r"[\[\(]", " ", t)
    t = re.sub(r"[\]\)]", " ", t)
    t = re.sub(r"^the\s+", "", t)
    t = re.sub(r"^disney'?s?\s+", "", t)
    t = t.replace("™", "").replace("®", "").replace(":", " ")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def soft(t: str) -> str:
    t = nkey(t)
    t = re.sub(r"\bii\b", "2", t)
    t = re.sub(r"\biii\b", "3", t)
    t = re.sub(r"\biv\b", "4", t)
    t = t.replace("teenage mutant ninja turtles", "tmnt")
    t = re.sub(
        r"\b(arcade machine|arcade1up|signature edition|limited edition|"
        r"playstation hits|expansion pack)\b",
        "",
        t,
    )
    return re.sub(r"\s+", " ", t).strip()


def http_get(url: str, params: dict | None = None) -> dict:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Referer": f"https://www.gameye.app/user/{USERNAME}/library",
            "Origin": "https://www.gameye.app",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_collection() -> tuple[list[dict], list[dict], int]:
    """Return (records, user_data, full_count) for the whole library."""
    all_rec: list[dict] = []
    all_ud: list[dict] = []
    offset = 0
    limit = 100
    full = None
    while True:
        data = http_get(
            API,
            {
                "offset": offset,
                "limit": limit,
                "order": 0,
                "asc": 1,
                "collection_type": 0,
            },
        )
        if full is None:
            full = int(data.get("full_count") or 0)
        recs = data.get("records") or []
        ud = data.get("user_data") or []
        if not recs:
            break
        all_rec.extend(recs)
        all_ud.extend(ud)
        offset += len(recs)
        if full and offset >= full:
            break
        if len(recs) < limit:
            break
        time.sleep(0.2)
    return all_rec, all_ud, full or len(all_rec)


def read_site_games(html: str) -> list[dict]:
    m = re.search(r"const RAW = `([\s\S]*?)`;", html)
    if not m:
        raise SystemExit("RAW block not found in index.html")
    games = []
    cur = None
    for line in m.group(1).split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("## "):
            cur = line[3:].strip()
            continue
        mm = re.match(r"^(.*)\s\(([^()]*)\)$", line)
        title = mm.group(1).strip() if mm else line
        cond = mm.group(2).strip() if mm else "unknown"
        games.append(
            {
                "system": cur,
                "title": title,
                "cond": cond,
                "nkey": nkey(title),
                "soft": soft(title),
            }
        )
    return games


def index_site(games: list[dict]):
    by_nkey = defaultdict(dict)
    by_soft = defaultdict(dict)
    by_sys = defaultdict(list)
    for g in games:
        by_nkey[g["system"]][g["nkey"]] = g
        by_soft[g["system"]][g["soft"]] = g
        by_sys[g["system"]].append(g)
    return by_nkey, by_soft, by_sys


def find_hit(sys: str, nk: str, sk: str, by_nkey, by_soft, by_sys):
    """Match a GameEye title to a site game in one system. Prefer exact keys."""
    if nk in by_nkey[sys]:
        g = by_nkey[sys][nk]
        return g, "exact" if g["nkey"] == nk else "variant"
    if sk in by_soft[sys]:
        return by_soft[sys][sk], "variant"
    # Whole-word prefix only when the shorter key has >= 3 tokens
    # (covers Chip 'n Dale vs Chip 'n Dale: Rescue Rangers) and does NOT
    # match Legend of Zelda -> Legend of Zelda: Ocarina of Time loosely
    # across unrelated entries without the longer title existing.
    for g in by_sys[sys]:
        a, b = g["soft"], sk
        if not a or not b or a == b:
            continue
        shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
        if longer.startswith(shorter + " "):
            st = shorter.split()
            if len(st) >= 3:
                return g, "variant"
    return None, None


def map_system(pid: int, title: str, famicom_nkeys: set[str]) -> str | None:
    if pid == 7 and nkey(title) in famicom_nkeys:
        return "Famicom"
    if pid == 178:
        return None  # Switch 2: no section
    return PLATFORM_MAP.get(pid)


def load_json(path: str, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def insert_raw_line(raw: str, system: str, title: str, cond: str) -> str:
    """Insert 'Title (cond)' under ## system, alphabetically by title."""
    lines = raw.split("\n")
    header = "## " + system
    try:
        h = lines.index(header)
    except ValueError:
        # Append a new system section at the end (should not happen for mapped ids)
        if lines and lines[-1].strip():
            lines.append("")
        lines.append(header)
        lines.append(f"{title} ({cond})")
        return "\n".join(lines)
    i = h + 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith("## "):
        mm = re.match(r"^(.*)\s\(([^()]*)\)$", lines[i].strip())
        existing = mm.group(1).strip() if mm else lines[i].strip()
        if existing.lower() > title.lower():
            break
        # already present (same title, any condition) — skip insert
        if existing.lower() == title.lower():
            return raw
        i += 1
    lines.insert(i, f"{title} ({cond})")
    return "\n".join(lines)


def rewrite_raw_in_file(path: str, system: str, title: str, cond: str) -> bool:
    full = os.path.join(ROOT, path)
    text = open(full, encoding="utf-8").read()
    m = re.search(r"const RAW = `([\s\S]*?)`;", text)
    if not m:
        return False
    new_raw = insert_raw_line(m.group(1), system, title, cond)
    if new_raw == m.group(1):
        return False
    text = text[: m.start(1)] + new_raw + text[m.end(1) :]
    open(full, "w", encoding="utf-8").write(text)
    return True



def seed_baseline(records, user_data, site_games, dry_run: bool) -> dict:
    by_nkey, by_soft, by_sys = index_site(site_games)
    famicom_nkeys = {g["nkey"] for g in site_games if g["system"] == "Famicom"}
    items = []
    variants = []
    pending = []
    for r, u in zip(records, user_data):
        if r.get("category_id") != 0:
            continue
        pid = r["platform_id"]
        title = r["title"]
        uuid = u["uuid"]
        item_id = r["id"]
        nk, sk = nkey(title), soft(title)
        sys_name = map_system(pid, title, famicom_nkeys)

        hit = kind = None
        if sys_name is None:
            # Switch 2 or unknown: exact soft/nkey across all systems first
            for s in by_sys:
                if nk in by_nkey[s]:
                    hit, kind, sys_name = by_nkey[s][nk], "variant-cross-system", s
                    break
                if sk in by_soft[s]:
                    hit, kind, sys_name = by_soft[s][sk], "variant-cross-system", s
                    break
            if not hit:
                pending.append(
                    {
                        "uuid": uuid,
                        "item_id": item_id,
                        "title": title,
                        "platform_id": pid,
                        "mapped_system": "Switch 2 (no site section)"
                        if pid == 178
                        else f"unmapped platform_id {pid}",
                    }
                )
                continue
        else:
            hit, kind = find_hit(sys_name, nk, sk, by_nkey, by_soft, by_sys)
            if not hit and pid == 7:
                hit, kind = find_hit("Famicom", nk, sk, by_nkey, by_soft, by_sys)
                if hit:
                    sys_name = "Famicom"
            if not hit:
                pending.append(
                    {
                        "uuid": uuid,
                        "item_id": item_id,
                        "title": title,
                        "platform_id": pid,
                        "mapped_system": sys_name,
                    }
                )
                continue

        entry = {
            "uuid": uuid,
            "item_id": item_id,
            "ge_title": title,
            "ge_platform_id": pid,
            "site_system": sys_name,
            "site_title": hit["title"],
            "kind": kind or "exact",
        }
        items.append(
            {
                "uuid": uuid,
                "item_id": item_id,
                "site_system": sys_name,
                "site_title": hit["title"],
                "ge_title": title,
                "ge_platform_id": pid,
            }
        )
        if entry["kind"] != "exact":
            variants.append(entry)

    baseline = {
        "username": USERNAME,
        "seeded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "items": items,
        "uuids": sorted({i["uuid"] for i in items}),
        "item_ids": sorted({i["item_id"] for i in items}),
        "variant_count": len(variants),
        "variants": variants,
    }
    pending_doc = {
        "updated_at": baseline["seeded_at"],
        "note": "Games on GameEye not yet on the site. Confirm to add.",
        "pending": pending,
    }
    print(
        f"seed: baseline={len(items)} variants={len(variants)} pending={len(pending)}"
    )
    for v in variants:
        print(
            f"  variant [{v['site_system']}] GE={v['ge_title']!r} -> SITE={v['site_title']!r}"
        )
    for p in pending:
        print(f"  pending [{p['mapped_system']}] {p['title']}")
    if not dry_run:
        save_json(BASELINE_PATH, baseline)
        save_json(PENDING_PATH, pending_doc)
    return baseline


def sync(dry_run: bool = False, simulate: str | None = None) -> int:
    records, user_data, full = fetch_collection()
    games = [
        (r, u)
        for r, u in zip(records, user_data)
        if r.get("category_id") == 0
    ]
    game_count = len(games)
    print(f"api full_count={full} games={game_count}")

    state = load_json(STATE_PATH, {})
    prev = state.get("last_good_game_count")
    if prev and game_count < prev * MIN_FRACTION:
        print(
            f"refusing: game_count {game_count} < {MIN_FRACTION:.0%} of last good {prev}"
        )
        return 2
    if game_count < 100:
        print(f"refusing: suspiciously small game_count {game_count}")
        return 2

    baseline = load_json(BASELINE_PATH, None)
    if baseline is None:
        print("no baseline; run with --seed first")
        return 1

    known = set(baseline.get("uuids") or [])
    # Also accept item_id as secondary key
    known_ids = set(baseline.get("item_ids") or [])

    famicom_nkeys = {
        g["nkey"]
        for g in read_site_games(open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())
        if g["system"] == "Famicom"
    }

    # Simulate a brand-new GameEye item for local testing
    if simulate:
        title, sys_name = simulate.split("|", 1)
        fake_uuid = "simulate-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        games.append(
            (
                {
                    "id": -1,
                    "category_id": 0,
                    "platform_id": 97 if sys_name == "Nintendo Switch" else 7,
                    "title": title,
                },
                {"uuid": fake_uuid, "ownership_mask": 0, "user_record_type": 0},
            )
        )
        # Force platform map via synthetic: we'll use sys_name directly below

    new_items = []
    current_uuids = set()
    for r, u in games:
        uuid = u["uuid"]
        current_uuids.add(uuid)
        if uuid in known or r["id"] in known_ids:
            continue
        if simulate and uuid.startswith("simulate-"):
            title = r["title"]
            sys_name = simulate.split("|", 1)[1]
        else:
            title = r["title"]
            sys_name = map_system(r["platform_id"], title, famicom_nkeys)
            if sys_name is None:
                # Unmapped platform (e.g. Switch 2) — leave for pending, don't auto-add
                pending = load_json(PENDING_PATH, {"pending": []})
                pending.setdefault("pending", [])
                if not any(p.get("uuid") == uuid for p in pending["pending"]):
                    pending["pending"].append(
                        {
                            "uuid": uuid,
                            "item_id": r["id"],
                            "title": title,
                            "platform_id": r["platform_id"],
                            "mapped_system": f"unmapped platform_id {r['platform_id']}",
                        }
                    )
                    pending["updated_at"] = datetime.now(timezone.utc).strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    )
                    if not dry_run:
                        save_json(PENDING_PATH, pending)
                    print(f"pending (unmapped platform): {title}")
                continue
        new_items.append(
            {
                "uuid": uuid,
                "item_id": r["id"],
                "title": title,
                "system": sys_name,
                "ge_platform_id": r.get("platform_id"),
            }
        )

    # Flag removals (in baseline, missing from API) — never delete from site
    removed = [
        it
        for it in baseline.get("items") or []
        if it["uuid"] not in current_uuids and not str(it["uuid"]).startswith("simulate-")
    ]
    if removed:
        flags = load_json(REMOVED_PATH, {"flags": []})
        existing = {f["uuid"] for f in flags.get("flags") or []}
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for it in removed:
            if it["uuid"] in existing:
                continue
            flags.setdefault("flags", []).append(
                {
                    "uuid": it["uuid"],
                    "item_id": it.get("item_id"),
                    "ge_title": it.get("ge_title"),
                    "site_system": it.get("site_system"),
                    "site_title": it.get("site_title"),
                    "flagged_at": now,
                    "note": "Missing from GameEye library; left on site.",
                }
            )
        flags["updated_at"] = now
        print(f"flagged removed (not deleting): {len(removed)}")
        if not dry_run:
            save_json(REMOVED_PATH, flags)

    if not new_items:
        print("no new games to add")
        if not dry_run:
            state["last_good_game_count"] = game_count
            state["last_run"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            state["last_result"] = "noop"
            save_json(STATE_PATH, state)
        return 0

    print(f"adding {len(new_items)} new game(s):")
    for it in new_items:
        print(f"  [{it['system']}] {it['title']} ({AUTO_COND})")

    if dry_run:
        return 0

    changed = False
    for it in new_items:
        for path in RAW_FILES:
            if rewrite_raw_in_file(path, it["system"], it["title"], AUTO_COND):
                changed = True
                print(f"  wrote RAW in {path}")
        baseline.setdefault("items", []).append(
            {
                "uuid": it["uuid"],
                "item_id": it["item_id"],
                "site_system": it["system"],
                "site_title": it["title"],
                "ge_title": it["title"],
                "ge_platform_id": it.get("ge_platform_id"),
            }
        )
        baseline.setdefault("uuids", [])
        baseline.setdefault("item_ids", [])
        if it["uuid"] not in baseline["uuids"]:
            baseline["uuids"].append(it["uuid"])
        if it["item_id"] not in baseline["item_ids"] and it["item_id"] != -1:
            baseline["item_ids"].append(it["item_id"])

    baseline["uuids"] = sorted(set(baseline["uuids"]))
    baseline["item_ids"] = sorted(set(baseline["item_ids"]))
    baseline["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_json(BASELINE_PATH, baseline)

    if changed:
        print("running tools/build_daily.py")
        import subprocess

        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "tools", "build_daily.py")],
            cwd=ROOT,
        )
        if r.returncode != 0:
            print("build_daily failed", r.returncode)
            return r.returncode

    state["last_good_game_count"] = game_count
    state["last_run"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state["last_result"] = f"added {len(new_items)}"
    save_json(STATE_PATH, state)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed", action="store_true", help="(re)build baseline + pending")
    ap.add_argument(
        "--simulate-new",
        metavar="Title|System",
        help='Local test: pretend GameEye has this new title (e.g. "Fake Test Game|Nintendo Switch")',
    )
    args = ap.parse_args()

    try:
        records, user_data, full = fetch_collection()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print(f"API HTTP {e.code}: {body[:200]}")
        return 2
    except Exception as e:
        print(f"API error: {e}")
        return 2

    site = read_site_games(
        open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    )
    games_n = sum(1 for r in records if r.get("category_id") == 0)
    print(f"fetched full_count={full} games={games_n} site_games={len(site)}")

    if args.seed:
        seed_baseline(records, user_data, site, dry_run=args.dry_run)
        # Also record last good count
        if not args.dry_run:
            save_json(
                STATE_PATH,
                {
                    "last_good_game_count": games_n,
                    "last_run": datetime.now(timezone.utc).strftime(
                        "%Y-%m-%dT%H:%M:%SZ"
                    ),
                    "last_result": "seeded",
                },
            )
        return 0

    # Re-fetch inside sync; pass simulate through
    return sync(dry_run=args.dry_run, simulate=args.simulate_new)


if __name__ == "__main__":
    raise SystemExit(main())

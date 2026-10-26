#!/usr/bin/env python3
"""Find ranking posts in RC's X posts and add them to lists.html.

    python3 tools/import_x_rankings.py new_posts.json   # merge new posts, then import
    python3 tools/import_x_rankings.py                  # just re-check what's already saved
    python3 tools/import_x_rankings.py --dry-run [...]  # show what it would add, change nothing

new_posts.json is a JSON list of posts, each {"id", "created_at", "text"}, plus
"reply_to" (id of the post it replies to) when it is a reply in one of RC's
own threads. ("in_reply_to_user_id"/"referenced_tweets" from the X API also
work.) Posts are merged into tools/data/x_posts.json, so a thread whose
replies arrive on a later day still gets put together.

Safe to run every day: tools/data/x_rankings_imported.json records every
post id already handled ("imported", or "on_page" when the same list was
already on lists.html), and those are never added twice. Put an id in
"rejected" in that file to stop a post from ever being imported (e.g. after
deleting a false positive from lists.html). Put a title in "titles" to use
it instead of the one worked out from the post.

HOW A POST IS RECOGNISED AS A RANKING (all of these must hold)
 1. It starts a thread (not a reply), and says it's a ranking: "top N",
    "N best", "best N", "best and worst", "tier list"/"tier ranking" or
    "ranked" (N as digits or a word, up to twenty). Posts that say "not a
    ranking" are skipped.
 2. The items can be read off the post in one of these shapes:
    a. "Best: X" and "Worst: Y" lines             -> labels Best / Worst
    b. replies in the thread starting "S tier:" etc. -> labels S, A, B...
    c. numbered lines in the post, "1. X" "2. Y"... (3 or more, no gaps)
    d. thread replies whose first line is "10. X", "9. Y" ... down to 1
       (every number from 1 to N present)
    e. right under the "top N" line, N short lines (or one line with N
       comma-separated names), with no full stops
 3. If the post states a number ("top 10"), exactly that many items were
    found. A thread still being posted therefore waits until it's complete.
Item names are kept as written. "(SNES)" or ", Sega Genesis (1994)" after
a name becomes the system; otherwise the system comes from the shelf (if the
name is on exactly one system) or from the list's title ("N64 games").
A list is marked solo (not counted as single games) when its title is about
movies, music, TV, franchises, series, trilogies or consoles, or when fewer
than half its items are on the shelf and the title doesn't say "games".

KNOWN FALSE-POSITIVE RISKS
 - A reply-style post that happens to number things ("My top 5: 1. ...")
   in answer to someone else's grid or question is imported as a list.
   Its items can be comments, not titles ("3. Missing Star Wars Racer,
   unfortunately"). Such posts are skipped only if they're in "rejected".
 - Numbered non-ranking lists ("Top 5 things I'd change about...") pass
   if the phrase test matches; the same goes for top-N lists of things
   that aren't games, which are marked solo but still added.
 - Shape (e) can pick up N short lines that aren't the list if the post
   is laid out oddly. The count check makes this rare.
 - Image-only rankings (a tier list picture with no text) are never found.
 - The same list posted twice (an anniversary repost) is caught only when
   the picks match an existing list closely (80%+ in order).
"""
import json, os, re, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sitedata as sd
from postmatch import Matcher, SYS_ALIASES, _split_system, NOT_GAMES

POSTS = os.path.join(HERE, "data", "x_posts.json")
STATE = os.path.join(HERE, "data", "x_rankings_imported.json")
LISTS_HTML = os.path.join(sd.ROOT, "lists.html")
MARK = "  /* ---- imported from X by tools/import_x_rankings.py; newer ones are added above this line ---- */"

NUM = {"three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
       "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20}
N_RE = r"(\d{1,2}|" + "|".join(NUM) + r")"
TRIGGER = re.compile(r"(?i)\b(?:top\s+" + N_RE + r"|best\s+" + N_RE + r"|" + N_RE + r"\s+best|"
                     r"best\s+and\s+worst|tier\s+(?:list|ranking)|ranked|how i rank|i rank them)\b")
STRONG = re.compile(r"(?i)\b(?:top\s+" + N_RE + r"|best\s+" + N_RE + r"|" + N_RE + r"\s+best|best\s+and\s+worst|tier\s+(?:list|ranking))\b")
NOT_RANKING = re.compile(r"(?i)\bnot a ranking\b")
TIER = re.compile(r"^\s*([SABCDEF])\s+tier\s*:\s*$", re.I)
NUMBERED = re.compile(r"^\s*(\d{1,2})[.)]\s+(.+?)\s*$")
# lists of things that aren't single games (like the page's trilogies and consoles lists)
NOT_SINGLE_GAMES = re.compile(r"\b(franchises|series|trilogies|consoles|systems|studios|developers)\b", re.I)
TCO = re.compile(r"\s*https?://t\.co/\S+")


def n_of(s):
    if s is None:
        return None
    return int(s) if s.isdigit() else NUM.get(s.lower())


def stated_n(line):
    m = TRIGGER.search(line)
    if not m:
        return None
    for g in m.groups():
        if g:
            return n_of(g)
    return None


def az_date(iso):
    t = datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    return (t - timedelta(hours=7)).strftime("%Y-%m-%d")   # Arizona, no DST


def lines_of(text):
    return [TCO.sub("", l).strip() for l in text.split("\n")]


# ---------------------------------------------------------------- posts

def normalise(p):
    rt = p.get("reply_to")
    if rt is None and p.get("referenced_tweets"):
        rt = next((r["id"] for r in p["referenced_tweets"] if r.get("type") == "replied_to"), None)
    return {"id": str(p["id"]), "created_at": p["created_at"], "text": p.get("note_tweet", {}).get("text") or p["text"],
            "reply_to": str(rt) if rt else None}


def merge_posts(new):
    have = json.load(open(POSTS, encoding="utf-8")) if os.path.exists(POSTS) else []
    by = {p["id"]: p for p in have}
    added = 0
    for p in map(normalise, new):
        if p["id"] not in by:
            added += 1
        elif len(by[p["id"]]["text"]) > len(p["text"]):   # keep the full text if we already have it
            p["text"] = by[p["id"]]["text"]
        by[p["id"]] = p
    posts = sorted(by.values(), key=lambda p: p["created_at"])   # oldest first, same as the saved file
    own = {p["id"] for p in posts}
    for p in posts:     # only replies to RC's own posts count as thread replies
        if p["reply_to"] and p["reply_to"] not in own:
            p["reply_to"] = None
    return posts, added


def chain(root, kids):
    out, cur = [], root["id"]
    while kids.get(cur):
        nxt = sorted(kids[cur], key=lambda x: x["created_at"])[0]
        out.append(nxt)
        cur = nxt["id"]
    return out


# ---------------------------------------------------------------- detection

def title_line(lines):
    """The line that names the list: a "top N" / "N best" / tier line if
    there is one, else the first line with any ranking word."""
    for rx in (STRONG, TRIGGER):
        for i, l in enumerate(lines):
            if rx.search(l):
                return i, l
    return None, None


def clean_title(line, lines, i):
    t = re.sub(r"(?i)^(here'?s|here are|these are)\s+(the\s+)?", "", line).strip()
    t = re.sub(r"[\s:.!🧵👇⤵️]+$", "", t).strip()
    t = t[0].upper() + t[1:] if t else t
    if len(re.sub(r"(?i)\b(my|the|top|best|\d+|" + "|".join(NUM) + r")\b", "", t).strip(" ,.")) < 3:
        prev = next((lines[j] for j in range(i - 1, -1, -1) if lines[j]), "")
        if prev and len(prev) <= 60:
            t = prev.rstrip() + " " + (t if prev.rstrip().endswith((".", "!", "?")) else t[0].lower() + t[1:])
    return t


def extract(root, replies):
    """-> (title, kind, picks[(name, system_or_None, label_or_None)]) or None"""
    text = root["text"]
    if NOT_RANKING.search(text):
        return None
    lines = lines_of(text)
    i, tline = title_line(lines)
    if tline is None:
        return None
    n = stated_n(tline)

    # a. Best: / Worst:
    bw = [(m.group(1).title(), m.group(2)) for l in lines for m in [re.match(r"(?i)^(best|worst)\s*:\s*(.+)$", l)] if m]
    if bw and any(k == "Best" for k, _ in bw):
        year = re.search(r"\b(19[5-9]\d|20[0-4]\d)\b", text)
        title = f"Best and Worst Games I own: {year.group(1)}" if year else clean_title(tline, lines, i)
        return title, "Best and worst", [(v, None, k) for k, v in bw]

    # b. tier replies
    tiers = []
    for r in replies:
        rl = [l for l in lines_of(r["text"]) if l]
        m = TIER.match(rl[0]) if rl else None
        if m:
            tiers += [(x, None, m.group(1).upper()) for x in rl[1:]]
    if tiers and re.search(r"(?i)\btier", text):
        return clean_title(tline, lines, i), f"Tier list \u00b7 {len(tiers)}", tiers

    # c. numbered lines in the post
    nums = [(int(m.group(1)), m.group(2)) for l in lines for m in [NUMBERED.match(l)] if m]
    if len(nums) >= 3 and [k for k, _ in nums] == list(range(1, len(nums) + 1)):
        if n is None or n == len(nums):
            return clean_title(tline, lines, i), f"Ranked \u00b7 {len(nums)}", [(v, None, None) for _, v in nums]

    # d. numbered thread replies
    got = {}
    for r in replies:
        rl = [l for l in lines_of(r["text"]) if l]
        m = NUMBERED.match(rl[0]) if rl else None
        if m and int(m.group(1)) not in got:
            got[int(m.group(1))] = m.group(2)
    if got and sorted(got) == list(range(1, max(got) + 1)) and len(got) >= 3 and (n is None or n == len(got)):
        return clean_title(tline, lines, i), f"Ranked \u00b7 {len(got)}", [(got[k], None, None) for k in sorted(got)]

    # e. short lines right under the top-N line
    if n:
        block = []
        for l in lines[i + 1:]:
            if not l:
                if block:
                    break
                continue
            if len(l) > 70 or re.search(r"[.?!:]$", l):
                break
            block.append(l)
        if len(block) == 1 and len(block[0].split(",")) == n:
            block = [b.strip() for b in block[0].split(",")]
        if len(block) == n and n >= 3:
            return clean_title(tline, lines, i), f"Ranked \u00b7 {n}", [(b, None, None) for b in block]
    return None


def attach_systems(title, picks, matcher):
    """Split "(System)" off each name; otherwise look the name up on the shelf."""
    head_sys = [v for k, v in SYS_ALIASES.items() if re.search(r"(?i)\b" + re.escape(k) + r"\b", title)]
    head_sys = max(head_sys, key=len) if head_sys else None
    out, on_shelf = [], 0
    for name, _, label in picks:
        name = re.sub(r"\s+", " ", name).strip()
        m = re.match(r"^(.*?),\s*([^,]+?)(?:\s*\(\d{4}\))?$", name)    # "Title, Xbox 360/PS3 (2009)"
        parts = [x.strip().lower() for x in m.group(2).split("/")] if m else []
        if parts and all(x in SYS_ALIASES for x in parts):
            base, systems = m.group(1).strip(), list(dict.fromkeys(SYS_ALIASES[x] for x in parts))
        else:
            base, systems = _split_system(name)
            systems = sorted(systems) if systems else []
        hits = matcher.match_piece(base)
        if hits:
            on_shelf += 1
        if not systems:
            hs = sorted({g["system"] for g in hits})
            if head_sys and (head_sys in hs or not hs):
                systems = [head_sys]
            elif len(hs) == 1:
                systems = hs
        sysv = systems[0] if len(systems) == 1 else (systems or None)
        out.append((base, sysv, label))
    return out, on_shelf


# ---------------------------------------------------------------- lists.html

def existing_lists():
    return sd.load_lists()


def _same_name(x, y):
    if x == y or (len(x) > 3 and x in y) or (len(y) > 3 and y in x):
        return True
    a, b = set(x.split()), set(y.split())
    return bool(a and b) and len(a & b) / len(a | b) >= 0.5


def same_list(a_picks, b_picks):
    """Same picks in the same order (80%+), allowing for the page using
    shorter names ("Ocarina of Time" for "Legend of Zelda: Ocarina of Time")."""
    ka = [sd.nkey(p[0]) for p in a_picks]
    kb = [sd.nkey(p[0]) for p in b_picks]
    if not ka or abs(len(ka) - len(kb)) > 1:
        return False
    if len(ka) > 1 and ka[0] in kb[-1:] and len(ka) == len(kb):   # posted 10 -> 1
        kb = kb[::-1]
    same = sum(1 for x, y in zip(ka, kb) if _same_name(x, y))
    return same >= 0.8 * max(len(ka), len(kb))


def js(s):
    return json.dumps(s, ensure_ascii=False).replace("</", "<\\/")


def entry_js(e):
    rows = []
    for name, sysv, label in e["picks"]:
        row = [name, sysv] + ([label] if label else [])
        rows.append("      " + json.dumps(row, ensure_ascii=False).replace("</", "<\\/"))
    parts = [f'    title:{js(e["title"])}', f'    kind:{js(e["kind"])}', '    snub:""',
             f'    date:{js(e["date"])}', f'    xid:{js(e["xid"])}']
    if e.get("solo"):
        parts.append("    solo:true")
    return "  {\n" + ",\n".join(parts) + ",\n    picks:[\n" + ",\n".join(rows) + "\n    ]\n  },\n"


def write_lists(entries):
    src = open(LISTS_HTML, encoding="utf-8").read()
    if MARK not in src:
        i = src.index("const LISTS = [")
        j = src.index("\n];", i)
        before = src[:j].rstrip()
        if not before.endswith(","):
            before += ","
        src = before + "\n" + MARK + "\n" + src[j + 1:]
    block = "".join(entry_js(e) for e in entries)
    # oldest first above the marker, so new ones always land just above it
    src = src.replace(MARK, block + MARK, 1)
    open(LISTS_HTML, "w", encoding="utf-8").write(src)


# ---------------------------------------------------------------- main

def run(new_posts, dry=False):
    posts, added = merge_posts(new_posts)
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
    state.setdefault("imported", {}); state.setdefault("on_page", {})
    state.setdefault("rejected", []); state.setdefault("titles", {})
    done = set(state["imported"]) | set(state["on_page"]) | set(state["rejected"])

    systems, games = sd.load_shelf()
    matcher = Matcher(games)
    current = existing_lists()
    kids = {}
    for p in posts:
        if p["reply_to"]:
            kids.setdefault(p["reply_to"], []).append(p)

    new = []
    for root in sorted((p for p in posts if not p["reply_to"]), key=lambda p: p["created_at"]):
        if root["id"] in done:
            continue
        got = extract(root, chain(root, kids))
        if not got:
            continue
        title, kind, picks = got
        title = state["titles"].get(root["id"], title)
        picks, on_shelf = attach_systems(title, picks, matcher)
        dup = next((L for L in current if same_list(L["picks"], picks)), None)
        if dup:
            state["on_page"][root["id"]] = dup["title"]
            print(f"  already on the page: {root['id']} = {dup['title']!r}")
            continue
        what = NOT_GAMES.search(title) or NOT_SINGLE_GAMES.search(title)
        solo = bool(what) or (on_shelf * 2 < len(picks) and not re.search(r"(?i)\bgames?\b", title))
        if solo:    # not games, so no console tags (Goldeneye the movie isn't the N64 game)
            picks = [(n, None, l) for n, _, l in picks]
        suffix = (" \u00b7 " + what.group(0).lower()) if what else (" \u00b7 not games" if solo else "")
        e = {"title": title, "kind": kind + suffix,
             "date": az_date(root["created_at"]), "xid": root["id"], "picks": picks, "solo": solo}
        new.append(e)
        state["imported"][root["id"]] = title
        current.append({"title": title, "picks": picks})
        print(f"  NEW {e['date']} {root['id']}: {title!r} ({len(picks)} items{', solo' if solo else ''})")

    print(f"{added} new posts merged, {len(new)} lists added")
    if dry:
        for e in new:
            print(entry_js(e))
        return new
    with open(POSTS, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=1)
    if new:
        write_lists(new)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)
    return new


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    new_posts = []
    for a in args:
        d = json.load(open(a, encoding="utf-8"))
        new_posts += d.get("data", d) if isinstance(d, dict) else d
    run(new_posts, dry="--dry-run" in sys.argv)

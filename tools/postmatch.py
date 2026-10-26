"""Work out which shelf games an X post is *about*.

Only the post's subject lines count, never a passing mention in the body:
  - the first line of a post or thread reply ("10. Title" entries included)
  - the 2nd/3rd line when it is written "Title (System)" or "A vs. B"
    (review, Overrated, random game and matchup headers)
  - "Best: ..." / "Worst: ..." lines
Posts about movies/music/TV, and tier-list replies, are skipped, because
those name things that share a title with a game (GoldenEye, Batman Forever).
A subject line is cleaned ("10. ", "(SNES)", ", SNES (1995)", trailing "?" or
"!") and split on " vs. " / " or ", then each piece has to equal a shelf
title exactly (after nkey() normalising), or one of the short names in
ALIASES. When the line names a system the match is limited to that system.
This misses some posts on purpose: a wrong game page quote is worse than a
missing one."""
import re
from sitedata import nkey

SYS_ALIASES = {
    "nes": "NES", "nintendo": "NES", "snes": "SNES", "super nintendo": "SNES",
    "n64": "Nintendo 64", "nintendo 64": "Nintendo 64", "gamecube": "GameCube",
    "nintendo gamecube": "GameCube", "game boy": "Game Boy", "game boy color": "Game Boy Color",
    "3ds": "Nintendo 3DS", "ds": "Nintendo DS", "wii": "Wii", "switch": "Nintendo Switch",
    "ps1": "PlayStation 1", "playstation": "PlayStation 1", "playstation 1": "PlayStation 1",
    "ps2": "PlayStation 2", "playstation 2": "PlayStation 2", "ps3": "PlayStation 3",
    "playstation 3": "PlayStation 3", "ps4": "PlayStation 4", "psp": "PSP",
    "xbox": "Xbox", "og xbox": "Xbox", "xbox 360": "Xbox 360", "xbox one": "Xbox One",
    "genesis": "Sega Genesis", "sega genesis": "Sega Genesis", "dreamcast": "Sega Dreamcast",
    "sega dreamcast": "Sega Dreamcast", "saturn": "Sega Saturn", "sega saturn": "Sega Saturn",
    "pc": "PC",
}

# Short names RC uses in posts -> nkey of the shelf title. Only names that
# can't mean another game.
ALIASES = {
    "ocarina of time": "legend of zelda ocarina of time",
    "zelda ocarina of time": "legend of zelda ocarina of time",
    "majora s mask": "legend of zelda majora s mask",
    "zelda majora s mask": "legend of zelda majora s mask",
    "a link between worlds": "legend of zelda a link between worlds",
    "legend of zelda the adventure of link": "zelda ii the adventure of link",
    "zelda ii": "zelda ii the adventure of link",
    "legend of zelda oracle of seasons": "legend of zelda oracle of seasons",
    "breath of the wild": "legend of zelda breath of the wild",
    "turtles in time": "teenage mutant ninja turtles iv turtles in time",
    "tmnt tournament fighters": "teenage mutant ninja turtles tournament fighters",
    "spiderman venom maximum carnage": "spider man venom maximum carnage",
    "maximum carnage": "spider man venom maximum carnage",
    "superman 64": "superman the new superman adventures",
    "mario 64": "super mario 64",
    "goldeneye": "goldeneye 007",
    "007 tomorrow never dies": "007 tomorrow never dies",
    "street fighter iii double impact": "street fighter iii double impact",
    "batman the video game": "batman the video game",
    "metal gear solid 4": "metal gear solid 4 guns of the patriots",
    "mario kart double dash": "mario kart double dash",
    "wave race": "wave race 64",
    "1080 snowboarding": "1080 snowboarding",
    "red dead redemption 2": "red dead redemption ii",
    "star wars knights of the old republic": "star wars knights of the old republic",
    "sonic 2": "sonic the hedgehog 2",
}


def _clean(line):
    line = line.strip()
    line = re.sub(r"^\d{1,2}\.\s+", "", line)                 # "10. "
    line = re.sub(r"^(best|worst)\s*:\s*", "", line, flags=re.I)
    line = re.sub(r"https://t\.co/\S+", "", line).strip()
    line = line.rstrip("?!.").strip()
    return line


def _split_system(piece):
    """'Contra (NES)' / 'Killer Instinct, SNES (1995)' -> ('Contra', 'NES')"""
    sys_ = None
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", piece)
    if m:
        inner = m.group(2).strip().lower()
        parts = [p.strip() for p in re.split(r"[/,]", inner)]
        hit = [SYS_ALIASES[p] for p in parts if p in SYS_ALIASES]
        if hit:
            sys_ = hit
            piece = m.group(1)
        elif re.fullmatch(r"\d{4}", inner):
            piece = m.group(1)
    m = re.match(r"^(.*?),\s*([^,]+)$", piece)
    if m and m.group(2).strip().lower() in SYS_ALIASES:
        sys_ = [SYS_ALIASES[m.group(2).strip().lower()]]
        piece = m.group(1)
    elif m and " / " in m.group(2):
        hit = [SYS_ALIASES.get(p.strip().lower()) for p in m.group(2).split("/")]
        if all(hit):
            sys_ = hit
            piece = m.group(1)
    return piece.strip(), sys_


NOT_GAMES = re.compile(r"\b(movies?|films?|soundtracks?|songs?|albums?|records?|tv|shows?|characters?)\b", re.I)

# Titles that exist on two systems as *different* games; a post that doesn't
# name the system means this one.
DEFAULT_SYSTEM = {
    "goldeneye 007": "Nintendo 64",
    "teenage mutant ninja turtles": "NES",
}


def subject_lines(text):
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines:
        return []
    first = lines[0]
    if NOT_GAMES.search(first) or re.match(r"^\s*[SABCDF] tier\s*:", first, re.I):
        return []
    out = [first]
    for l in lines[1:3]:
        if re.search(r"\([^()]+\)\s*$", l.strip()) or re.search(r"\svs\.?\s", l, re.I):
            out.append(l)
    out += [l for l in lines if re.match(r"^\s*(best|worst)\s*:", l, re.I)]
    return list(dict.fromkeys(out))


class Matcher:
    def __init__(self, games):
        self.by_key = {}
        for g in games:
            self.by_key.setdefault(g["nkey"], []).append(g)

    def match_piece(self, piece):
        name, sys_ = _split_system(piece)
        if len(name) < 3 or len(name) > 90:
            return []
        k = nkey(name)
        k = ALIASES.get(k, k)
        gs = self.by_key.get(k, [])
        if sys_:
            gs = [g for g in gs if g["system"] in sys_]
        elif k in DEFAULT_SYSTEM:
            gs = [g for g in gs if g["system"] == DEFAULT_SYSTEM[k]]
        return gs

    def games_in(self, text, context=""):
        """context: the first post of the thread this one replies to, used
        only to pick the right system when a title is on more than one."""
        found = self._games_in(text)
        systems = {g["system"] for g in found}
        if context and len(systems) > 1:
            head = context.split("\n")[0].lower() + " " + " ".join(context.split("\n")[1:3]).lower()
            named = {v for k, v in SYS_ALIASES.items() if re.search(r"\b" + re.escape(k) + r"\b", head)}
            keep = [g for g in found if g["system"] in named]
            if keep:
                found = keep
        return found

    def _games_in(self, text):
        found = []
        for line in subject_lines(text):
            line = _clean(line)
            pieces = [line]
            pieces += re.split(r"\s+vs\.?\s+", line, flags=re.I) if re.search(r"\svs\.?\s", line, re.I) else []
            pieces += re.split(r"\s+or\s+", line) if " or " in line else []
            for piece in pieces:
                for g in self.match_piece(piece):
                    if g not in found:
                        found.append(g)
        return found

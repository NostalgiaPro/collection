"""Settings shared by the tools/ scripts. Change things here, not in the scripts."""

SITE_URL = "https://thenostalgiapro.com"

# Photos. A game's photo is images/<slug><ext>, where <slug> comes from the
# same slug code the shelf uses (title + "-" + system). The generators try
# these in order and use the first file that exists on disk, so switching
# the whole site from .jpg to .webp is a one-line change here (or nothing
# at all if both exist - the first one found wins).
IMAGE_EXT = ".webp"
IMAGE_FALLBACK_EXT = ".jpg"
IMAGE_TRIES = ["images/{slug}" + IMAGE_EXT, "images/{slug}" + IMAGE_FALLBACK_EXT,
               "images/placeholders/{slug}.webp"]

# Fallback share picture when a game has no photo.
OG_FALLBACK = "/og-image.png"

X_HANDLE = "NostalgiaPro"

# Where the footers send people (game and console pages).
YOUTUBE_URL = "https://www.youtube.com/@TheNostalgiaPro"
TIKTOK_URL = "https://www.tiktok.com/@rc.the.nostalgia.pro"
SUBSTACK_URL = "https://nostalgiapro.substack.com"
MERCH_URL = "https://nostalgiapro-shop.fourthwall.com/"

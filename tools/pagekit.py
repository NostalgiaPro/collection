"""The bits every generated page shares: <head> with share tags, the nav
row, and the footer scripts (service worker, 1996 mode, back to top).
Copied from the hand-made pages so generated pages look the same."""
from sitedata import esc
import site_config as cfg

NAV = [("/index.html", "The shelf"), ("/digital.html", "Digital"), ("/reviews.html", "Reviews"), ("/lists.html", "Lists"),
       ("/rankings.html", "Rankings"), ("/overrated.html", "Overrated"),
       ("/rank.html", "Rank games"), ("/daily.html", "Daily Shelf"), ("/match.html", "Shelf vs. Mine"),
       ("/anniversaries.html", "Anniversaries"),
       ("/onthisday.html", "On this day"),
       ("/consoles.html", "Consoles"), ("/gaps.html", "The gaps"), ("/stats.html", "The numbers")]

BASE_CSS = """  :root{
    --bg:#101219; --bg2:#171a23; --panel:#1d2029;
    --text:#eceae2; --dim:#8e93a2; --line:#2c3040; --hot:#ff4b3e;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--bg);color:var(--text);
    font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:16px;line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  body::before{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
    background:
      radial-gradient(circle at 50% 0%, rgba(90,110,180,.14), transparent 62%),
      repeating-linear-gradient(to bottom, rgba(255,255,255,.018) 0 1px, transparent 1px 3px);
  }
  .wrap{position:relative;z-index:1;max-width:WIDTH;margin:0 auto;padding:0 22px 90px}
  header{padding:44px 0 0}
  .wordmark{font-family:"Silkscreen",monospace;font-weight:700;font-size:13px;letter-spacing:.14em;color:var(--dim);margin:0 0 22px}
  .wordmark a{color:inherit;text-decoration:none}
  h1{font-family:"Press Start 2P",monospace;font-size:clamp(15px,3vw,26px);line-height:1.55;margin:0;overflow-wrap:break-word}
  .standfirst{color:var(--dim);font-size:15px;margin:14px 0 0;max-width:62ch}
  .navrow{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 0}
  .navbtn{
    display:inline-flex;align-items:center;text-decoration:none;
    border:2px solid var(--line);color:var(--dim);
    font-family:"Silkscreen",monospace;font-size:11px;letter-spacing:.05em;
    padding:9px 14px;border-radius:2px;
  }
  .navbtn:hover{border-color:var(--hot);color:var(--hot)}
  .navbtn.here{border-color:var(--hot);background:var(--hot);color:#12070a}
  .barlabel{font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.1em;color:var(--dim);margin:34px 0 10px}
  .note{font-size:13px;color:var(--dim);margin-top:34px;max-width:64ch}
  .xpost{
    margin:0 0 14px;background:var(--bg2);border:1px solid var(--line);
    border-left:4px solid var(--c,var(--hot));border-radius:2px;padding:14px 18px;
  }
  .xpost blockquote{margin:0;white-space:pre-line;font-size:15px}
  .xpost .meta{
    display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0 0;
    font-family:"Silkscreen",monospace;font-size:10px;letter-spacing:.06em;color:var(--dim);
  }
  .xpost .meta a{color:var(--dim);text-decoration:none;border:1px solid var(--line);border-radius:2px;padding:4px 8px}
  .xpost .meta a:hover{border-color:var(--hot);color:var(--hot)}
"""


def head(title, desc, path, image=None, width="900px", css="", image_alt=None):
    url = cfg.SITE_URL + path
    img = cfg.SITE_URL + (image or cfg.OG_FALLBACK)
    t, d = esc(title), esc(desc)
    size = ('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            if not image else "")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#101219">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="{d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Nostalgia Pro">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{esc(url)}">
<meta property="og:image" content="{esc(img)}">
{size}<meta property="og:image:alt" content="{esc(image_alt or title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@{cfg.X_HANDLE}">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{esc(img)}">
<link rel="canonical" href="{esc(url)}">
<title>{t}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/retro.css">
<style>
{BASE_CSS.replace("WIDTH", width)}{css}</style>
</head>
"""


def nav(here=None):
    out = []
    for href, label in NAV:
        cls = "navbtn here" if href == here else "navbtn"
        out.append(f'    <a class="{cls}" href="{href}">{label}</a>')
    return '  <div class="navrow">\n' + "\n".join(out) + "\n  </div>\n"


FOOT_JS = """<script>
/* Installable, and the whole collection works offline once you've opened it. */
if ("serviceWorker" in navigator)
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(()=>{}));
</script>
<script>
/* 1996 mode. The class does all the work, retro.css does the rest. */
(function(){
  var on = false;
  try { on = localStorage.getItem("np-1996") === "1"; } catch (e) {}
  if (on) document.body.classList.add("y1996");

  var b = document.createElement("button");
  b.id = "y1996btn";
  b.type = "button";
  b.textContent = on ? "Back to now" : "1996 mode";
  b.addEventListener("click", function(){
    var nowOn = document.body.classList.toggle("y1996");
    b.textContent = nowOn ? "Back to now" : "1996 mode";
    try { localStorage.setItem("np-1996", nowOn ? "1" : "0"); } catch (e) {}
  });

  var foot = document.querySelector("footer") || document.querySelector(".wrap");
  var wrap = document.createElement("p");
  wrap.style.cssText = "text-align:center;margin:18px 0 0";
  wrap.appendChild(b);
  foot.appendChild(wrap);

})();

/* Back to top. Appears once you've scrolled far enough to want it. */
(function(){
  var b = document.createElement("button");
  b.id = "totop";
  b.type = "button";
  b.setAttribute("aria-label", "Back to top");
  b.innerHTML = "&#9650;";
  b.addEventListener("click", function(){
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.body.appendChild(b);

  function check(){ b.classList.toggle("on", window.scrollY > 600); }
  addEventListener("scroll", check, { passive: true });
  check();
})();
</script>
</body>
</html>
"""

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def post_date(iso):
    """X timestamps are UTC; show the date in Arizona time, where RC posts from."""
    from datetime import datetime, timedelta
    d = datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S") - timedelta(hours=7)
    return f"{MONTHS[d.month-1]} {d.day}, {d.year}"


def clean_post_text(text):
    import re
    text = re.sub(r"\s*https://t\.co/\w+", "", text)
    return text.strip()


def post_block(p, color=None):
    style = f' style="--c:{color}"' if color else ""
    return (f'<article class="xpost"{style}><blockquote>{esc(clean_post_text(p["text"]))}</blockquote>'
            f'<div class="meta"><span>{post_date(p["created_at"])}</span>'
            f'<a href="https://x.com/{cfg.X_HANDLE}/status/{p["id"]}" target="_blank" rel="noopener">View on X</a></div></article>')

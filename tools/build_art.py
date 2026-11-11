#!/usr/bin/env python3
"""Rebuild tools/art.js (square, base64 covers used by sanitize.js) from
tools/art-sources.json. Fetches 320px thumbnails from Wikimedia Commons.

    python3 -I tools/build_art.py
"""
import base64, io, json, os, sys, time, urllib.parse, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "SerenadeThemeScreenshots/1.0 (spicetify theme promo; low volume)"}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()

def thumbs(titles):
    """title -> thumbnail URL, one API call per 50 titles."""
    out = {}
    for i in range(0, len(titles), 50):
        q = {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url",
             "iiurlwidth": 320, "titles": "|".join(titles[i:i + 50])}
        d = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q)))
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            if "imageinfo" in p:
                out[norm.get(p["title"], p["title"])] = p["imageinfo"][0]["thumburl"]
    return out

def square(data, size=300):
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()

src = json.load(open(os.path.join(HERE, "art-sources.json")))
titles = list(dict.fromkeys(src["covers"] + src["now"]))
urls = thumbs(titles)
missing = [t for t in titles if t not in urls]
if missing:
    sys.exit("not found on Commons: " + ", ".join(missing))
cache = {}
for t in titles:
    cache[t] = square(get(urls[t])); time.sleep(0.3)  # be gentle with upload.wikimedia.org
art = {"covers": [cache[t] for t in src["covers"]], "now": [cache[t] for t in src["now"]]}
open(os.path.join(HERE, "art.js"), "w").write("window.__SR_ART=" + json.dumps(art) + ";")
print(f"wrote tools/art.js ({len(art['covers'])} covers, {len(art['now'])} now-playing)")

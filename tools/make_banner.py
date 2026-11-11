#!/usr/bin/env python3
"""Write tools/banner.js: an overlay that lays out the README banner inside
Spotify's own window (so Instrument Serif is already loaded), using a
sanitized Home screenshot as the backdrop.

    python3 -I tools/make_banner.py shots/home_0.png
    node tools/cdp.mjs evalfile tools/banner.js
    node tools/cdp.mjs shot shots/banner_raw.png 0,0,1500,750
    node tools/cdp.mjs eval "document.getElementById('sr-banner').remove()"
"""
import base64, io, json, os, sys
from PIL import Image

shot = sys.argv[1]
im = Image.open(shot).convert("RGB")
im = im.resize((1600, int(1600 * im.height / im.width)), Image.LANCZOS)
b = io.BytesIO(); im.save(b, "JPEG", quality=86)
src = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()

html = f'''
<div id="sr-banner" style="position:fixed;left:0;top:0;width:1500px;height:750px;z-index:2147483647;overflow:hidden;background:#0c0b10;font-family:SpotifyMixUI,system-ui,sans-serif;color:#f4efe9">
  <img src="{src}" style="position:absolute;right:-120px;top:70px;width:1100px;border-radius:18px;box-shadow:0 40px 120px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08)">
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#0c0b10 0%,#0c0b10 30%,rgba(12,11,16,.85) 42%,rgba(12,11,16,0) 62%)"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(60% 70% at 8% 30%,rgba(255,158,109,.18),transparent 70%),radial-gradient(50% 60% at 30% 110%,rgba(195,166,255,.14),transparent 70%)"></div>
  <div style="position:absolute;left:84px;top:200px;width:560px">
    <div style="font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#a9a2ae;margin-bottom:18px">A Spicetify theme</div>
    <div style="font-family:'Instrument Serif',serif;font-size:150px;line-height:.9;letter-spacing:-.01em">Serenade</div>
    <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:34px;color:#e8d9cb;margin-top:22px;line-height:1.15">Soft glass, serif titles,<br>and colour drawn from what's playing.</div>
  </div>
</div>'''
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "banner.js")
open(out, "w").write('(()=>{document.getElementById("sr-banner")?.remove(); document.body.insertAdjacentHTML("beforeend",'
                     + json.dumps(html) + '); return document.fonts.ready.then(()=>"ok")})()')
print("wrote", out)

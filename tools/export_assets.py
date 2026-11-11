#!/usr/bin/env python3
"""Turn raw CDP captures (in shots/) into the README/Marketplace images in assets/.

Expects: shots/home_0.png, shots/home_2.png (Home with __SR_NOW = 0 and 2),
shots/playlist.png (a playlist page with __SR_NOW = 1), shots/banner_raw.png.

    python3 -I tools/export_assets.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda f: os.path.join(ROOT, "shots", f)
A = lambda f: os.path.join(ROOT, "assets", f)

def save(im, path, width):
    im = im.convert("RGB").resize((width, round(width * im.height / im.width)), Image.LANCZOS)
    im.save(path, "JPEG", quality=88, optimize=True, progressive=True)  # no EXIF is written

save(Image.open(S("banner_raw.png")), A("banner.jpg"), 2000)
save(Image.open(S("home_0.png")), A("home.jpg"), 2200)
save(Image.open(S("playlist.png")), A("playlist.jpg"), 2200)
save(Image.open(S("home_0.png")), A("preview.jpg"), 1280)  # Marketplace card (shown cropped to a square)

# Adaptive-colour strip: the band below the panels from three different covers.
crops = []
for f in ("home_0.png", "home_2.png", "playlist.png"):
    im = Image.open(S(f)).convert("RGB")
    crops.append(im.crop((0, im.height - 244, im.width, im.height)))  # 244 px @2x = just below the panels
gap = 12
strip = Image.new("RGB", (crops[0].width, sum(c.height for c in crops) + gap * 2), (12, 11, 16))
y = 0
for c in crops:
    strip.paste(c, (0, y)); y += c.height + gap
save(strip, A("adaptive.jpg"), 2200)
print("assets written")

import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size
def L(p):
    def lin(c):
        c /= 255
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r,g,b = p; return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def row(y): return [L(im.getpixel((x, y))) for x in range(0, w, 8)]
top = row(8)            # 4 CSS px from top: backdrop above all top-bar controls
bottom = row(h - 6)     # under the player bar
sub = (169,162,174)
for name, r in (('top', top), ('bottom', bottom)):
    mx = max(r); print(f"{name}: max L={mx:.3f} mean L={sum(r)/len(r):.3f} subdued-icon contrast at brightest={(L(sub)+.05)/(mx+.05):.2f}:1")

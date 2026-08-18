"""Measure Nyra ortho content so the model can match sheet proportions."""
from pathlib import Path

from PIL import Image

p = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\art\refs\nyra_front.png")
im = Image.open(p).convert("RGB")
w, h = im.size
pix = im.load()


def ink(x, y):
    r, g, b = pix[x, y]
    return max(r, g, b) < 230


ys = [y for y in range(h) if any(ink(x, y) for x in range(0, w, 3))]
xs = [x for x in range(w) if any(ink(x, y) for y in range(0, h, 3))]
print("front content", min(xs), min(ys), max(xs), max(ys), "size", w, h)
top, bot = min(ys), max(ys)
height_px = bot - top
print("figure px h", height_px)

# width at several heights (0=head top)
for t in (0.06, 0.14, 0.28, 0.42, 0.55, 0.72, 0.88):
    y = int(top + t * height_px)
    row = [x for x in range(w) if ink(x, y)]
    if not row:
        print(f"t={t:.2f} empty")
        continue
    print(f"t={t:.2f} y={y} x={min(row)}-{max(row)} w={max(row)-min(row)} cx={(min(row)+max(row))/2}")

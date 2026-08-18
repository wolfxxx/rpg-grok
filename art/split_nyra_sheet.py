"""Split the scout unified ortho sheet into four 682x1024 view crops."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\PC\AppData\Roaming\Cursor\User\workspaceStorage"
    r"\291819aa9ce3ad841bf87b31b9a88afe\images"
    r"\scout unified sheet-85be2a0f-4303-491c-a2fc-1dfa093421ed.png"
)
OUT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\art\refs")
CANVAS = (682, 1024)

# Panel boxes chosen from column-ink valleys; y cuts the FRONT/BACK labels.
PANELS = {
    "nyra_front.png": (8, 70, 292, 718),
    "nyra_back.png": (296, 70, 540, 718),
    "nyra_left.png": (540, 70, 752, 718),
    "nyra_right.png": (752, 70, 1016, 718),
}


def is_ink(rgb: tuple[int, int, int]) -> bool:
    return rgb[0] < 248 or rgb[1] < 248 or rgb[2] < 248


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    w, h = im.size
    pix = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if is_ink(pix[x, y]):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, w, h)
    pad = 8
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(w, max(xs) + 1 + pad),
        min(h, max(ys) + 1 + pad),
    )


def fit_on_canvas(crop: Image.Image) -> Image.Image:
    cw, ch = CANVAS
    bbox = content_bbox(crop)
    figure = crop.crop(bbox)
    fw, fh = figure.size
    scale = min((cw - 40) / fw, (ch - 80) / fh)
    nw, nh = max(1, int(fw * scale)), max(1, int(fh * scale))
    figure = figure.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", CANVAS, (255, 255, 255))
    x = (cw - nw) // 2
    y = ch - nh - 36
    canvas.paste(figure, (x, y))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert("RGB")
    sheet.save(OUT / "nyra_sheet.png")
    for name, box in PANELS.items():
        crop = sheet.crop(box)
        fitted = fit_on_canvas(crop)
        dest = OUT / name
        fitted.save(dest)
        print(name, "panel", box, "out", fitted.size, dest)


if __name__ == "__main__":
    main()

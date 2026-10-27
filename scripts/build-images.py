"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow python scripts/build-images.py <sources-dir>

Expected files in <sources-dir> (see public/images/CREDITS.md for origins):
    <axis>-<left|right>.<ext>, balance.<ext>
                  the vibe search photos (see VIBE below and public/images/CREDITS.md)
    sky.png       Night sky with the Moon, background of the star search (optional)

The orb, the window and the button of the star search are built by scripts/build-star-assets.mjs, the pictures of the
draw search by scripts/build-draw-images.mjs, the globe from vector data by scripts/build-globe.py.
"""

import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "images"


def crop_to(img: Image.Image, ratio: float, cx: float, cy: float, zoom: float = 1.0) -> Image.Image:
    """Crops to `ratio` (w/h) around the relative centre (cx, cy)."""
    w, h = img.size
    cw, ch = (w, w / ratio) if w / h < ratio else (h * ratio, h)
    cw, ch = cw / zoom, ch / zoom
    left = min(max(cx * w - cw / 2, 0), w - cw)
    top = min(max(cy * h - ch / 2, 0), h - ch)
    return img.crop((int(left), int(top), int(left + cw), int(top + ch)))


def save_to(img: Image.Image, path: Path, width: int, quality: int = 80) -> None:
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(path, "WEBP", quality=quality, method=6, alpha_quality=min(quality, 50))
    print(f"{path.relative_to(OUT)}: {img.size[0]}x{img.size[1]}, {path.stat().st_size // 1024} KB")


# Vibe search photos: output name -> (cx, cy, zoom) of the 4:3 crop, 800x600 WebP of at most VIBE_MAX_KB.
VIBE_DIR = "vibe"
VIBE_MAX_KB = 60
VIBE = {
    "evening-left": (0.55, 0.55, 1.15),
    "evening-right": (0.4, 0.45, 1.15),
    "place-left": (0.66, 0.42, 1.4),
    "place-right": (0.55, 0.6, 1.1),
    "size-left": (0.6, 0.65, 1.2),
    "size-right": (0.5, 0.45, 1.0),
    "leisure-left": (0.5, 0.5, 1.0),
    "leisure-right": (0.45, 0.45, 1.15),
    "food-left": (0.4, 0.65, 1.25),
    "food-right": (0.4, 0.5, 1.0),
    "budget-left": (0.5, 0.5, 1.0),
    "budget-right": (0.55, 0.5, 1.0),
    "location-left": (0.47, 0.3, 1.8),
    "location-right": (0.42, 0.45, 1.15),
    "balance": (0.62, 0.4, 1.4),
}


def save_vibe(img: Image.Image, name: str) -> None:
    """Saves at the best quality (from 75 down) that fits VIBE_MAX_KB."""
    img = img.resize((800, 600), Image.LANCZOS)
    path = OUT / VIBE_DIR / f"{name}.webp"
    for quality in range(75, 29, -5):
        img.save(path, "WEBP", quality=quality, method=6)
        if path.stat().st_size <= VIBE_MAX_KB * 1024:
            break
    print(f"{VIBE_DIR}/{name}.webp: q{quality}, {path.stat().st_size // 1024} KB")


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    (OUT / VIBE_DIR).mkdir(exist_ok=True)
    for name, (cx, cy, zoom) in VIBE.items():
        found = next(iter(sorted(src.glob(f"{name}.*"))), None)
        if found is None:
            print(f"{name}: missing, kept as is")
            continue
        save_vibe(crop_to(Image.open(found).convert("RGB"), 4 / 3, cx, cy, zoom), name)
    stars = OUT / "stars"
    stars.mkdir(exist_ok=True)
    if (src / "sky.png").exists():
        sky = Image.open(src / "sky.png").convert("RGB")
        for name, width, quality in (("sky.webp", 1400, 70), ("sky-mobile.webp", 800, 70)):
            save_to(sky, stars / name, width, quality)


if __name__ == "__main__":
    main(Path(sys.argv[1]))

"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow python scripts/build-images.py <sources-dir>

Expected files in <sources-dir> (see public/images/CREDITS.md for origins):
    florence.jpg  Florence panorama with the Duomo
    eiffel.jpg    Eiffel Tower at sunset
    sea.jpg       Navagio bay, Zakynthos
    <axis>-<left|right>.<ext>, balance.<ext>
                  the vibe search photos (see VIBE below and public/images/CREDITS.md)

The globe is built from vector data by scripts/build-globe.py.
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


def save(img: Image.Image, name: str, width: int, quality: int = 80) -> None:
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT / name, "WEBP", quality=quality, method=6)
    print(f"{name}: {img.size[0]}x{img.size[1]}, {(OUT / name).stat().st_size // 1024} KB")


# Vibe search photos: output name -> (cx, cy, zoom) of the 4:3 crop, 800x600 WebP of at most VIBE_MAX_KB.
VIBE_DIR = "vibe"
VIBE_MAX_KB = 60
VIBE = {
    "evening-left": (0.5, 0.5, 1.0),
    "evening-right": (0.5, 0.5, 1.0),
    "place-left": (0.5, 0.5, 1.0),
    "place-right": (0.5, 0.5, 1.0),
    "size-left": (0.5, 0.5, 1.0),
    "size-right": (0.5, 0.5, 1.0),
    "leisure-left": (0.5, 0.5, 1.0),
    "leisure-right": (0.5, 0.5, 1.0),
    "food-left": (0.5, 0.5, 1.0),
    "food-right": (0.5, 0.5, 1.0),
    "budget-left": (0.5, 0.5, 1.0),
    "budget-right": (0.5, 0.5, 1.0),
    "location-left": (0.5, 0.5, 1.0),
    "location-right": (0.5, 0.5, 1.0),
    "balance": (0.5, 0.5, 1.0),
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

    photos = {
        "sea.jpg": ("sea-navagio.webp", 1.15, 0.6, 0.6, 1.0, 900),
        "florence.jpg": ("florence-duomo.webp", 1.15, 0.64, 0.3, 2.2, 900),
        "eiffel.jpg": ("paris-eiffel.webp", 1.15, 0.585, 0.42, 1.9, 900),
    }
    for source, (name, ratio, cx, cy, zoom, width) in photos.items():
        if not (src / source).exists():
            print(f"{source}: missing, {name} kept as is")
            continue
        img = Image.open(src / source).convert("RGB")
        save(crop_to(img, ratio, cx, cy, zoom), name, width)

    (OUT / VIBE_DIR).mkdir(exist_ok=True)
    for name, (cx, cy, zoom) in VIBE.items():
        found = next(iter(sorted(src.glob(f"{name}.*"))), None)
        if found is None:
            print(f"{name}: missing, kept as is")
            continue
        save_vibe(crop_to(Image.open(found).convert("RGB"), 4 / 3, cx, cy, zoom), name)


if __name__ == "__main__":
    main(Path(sys.argv[1]))

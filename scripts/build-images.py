"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow python scripts/build-images.py <sources-dir>

Expected files in <sources-dir> (see public/images/CREDITS.md for origins):
    florence.jpg  Florence panorama with the Duomo
    eiffel.jpg    Eiffel Tower at sunset
    sea.jpg       Navagio bay, Zakynthos

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


if __name__ == "__main__":
    main(Path(sys.argv[1]))

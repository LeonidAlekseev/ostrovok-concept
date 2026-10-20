"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow python scripts/build-images.py <sources-dir>

Expected files in <sources-dir> (see public/images/CREDITS.md for origins):
    florence.jpg  Florence panorama with the Duomo
    eiffel.jpg    Eiffel Tower at sunset
    sea.jpg       Navagio bay, Zakynthos
    sky.png       Night sky with the Moon, background of the star search (optional)
    orb.png       Magic orb on a black background (optional)

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


def save_to(img: Image.Image, path: Path, width: int, quality: int = 80) -> None:
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(path, "WEBP", quality=quality, method=6)
    print(f"{path.relative_to(OUT)}: {img.size[0]}x{img.size[1]}, {path.stat().st_size // 1024} KB")


def save(img: Image.Image, name: str, width: int, quality: int = 80) -> None:
    save_to(img, OUT / name, width, quality)


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

    stars = OUT / "stars"
    stars.mkdir(exist_ok=True)
    if (src / "sky.png").exists():
        sky = Image.open(src / "sky.png").convert("RGB")
        for name, width, quality in (("sky.webp", 1400, 70), ("sky-mobile.webp", 800, 70)):
            save_to(sky, stars / name, width, quality)
    if (src / "orb.png").exists():
        orb = Image.open(src / "orb.png").convert("RGB")
        save_to(orb.resize((640, 640), Image.LANCZOS), stars / "orb.webp", 640, 80)


if __name__ == "__main__":
    main(Path(sys.argv[1]))

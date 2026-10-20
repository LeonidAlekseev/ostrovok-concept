"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow --with numpy python scripts/build-images.py <sources-dir>

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

import numpy as np
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


def save(img: Image.Image, name: str, width: int, quality: int = 80) -> None:
    save_to(img, OUT / name, width, quality)


# The orb in orb.png: centre and radius of the glass sphere, measured on the 1254 px source.
ORB_CENTER = (623.0, 594.0)
ORB_RADIUS = 497.0
ORB_BLACK = 30.0  # brightness of the source's black background


def orb_with_alpha(img: Image.Image) -> Image.Image:
    """Turns the black background of the orb into transparency.

    Inside the sphere alpha is 1. Outside it comes from the brightness, so that the golden orbits, sparks and
    glow stay while the black goes; the colour outside is divided by that alpha (no dark fringe on light pages).
    """
    rgb = np.asarray(img).astype(np.float32)
    h, w = rgb.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    dist = np.hypot(x - ORB_CENTER[0], y - ORB_CENTER[1])
    inside = np.clip((ORB_RADIUS - dist) / 4 + 0.5, 0, 1)
    bright = np.clip((rgb.max(axis=2) - ORB_BLACK) / (255 - ORB_BLACK), 0, 1)
    alpha = np.maximum(inside, np.clip(bright * 1.6, 0, 1) ** 0.8)
    colour = np.clip(rgb / np.maximum(alpha, 1e-3)[..., None], 0, 255)
    colour = np.where(inside[..., None] >= 1, rgb, colour)
    out = np.dstack([colour, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


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
        orb = orb_with_alpha(Image.open(src / "orb.png").convert("RGB"))
        save_to(orb, stars / "orb.webp", 640, 70)


if __name__ == "__main__":
    main(Path(sys.argv[1]))

"""Builds the optimized images in public/images from downloaded originals.

Usage:
    uv run --with pillow --with numpy python scripts/build-images.py <sources-dir>

Expected files in <sources-dir> (see public/images/CREDITS.md for origins):
    bm.jpg        Blue Marble Next Generation + topography + bathymetry (3600x1800)
    prague.jpg    Týn Church, Prague
    florence.jpg  Florence panorama with the Duomo
    eiffel.jpg    Eiffel Tower at sunset
    sea.jpg       Navagio bay, Zakynthos

The globe centre must stay in sync with GLOBE_CENTER in src/lib/globe.ts.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

LAT0, LON0 = 10.0, 15.0
OUT = Path(__file__).resolve().parent.parent / "public" / "images"


def render_globe(texture: Image.Image, size: int) -> Image.Image:
    tex = np.asarray(texture.convert("RGB"), dtype=np.float32) / 255.0
    th, tw, _ = tex.shape

    # Supersample 2x for smooth limb edges.
    s = size * 2
    coords = (np.arange(s) + 0.5) / s * 2 - 1
    u, v = np.meshgrid(coords, -coords)
    rho2 = u * u + v * v
    inside = rho2 <= 1.0
    z = np.sqrt(np.clip(1 - rho2, 0, 1))

    lat0, lon0 = np.radians(LAT0), np.radians(LON0)
    lat = np.arcsin(np.clip(z * np.sin(lat0) + v * np.cos(lat0), -1, 1))
    lon = lon0 + np.arctan2(u, z * np.cos(lat0) - v * np.sin(lat0))

    # Bilinear sample of the equirectangular texture.
    x = ((lon / (2 * np.pi) + 0.5) % 1.0) * tw - 0.5
    y = (0.5 - lat / np.pi) * th - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.clip(np.floor(y).astype(int), 0, th - 2)
    fx = (x - x0)[..., None]
    fy = np.clip(y - y0, 0, 1)[..., None]
    x0 %= tw
    x1 = (x0 + 1) % tw
    c = (
        tex[y0, x0] * (1 - fx) * (1 - fy)
        + tex[y0, x1] * fx * (1 - fy)
        + tex[y0 + 1, x0] * (1 - fx) * fy
        + tex[y0 + 1, x1] * fx * fy
    )

    # Lift the dark Blue Marble ocean towards a vivid travel-poster blue.
    lum = c.mean(axis=-1, keepdims=True)
    blueness = np.clip((c[..., 2:3] - c[..., 0:1]) * 3.0, 0, 1)
    ocean = blueness * np.clip(1.2 - lum * 2.0, 0, 1)
    c = c * (1 + 0.45 * ocean) + ocean * np.array([0.0, 0.05, 0.2])

    # Soft daylight from the upper right, plus atmospheric haze at the limb.
    light = np.array([0.45, 0.55, 0.70])
    light /= np.linalg.norm(light)
    diffuse = np.clip(u * light[0] + v * light[1] + z * light[2], 0, 1)
    c *= (0.55 + 0.75 * diffuse)[..., None]
    haze = ((1 - z) ** 2.2)[..., None]
    c = c * (1 - 0.65 * haze) + np.array([0.38, 0.66, 1.0]) * 0.75 * haze

    rgb = (np.clip(c, 0, 1) * 255).astype(np.uint8)
    alpha = (inside * 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    img = ImageEnhance.Color(img).enhance(1.25)
    return ImageEnhance.Contrast(img).enhance(1.08)


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

    globe = render_globe(Image.open(src / "bm.jpg"), 2000)
    save(globe, "earth-europe-2000.webp", 2000, 82)
    save(globe, "earth-europe-1200.webp", 1200, 82)

    photos = {
        "prague.jpg": ("prague-tyn.webp", 1.0, 0.55, 0.45, 1.3, 320),
        "sea.jpg": ("sea-navagio.webp", 1.15, 0.6, 0.6, 1.0, 900),
        "florence.jpg": ("florence-duomo.webp", 1.15, 0.64, 0.3, 2.2, 900),
        "eiffel.jpg": ("paris-eiffel.webp", 1.15, 0.585, 0.42, 1.9, 900),
    }
    for source, (name, ratio, cx, cy, zoom, width) in photos.items():
        img = Image.open(src / source).convert("RGB")
        save(crop_to(img, ratio, cx, cy, zoom), name, width)


if __name__ == "__main__":
    main(Path(sys.argv[1]))

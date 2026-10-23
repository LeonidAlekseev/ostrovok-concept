"""Cuts the clouds around the hero globe out of cloud photos on a black background.

Usage:
    uv run --with pillow --with numpy --with scipy python scripts/build-clouds.py <photo>...

Each photo is one white cloud on black, with noisy specks around it, a hard rim and a ragged, coloured fringe along
the bottom. The opacity is taken from the brightness and the colour is divided back out of the black. Everything not
connected to the cloud is erased, the edge fades in softly and takes the colour of the cloud further in, so no rim
or fringe shows on a light page. A photo named globe-cloud-<name>.<ext> is saved as public/images/hero/clouds/<name>.webp.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd

OUT = Path(__file__).resolve().parent.parent / "public" / "images" / "hero" / "clouds"
# Brightness up to this is the black background and its JPEG noise.
BLACK = 16
# The cloud's core: nearly opaque, shrunk until the specks stuck to it come apart.
CORE_ALPHA = 0.9
CORE_ERODE = 6
# The body of the cloud reaches down to this opacity; thin bridges into the specks are cut by an opening.
BODY_ALPHA = 0.35
BODY_OPEN = 6
# The photos' edge is a hard rim, bright or purple: the cloud fades in over this many pixels inside its body, so the
# edge is soft and the rim is gone.
FEATHER = 18
# The outline is smoothed over about this many pixels, so the ragged bottom becomes a soft wavy line.
SMOOTH = 6
# Left-over haze fainter than this is dropped.
MIN_ALPHA = 10
# The colour of the cloud further in replaces the fringe's within this many pixels of the edge, and blends in
# until this depth.
RIM_SOLID = 20
RIM_DEPTH = 36
RIM_REACH = 44
MAX_WIDTH = 800
QUALITY = 80


def cut(photo: Path) -> Image.Image:
    rgb = np.asarray(Image.open(photo).convert("RGB")).astype(np.float32)
    alpha = np.clip((rgb.max(axis=2) - BLACK) / (255 - BLACK), 0, 1)
    # Over black, each pixel is the cloud's colour times its opacity.
    colour = np.clip(rgb / np.maximum(alpha, 1 / 255)[..., None], 0, 255)

    cores, count = nd.label(nd.binary_erosion(alpha >= CORE_ALPHA, iterations=CORE_ERODE))
    sizes = nd.sum(cores > 0, cores, range(1, count + 1))
    core = cores == 1 + int(np.argmax(sizes))
    # The part of the body around the core; the specks are separate parts and are left out.
    parts, _ = nd.label(nd.binary_opening(alpha >= BODY_ALPHA, iterations=BODY_OPEN))
    labels = np.unique(parts[core])
    own = nd.binary_fill_holes(np.isin(parts, labels[labels > 0]))
    own = nd.gaussian_filter(own.astype(np.float32), SMOOTH) > 0.5
    # A cloud cut off by the frame fades out towards it too.
    own[[0, -1], :] = own[:, [0, -1]] = False
    depth = nd.distance_transform_edt(own)
    fade = np.clip(depth / FEATHER, 0, 1)
    a = alpha * fade * fade * (3 - 2 * fade)
    a[a * 255 < MIN_ALPHA] = 0

    # Near the edge, blend towards the average colour of the cloud further in.
    inner = (depth > RIM_DEPTH).astype(np.float32)
    size = RIM_REACH * 2 + 1
    weight = nd.uniform_filter(inner, size)
    nearby = np.stack([nd.uniform_filter(colour[..., c] * inner, size) for c in range(3)], axis=2)
    nearby = np.clip(nearby / np.maximum(weight, 1e-6)[..., None], 0, 255)
    nearby[weight < 0.02] = colour[inner > 0].mean(axis=0)
    t = np.clip((RIM_DEPTH - depth) / (RIM_DEPTH - RIM_SOLID), 0, 1)[..., None]
    colour = colour * (1 - t) + nearby * t

    ys, xs = np.nonzero(a)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = np.clip(np.dstack([colour, a * 255])[top:bottom, left:right].round(), 0, 255).astype(np.uint8)
    cloud = Image.fromarray(out, "RGBA")
    if cloud.width > MAX_WIDTH:
        cloud = cloud.resize((MAX_WIDTH, round(cloud.height * MAX_WIDTH / cloud.width)), Image.LANCZOS)
    return cloud


def main(photos: list[Path]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for photo in photos:
        path = OUT / f"{photo.stem.removeprefix('globe-cloud-')}.webp"
        cloud = cut(photo)
        cloud.save(path, "WEBP", quality=QUALITY, alpha_quality=90, method=6, exact=False)
        print(f"{path.name}: {cloud.width}×{cloud.height}, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main([Path(arg) for arg in sys.argv[1:]])

"""Builds public/data/globe.json, the geometry of the dotted hero globe, from Natural Earth.

Usage:
    uv run --with pillow --with numpy python scripts/build-globe.py <sources-dir>

Expected files in <sources-dir> (public domain, https://github.com/nvkelso/natural-earth-vector/tree/master/geojson):
    ne_50m_land.geojson       land polygons, filled with dots
    ne_50m_coastline.geojson  coastlines, drawn as outlines

Output, all coordinates in tenths of a degree:
    dots   flat [lon, lat, lon, lat, …] of land dots on an even grid
    lines  polylines [[lon, lat, lon, lat, …], …] of the coastlines
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# Distance between neighbouring dots, degrees of arc.
DOT_STEP = 1.25
# Coastline vertices closer than this to the previous kept one are dropped, degrees.
LINE_STEP = 0.35
# Land mask resolution, pixels per degree.
MASK_SCALE = 10
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "globe.json"


def land_mask(path: Path) -> np.ndarray:
    """Equirectangular land mask, row 0 at 90°N."""
    img = Image.new("1", (360 * MASK_SCALE, 180 * MASK_SCALE), 0)
    draw = ImageDraw.Draw(img)
    to_px = lambda ring: [((lon + 180) * MASK_SCALE, (90 - lat) * MASK_SCALE) for lon, lat in ring]
    for feature in json.loads(path.read_text())["features"]:
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for exterior, *holes in polygons:
            draw.polygon(to_px(exterior), fill=1)
            for hole in holes:
                draw.polygon(to_px(hole), fill=0)
    return np.asarray(img)


def land_dots(mask: np.ndarray) -> list[int]:
    """Rows of dots along the parallels, spaced evenly on the sphere."""
    dots = []
    for lat in np.arange(90 - DOT_STEP / 2, -90, -DOT_STEP):
        count = max(int(round(360 * np.cos(np.radians(lat)) / DOT_STEP)), 1)
        # Alternate rows are shifted by half a step, so the dots form a staggered pattern.
        shift = 0.5 * (round((90 - lat) / DOT_STEP) % 2)
        for i in range(count):
            lon = -180 + (i + shift) * 360 / count
            row = min(int((90 - lat) * MASK_SCALE), mask.shape[0] - 1)
            col = int((lon + 180) * MASK_SCALE) % mask.shape[1]
            if mask[row, col]:
                dots += [round(lon * 10), round(lat * 10)]
    return dots


def coastlines(path: Path) -> list[list[int]]:
    lines = []
    for feature in json.loads(path.read_text())["features"]:
        geometry = feature["geometry"]
        parts = geometry["coordinates"] if geometry["type"] == "MultiLineString" else [geometry["coordinates"]]
        for part in parts:
            kept = [part[0]]
            for lon, lat in part[1:]:
                if np.hypot((lon - kept[-1][0]) * np.cos(np.radians(lat)), lat - kept[-1][1]) >= LINE_STEP:
                    kept.append([lon, lat])
            if part[-1] != kept[-1]:
                kept.append(part[-1])
            # Drop islands too small to read.
            if len(kept) < 4:
                continue
            lines.append([round(v * 10) for point in kept for v in point])
    return lines


def main(src: Path) -> None:
    dots = land_dots(land_mask(src / "ne_50m_land.geojson"))
    lines = coastlines(src / "ne_50m_coastline.geojson")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"dots": dots, "lines": lines}, separators=(",", ":")))
    vertices = sum(len(line) for line in lines) // 2
    print(f"{OUT.name}: {len(dots) // 2} dots, {len(lines)} lines / {vertices} vertices, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

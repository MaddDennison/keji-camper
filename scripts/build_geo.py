#!/usr/bin/env python3
"""Build src/data/geo.json from the Friends of Keji GPX bundle + kejimap park boundary.

Sources (download once into scripts/source/):
  - backcountry_2023.zip   http://www.friendsofkeji.ns.ca/GPXfiles/backcountry_2023.zip
    (GPX data prepared by Friends of Keji from Parks Canada 2023 data)
  - KejiParkBoundary.geojson  https://kejimap.blob.core.windows.net/data/KejiParkBoundary.geojson

Trails are simplified with Douglas-Peucker so the bundle stays small while the
lines still hug the real route at map scale.
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

NS = {"g": "http://www.topografix.com/GPX/1/1"}
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.join(HERE, "..", "src", "data", "geo.json")


def dp_simplify(points, tolerance_m):
    """Douglas-Peucker on (lat, lon) using a local metric approximation."""
    if len(points) < 3:
        return points
    lat0 = math.radians(points[0][0])
    kx = 111320.0 * math.cos(lat0)  # metres per degree lon
    ky = 110540.0                   # metres per degree lat

    def seg_dist(p, a, b):
        ax, ay = a[1] * kx, a[0] * ky
        bx, by = b[1] * kx, b[0] * ky
        px, py = p[1] * kx, p[0] * ky
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, imax = -1.0, -1
        for k in range(i + 1, j):
            d = seg_dist(points[k], points[i], points[j])
            if d > dmax:
                dmax, imax = d, k
        if dmax > tolerance_m:
            keep[imax] = True
            stack.append((i, imax))
            stack.append((imax, j))
    return [p for p, k in zip(points, keep) if k]


def track_points(trk):
    return [
        (round(float(p.attrib["lat"]), 5), round(float(p.attrib["lon"]), 5))
        for seg in trk.findall("g:trkseg", NS)
        for p in seg.findall("g:trkpt", NS)
    ]


def load_tracks(path, tolerance_m):
    root = ET.parse(path).getroot()
    out = []
    for trk in root.findall("g:trk", NS):
        name_el = trk.find("g:name", NS)
        name = name_el.text.strip() if name_el is not None and name_el.text else "?"
        pts = dp_simplify(track_points(trk), tolerance_m)
        out.append({"name": name, "points": [[p[0], p[1]] for p in pts]})
    return out


def main():
    gpx_dir = os.path.join(SRC, "gpx")
    portages = load_tracks(os.path.join(gpx_dir, "KejiPortages_forweb.gpx"), 5)
    trails = load_tracks(os.path.join(gpx_dir, "Backcountrytrails2023_forweb.gpx"), 12)

    boundary = json.load(open(os.path.join(SRC, "KejiParkBoundary.geojson")))
    rings = []
    for f in boundary["features"]:
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            ring = [[round(c[1], 5), round(c[0], 5)] for c in poly[0]]
            rings.append(dp_simplify([tuple(p) for p in ring], 15))
    rings = [[[p[0], p[1]] for p in r] for r in rings]

    data = {"portages": portages, "trails": trails, "boundary": rings}
    with open(OUT, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    n = sum(len(t["points"]) for t in trails) + sum(len(p["points"]) for p in portages)
    print(f"wrote {OUT}: {n} track points, {sum(len(r) for r in rings)} boundary points,"
          f" {os.path.getsize(OUT)//1024} KB")


if __name__ == "__main__":
    sys.exit(main())

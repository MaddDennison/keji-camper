#!/usr/bin/env python3
"""Water-following geometry for the off-chart portage ALTERNATIVES (legRoutes.ts).

The published routes' corridors live in src/data/waterways.json. The alternatives
(e.g. the I+J loop around Lower Silver) are not chart edges, so no corridor was
built for them and the app fell back to straight lines. Here we A* their water
segments over the SAME grid build_water_routes.py uses, and stitch the real GPX
portage tracks between them — so picking the alternative swings the paddle line
along actual water.

Emits src/data/altroutes.json:
  {"a|b#opt": {"segments": [{"points": [[lat,lng]...], "portage": "P-I"|null}], "km": n}}

Run:  python3 scripts/build_alt_routes.py   (needs network the first time, then
caches OSM water at scripts/source/osm_water.json like the main build).
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_water_routes as bw  # reuse fetch_water, build_grid, snap, astar, dp_simplify

OUT = os.path.join(HERE, "..", "src", "data", "altroutes.json")
SPECS_IN = os.path.join(HERE, "source", "altspecs.json")

# The alternative portage routings to build water geometry for, emitted by the
# F11 leg-scale gate (see tests/_emit step in the F11 work / src/lib/legplan.ts):
# every non-default route on a short branching leg. Each spec is
# {a_id, b_id, a:[lat,lng], b:[lat,lng], portages:[letters]}. Defaults already
# follow water via the chart corridors, so only the alternatives need building.
# `key` is order-independent: sorted node pair + sorted carries, matching the
# lookup in src/lib/routegeo.ts.
SPECS = json.load(open(SPECS_IN))


def alt_key(a_id, b_id, portages):
    pair = "|".join(sorted([a_id, b_id]))
    carries = ",".join(sorted("P-" + p for p in portages))
    return f"{pair}#{carries}"


def hav(a, b):
    R = 6371000.0
    r = math.pi / 180
    dlat = (b[0] - a[0]) * r
    dlng = (b[1] - a[1]) * r
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def track_len(track):
    return sum(hav(track[i - 1], track[i]) for i in range(1, len(track)))


def water_path(grid, src, dst):
    """A* over water from latlng src to latlng dst; returns simplified latlng list
    bracketed by the true endpoints, plus its length in metres. None if no path."""
    a = bw.snap(grid, bw.to_cell(*src))
    b = bw.snap(grid, bw.to_cell(*dst))
    if not a or not b:
        return None
    cells = bw.astar(grid, a, b) or bw.astar(grid, a, b, pad_cells=10000)
    if not cells:
        return None
    latlng = [list(src)] + [list(bw.to_lat_lng(r, c)) for r, c in cells] + [list(dst)]
    simp = bw.dp_simplify([tuple(p) for p in latlng], 18)
    pts = [[p[0], p[1]] for p in simp]
    length = sum(hav(pts[i - 1], pts[i]) for i in range(1, len(pts)))
    return pts, length


def build_route(grid, ports, a, b, names):
    """One ordering: water to each carry's near end, the carry, water out. Returns
    (segments, total_metres) or None if any water hop has no path."""
    segments = []
    total = 0.0
    cursor = a
    for nm in names:
        track = ports[nm]["points"]
        # orient so the end nearer the cursor is the entry
        if hav(track[0], cursor) <= hav(track[-1], cursor):
            entry, exit_, carry = track[0], track[-1], track
        else:
            entry, exit_, carry = track[-1], track[0], list(reversed(track))
        wp = water_path(grid, cursor, entry)
        if not wp:
            return None
        segments.append({"points": wp[0], "portage": None})
        total += wp[1]
        segments.append({"points": [[p[0], p[1]] for p in carry], "portage": "P-" + nm})
        total += track_len(carry)
        cursor = exit_
    wp = water_path(grid, cursor, b)
    if not wp:
        return None
    segments.append({"points": wp[0], "portage": None})
    total += wp[1]
    return segments, total


def permutations(xs):
    if len(xs) <= 1:
        return [xs]
    out = []
    for i, x in enumerate(xs):
        for rest in permutations(xs[:i] + xs[i + 1:]):
            out.append([x] + rest)
    return out


def main():
    geo = json.load(open(os.path.join(HERE, "..", "src", "data", "geo.json")))
    ports = {p["name"]: p for p in geo["portages"]}
    osm = bw.fetch_water()
    grid = bw.build_grid(osm, geo["portages"])

    out = {}
    for spec in SPECS:
        best = None
        for order in permutations(spec["portages"]):
            r = build_route(grid, ports, spec["a"], spec["b"], order)
            if r and (best is None or r[1] < best[1]):
                best = r
        if not best:
            print(f"  {spec['key']}: NO WATER PATH (left to straight-line fallback)")
            continue
        segs, metres = best
        key = alt_key(spec["a_id"], spec["b_id"], spec["portages"])
        # store oriented from a_id; routegeo reverses if the leg runs the other way
        out[key] = {"from": spec["a_id"], "segments": segs, "km": round(metres) / 1000}
        npts = sum(len(s["points"]) for s in segs)
        print(f"  {key}: {len(segs)} segs, {npts} pts, {round(metres)/1000} km")

    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(f"wrote {OUT}: {len(out)} alternatives ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Precompute water-following display corridors for every paddle-graph edge.

Pipeline (see docs/PLAN-v0.2.md F4):
  1. Download water geometry for the park bbox from Overpass (cached in
     scripts/source/osm_water.json): natural=water polygons + river/stream lines.
  2. Rasterize to a ~30 m grid; carve stream lines and the 23 portage tracks
     (a paddler's actual path crosses them) as traversable cells.
  3. For each paddle edge (scripts/source/paddle_edges.json, emitted by
     dump_edges.ts), A* over the grid; Douglas-Peucker the path.
  4. Emit src/data/waterways.json: {"pairs": {"a|b": [[lat,lng],...]}, "failed": [...]}.

Corridors are DISPLAY geometry only — distances always come from the charts.
"""
import heapq
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.join(HERE, "..", "src", "data", "waterways.json")

LAT0, LAT1 = 44.26, 44.50
LNG0, LNG1 = -65.47, -65.13
CELL_M = 30.0

KY = 110540.0
KX = 111320.0 * math.cos(math.radians((LAT0 + LAT1) / 2))
ROWS = int((LAT1 - LAT0) * KY / CELL_M) + 1
COLS = int((LNG1 - LNG0) * KX / CELL_M) + 1


def to_cell(lat, lng):
    return (int((lat - LAT0) * KY / CELL_M), int((lng - LNG0) * KX / CELL_M))


def to_lat_lng(r, c):
    return (round(LAT0 + (r + 0.5) * CELL_M / KY, 5), round(LNG0 + (c + 0.5) * CELL_M / KX, 5))


def fetch_water():
    cache = os.path.join(SRC, "osm_water.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    q = f"""[out:json][timeout:120];
(
  way["natural"="water"]({LAT0},{LNG0},{LAT1},{LNG1});
  relation["natural"="water"]({LAT0},{LNG0},{LAT1},{LNG1});
  way["waterway"~"^(river|stream|canal)$"]({LAT0},{LNG0},{LAT1},{LNG1});
);
out geom;"""
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=("data=" + urllib.parse.quote(q)).encode(),
        headers={"User-Agent": "keji-camper-build/0.2 (hobby project)"},
    )
    data = json.load(urllib.request.urlopen(req, timeout=180))
    os.makedirs(SRC, exist_ok=True)
    json.dump(data, open(cache, "w"))
    return data


def fill_polygon(grid, ring):
    """Even-odd scanline fill of one ring given as [(lat,lng), ...]."""
    pts = [to_cell(lat, lng) for lat, lng in ring]
    if len(pts) < 3:
        return
    rmin = max(0, min(p[0] for p in pts))
    rmax = min(ROWS - 1, max(p[0] for p in pts))
    for r in range(rmin, rmax + 1):
        xs = []
        y = r + 0.5
        for i in range(len(pts)):
            (r1, c1), (r2, c2) = pts[i], pts[(i + 1) % len(pts)]
            if (r1 <= y < r2) or (r2 <= y < r1):
                t = (y - r1) / (r2 - r1)
                xs.append(c1 + t * (c2 - c1))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            c0 = max(0, int(math.ceil(xs[k])))
            c1_ = min(COLS - 1, int(math.floor(xs[k + 1])))
            base = r * COLS
            for c in range(c0, c1_ + 1):
                grid[base + c] = 1


def assemble_rings(fragments, eps=1e-6):
    """Join open way-fragments into closed rings by endpoint matching."""
    frags = [list(f) for f in fragments if len(f) >= 2]
    rings = []
    while frags:
        ring = frags.pop()
        progress = True
        while progress and frags:
            progress = False
            if abs(ring[0][0] - ring[-1][0]) < eps and abs(ring[0][1] - ring[-1][1]) < eps:
                break  # closed
            for i, f in enumerate(frags):
                if abs(ring[-1][0] - f[0][0]) < eps and abs(ring[-1][1] - f[0][1]) < eps:
                    ring += f[1:]
                elif abs(ring[-1][0] - f[-1][0]) < eps and abs(ring[-1][1] - f[-1][1]) < eps:
                    ring += f[-2::-1]
                elif abs(ring[0][0] - f[-1][0]) < eps and abs(ring[0][1] - f[-1][1]) < eps:
                    ring = f[:-1] + ring
                elif abs(ring[0][0] - f[0][0]) < eps and abs(ring[0][1] - f[0][1]) < eps:
                    ring = f[::-1][:-1] + ring
                else:
                    continue
                frags.pop(i)
                progress = True
                break
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def carve_line(grid, pts_latlng, width=1):
    cells = [to_cell(lat, lng) for lat, lng in pts_latlng]
    for i in range(len(cells) - 1):
        (r1, c1), (r2, c2) = cells[i], cells[i + 1]
        n = max(abs(r2 - r1), abs(c2 - c1), 1)
        for k in range(n + 1):
            r = round(r1 + (r2 - r1) * k / n)
            c = round(c1 + (c2 - c1) * k / n)
            for dr in range(-width + 1, width):
                for dc in range(-width + 1, width):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < ROWS and 0 <= cc < COLS:
                        grid[rr * COLS + cc] = 1


def build_grid(osm, portages):
    grid = bytearray(ROWS * COLS)
    polys = 0
    lines = 0
    for el in osm["elements"]:
        if el["type"] == "way" and "geometry" in el:
            ring = [(g["lat"], g["lon"]) for g in el["geometry"]]
            if el.get("tags", {}).get("natural") == "water":
                fill_polygon(grid, ring)
                polys += 1
            else:
                carve_line(grid, ring)
                lines += 1
        elif el["type"] == "relation":
            # multipolygon members are open fragments — assemble them into
            # closed rings by matching endpoints before filling
            outers = [[(g["lat"], g["lon"]) for g in m["geometry"]]
                      for m in el.get("members", [])
                      if m.get("role") in ("outer", "") and "geometry" in m]
            inners = [[(g["lat"], g["lon"]) for g in m["geometry"]]
                      for m in el.get("members", [])
                      if m.get("role") == "inner" and "geometry" in m]
            for ring in assemble_rings(outers):
                fill_polygon(grid, ring)
            for ring in assemble_rings(inners):
                unfill(grid, ring)
            polys += 1
    # portage tracks are traversable for a paddling party
    for p in portages:
        carve_line(grid, p["points"])
    print(f"grid {ROWS}x{COLS}: {polys} polygons, {lines} stream lines, "
          f"{sum(grid)} water cells ({100*sum(grid)/(ROWS*COLS):.1f}%)")
    return grid


def unfill(grid, ring):
    tmp = bytearray(ROWS * COLS)
    fill_polygon(tmp, ring)
    for i, v in enumerate(tmp):
        if v:
            grid[i] = 0


def snap(grid, cell, max_radius=25):
    """Nearest water cell by ring search."""
    r0, c0 = cell
    if 0 <= r0 < ROWS and 0 <= c0 < COLS and grid[r0 * COLS + c0]:
        return cell
    for rad in range(1, max_radius + 1):
        best = None
        for dr in range(-rad, rad + 1):
            for dc in (-rad, rad):
                for r, c in ((r0 + dr, c0 + dc), (r0 + dc, c0 + dr)):
                    if 0 <= r < ROWS and 0 <= c < COLS and grid[r * COLS + c]:
                        d = dr * dr + dc * dc
                        if best is None or d < best[0]:
                            best = (d, (r, c))
        if best:
            return best[1]
    return None


SQRT2 = math.sqrt(2)
NBRS = [(-1, -1, SQRT2), (-1, 0, 1), (-1, 1, SQRT2), (0, -1, 1),
        (0, 1, 1), (1, -1, SQRT2), (1, 0, 1), (1, 1, SQRT2)]


def astar(grid, start, goal, pad_cells=120):
    rmin = max(0, min(start[0], goal[0]) - pad_cells)
    rmax = min(ROWS - 1, max(start[0], goal[0]) + pad_cells)
    cmin = max(0, min(start[1], goal[1]) - pad_cells)
    cmax = min(COLS - 1, max(start[1], goal[1]) + pad_cells)

    def h(r, c):
        dr, dc = abs(r - goal[0]), abs(c - goal[1])
        return max(dr, dc) + (SQRT2 - 1) * min(dr, dc)

    g = {start: 0.0}
    prev = {}
    pq = [(h(*start), start)]
    seen = set()
    while pq:
        _, cur = heapq.heappop(pq)
        if cur == goal:
            path = [cur]
            while cur in prev:
                cur = prev[cur]
                path.append(cur)
            return path[::-1]
        if cur in seen:
            continue
        seen.add(cur)
        r, c = cur
        gc = g[cur]
        for dr, dc, w in NBRS:
            rr, cc = r + dr, c + dc
            if not (rmin <= rr <= rmax and cmin <= cc <= cmax):
                continue
            if not grid[rr * COLS + cc]:
                continue
            ng = gc + w
            nxt = (rr, cc)
            if ng < g.get(nxt, 1e18):
                g[nxt] = ng
                prev[nxt] = cur
                heapq.heappush(pq, (ng + h(rr, cc), nxt))
    return None


def dp_simplify(points, tol_m):
    if len(points) < 3:
        return points
    kx = KX

    def seg_dist(p, a, b):
        ax, ay = a[1] * kx, a[0] * KY
        bx, by = b[1] * kx, b[0] * KY
        px, py = p[1] * kx, p[0] * KY
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
        if dmax > tol_m:
            keep[imax] = True
            stack += [(i, imax), (imax, j)]
    return [p for p, k in zip(points, keep) if k]


def bridge_components(grid, node_cells, max_gap_cells=8):
    """OSM leaves small unmapped gaps in real paddling channels (e.g. the
    Frozen Ocean outlet, ~124 m). Bridge components that contain route nodes
    when their gap is a few cells, iterating until no eligible pair remains."""
    from collections import deque
    for _ in range(6):
        label = [0] * (ROWS * COLS)
        nlab = 0
        for idx in range(ROWS * COLS):
            if grid[idx] and not label[idx]:
                nlab += 1
                q = deque([idx])
                label[idx] = nlab
                while q:
                    u = q.popleft()
                    r, c = divmod(u, COLS)
                    for dr in (-1, 0, 1):
                        for dc in (-1, 0, 1):
                            rr, cc = r + dr, c + dc
                            if 0 <= rr < ROWS and 0 <= cc < COLS:
                                v = rr * COLS + cc
                                if grid[v] and not label[v]:
                                    label[v] = nlab
                                    q.append(v)
        comps = {}
        for cell in node_cells:
            lb = label[cell[0] * COLS + cell[1]]
            comps.setdefault(lb, [])
        if len(comps) <= 1:
            return
        cells_by_comp = {lb: [] for lb in comps}
        for idx in range(ROWS * COLS):
            lb = label[idx]
            if lb in cells_by_comp:
                cells_by_comp[lb].append((idx // COLS, idx % COLS))
        labels = sorted(cells_by_comp, key=lambda lb: -len(cells_by_comp[lb]))
        main_cells = cells_by_comp[labels[0]]
        bridged = False
        for lb in labels[1:]:
            best = (1e18, None, None)
            for a in cells_by_comp[lb][::2]:
                for b in main_cells[::2]:
                    d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
                    if d < best[0]:
                        best = (d, a, b)
            d, a, b = best
            if a and d <= max_gap_cells ** 2:
                carve_line(grid, [to_lat_lng(*a), to_lat_lng(*b)])
                print(f"  bridged {d**0.5*CELL_M:.0f} m gap at {to_lat_lng(*a)}")
                bridged = True
        if not bridged:
            return


def main():
    import urllib.parse  # noqa: F401 (used in fetch_water)
    edges = json.load(open(os.path.join(SRC, "paddle_edges.json")))
    geo = json.load(open(os.path.join(HERE, "..", "src", "data", "geo.json")))
    osm = fetch_water()
    grid = build_grid(osm, geo["portages"])

    node_cells = []
    for e in edges:
        for lat, lng in ((e["alat"], e["alng"]), (e["blat"], e["blng"])):
            s = snap(grid, to_cell(lat, lng))
            if s:
                node_cells.append(s)
    bridge_components(grid, node_cells)

    pairs = {}
    failed = []
    for i, e in enumerate(edges):
        a = snap(grid, to_cell(e["alat"], e["alng"]))
        b = snap(grid, to_cell(e["blat"], e["blng"]))
        key = "|".join(sorted([e["a"], e["b"]]))
        if not a or not b:
            failed.append(key)
            continue
        path = astar(grid, a, b) or astar(grid, a, b, pad_cells=10000)
        if not path:
            failed.append(key)
            continue
        latlng = [[e["alat"], e["alng"]]] + [list(to_lat_lng(r, c)) for r, c in path] + [[e["blat"], e["blng"]]]
        pairs[key] = [[p[0], p[1]] for p in dp_simplify([tuple(p) for p in latlng], 18)]
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(edges)} corridors…")

    json.dump({"pairs": pairs, "failed": failed}, open(OUT, "w"), separators=(",", ":"))
    npts = sum(len(v) for v in pairs.values())
    print(f"wrote {OUT}: {len(pairs)} corridors ({npts} pts), {len(failed)} failed "
          f"({os.path.getsize(OUT)//1024} KB)")
    if failed:
        print("fallback (schematic) pairs:", ", ".join(failed[:40]))


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Build the paddle portage NETWORK (v0.3 F11): the water bodies, which body each
site/launch/waypoint sits on, and which two bodies each portage joins. With this
graph the app can generate portage routes between ANY two sites (Yen's k-shortest
paths over it) instead of hand-listing branches in legRoutes.ts.

Key idea: rasterize OSM water as build_water_routes.py does, but DON'T carve the
portage tracks. Flood-fill the result — lakes/ponds/stillwaters are joined only by
carries, so each navigable unit falls out as one connected component (a "body").
Streams stay carved (a paddler runs them), so water-connected basins are one body.

Emits src/data/portage_network.json:
  { "bodies": N,
    "nodes":   { nodeId: [lat,lng] },
    "access":  { nodeId: "paddle"|"hike"|"both" },
    "members": { nodeId: bodyId },                      # body each node sits on
    "portages":[ {"id":"P-I","a":bodyA,"b":bodyB,"carryM":n,
                  "endA":[lat,lng],"endB":[lat,lng]} ] }  # a==b dropped (intra-body)

Run:  python3 scripts/build_portage_network.py   (reuses the cached OSM water).
"""
import json
import math
import os
import re
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
import build_water_routes as bw  # fetch_water, build_grid, snap, to_cell, bridge_components, ROWS, COLS

OUT = os.path.join(ROOT, "src", "data", "portage_network.json")


def hav(a, b):
    R = 6371000.0
    r = math.pi / 180
    dlat = (b[0] - a[0]) * r
    dlng = (b[1] - a[1]) * r
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def parse_places():
    """(id -> (lat, lng, access, lake)) straight from sites.ts — the source of truth.
    `lake` is normalized (parenthetical/slash suffixes dropped) so the fragments OSM
    splits one lake into can be re-merged."""
    src = open(os.path.join(ROOT, "src", "data", "sites.ts")).read()
    out = {}
    for m in re.finditer(
        r"id: '([^']+)'[^\n]*lake: '([^']+)',\s*\n\s*lat: ([-\d.]+), lng: ([-\d.]+), kind: '[^']+', access: '(\w+)'",
        src,
    ):
        lake = re.sub(r"\s*\(.*?\)", "", m.group(2)).split("/")[0].strip()
        out[m.group(1)] = (float(m.group(3)), float(m.group(4)), m.group(5), lake)
    return out


def parse_waypoints():
    """Chart waypoints (Fairy Bay, West River mouth, …) from mapdata.ts WAYPOINT_COORDS."""
    src = open(os.path.join(ROOT, "src", "lib", "mapdata.ts")).read()
    blk = re.search(r"WAYPOINT_COORDS[^=]*=\s*\{(.*?)\n\};", src, re.S)
    out = {}
    if blk:
        for m in re.finditer(r"(\w+): \[([-\d.]+), ([-\d.]+)\]", blk.group(1)):
            out[m.group(1)] = (float(m.group(2)), float(m.group(3)), "both")
    return out


def label_components(grid):
    """8-connected flood fill of water cells -> per-cell component id (0 = land)."""
    label = [0] * (bw.ROWS * bw.COLS)
    n = 0
    for idx in range(bw.ROWS * bw.COLS):
        if grid[idx] and not label[idx]:
            n += 1
            q = deque([idx])
            label[idx] = n
            while q:
                u = q.popleft()
                r, c = divmod(u, bw.COLS)
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        rr, cc = r + dr, c + dc
                        if 0 <= rr < bw.ROWS and 0 <= cc < bw.COLS:
                            v = rr * bw.COLS + cc
                            if grid[v] and not label[v]:
                                label[v] = n
                                q.append(v)
    return label, n


def body_at(grid, label, latlng, max_radius=14):
    s = bw.snap(grid, bw.to_cell(*latlng), max_radius=max_radius)
    return label[s[0] * bw.COLS + s[1]] if s else 0


def build_lake_grid(osm):
    """Water grid from natural=water POLYGONS only — no streams, no portages.

    Streams are skipped on purpose: in Keji the brook/river links between lakes are
    exactly where the portages are (you carry, the stream isn't a paddle-through), so
    carving them would merge every lake into one body and hide the carries. Lakes
    mapped as adjacent/overlapping polygons still merge (a real open channel)."""
    grid = bytearray(bw.ROWS * bw.COLS)
    polys = 0
    for el in osm["elements"]:
        if el["type"] == "way" and "geometry" in el and el.get("tags", {}).get("natural") == "water":
            bw.fill_polygon(grid, [(g["lat"], g["lon"]) for g in el["geometry"]])
            polys += 1
        elif el["type"] == "relation":
            outers = [[(g["lat"], g["lon"]) for g in m["geometry"]]
                      for m in el.get("members", []) if m.get("role") in ("outer", "") and "geometry" in m]
            inners = [[(g["lat"], g["lon"]) for g in m["geometry"]]
                      for m in el.get("members", []) if m.get("role") == "inner" and "geometry" in m]
            for ring in bw.assemble_rings(outers):
                bw.fill_polygon(grid, ring)
            for ring in bw.assemble_rings(inners):
                bw.unfill(grid, ring)
            polys += 1
    print(f"lake grid {bw.ROWS}x{bw.COLS}: {polys} polygons, {sum(grid)} water cells")
    return grid


def main():
    geo = json.load(open(os.path.join(ROOT, "src", "data", "geo.json")))
    places = parse_places()
    waypoints = parse_waypoints()
    nodes = {}
    access = {}
    for k, v in {**places, **waypoints}.items():
        nodes[k] = (v[0], v[1])
        access[k] = v[2]
    print(f"parsed {len(places)} places + {len(waypoints)} waypoints = {len(nodes)} nodes")

    osm = bw.fetch_water()
    grid = build_lake_grid(osm)  # lake polygons only -> bodies are individual lakes

    # bridge sub-240 m OSM gaps among the node touchpoints so a real lake isn't
    # split by a hole in the map (same fix the corridor build uses)
    node_cells = [bw.snap(grid, bw.to_cell(*c)) for c in nodes.values()]
    bw.bridge_components(grid, [x for x in node_cells if x])

    label, nbodies = label_components(grid)

    raw_members = {}
    homeless = []
    for nid, c in nodes.items():
        b = body_at(grid, label, c)
        if b:
            raw_members[nid] = b
        else:
            homeless.append(nid)

    # Merge OSM body fragments that share a normalized lake name: OSM splits one
    # lake into several polygons (so site 38 and site 40 — both Peskawa Lake — land
    # in different components), but the curated `lake` field says they're one
    # navigable body. Union-find over body ids by lake glues the fragments back.
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    def union(a, b):
        parent[find(a)] = find(b)

    lake_bodies = {}
    for nid, (la, ln, ac, lake) in places.items():
        b = raw_members.get(nid)
        if b:
            lake_bodies.setdefault(lake, []).append(b)
    for bs in lake_bodies.values():
        for b in bs[1:]:
            union(bs[0], b)

    members = {nid: find(b) for nid, b in raw_members.items()}

    portages = []
    intra = []
    for p in geo["portages"]:
        pts = p["points"]
        a, b = pts[0], pts[-1]
        ba = find(body_at(grid, label, a)) if body_at(grid, label, a) else 0
        bb = find(body_at(grid, label, b)) if body_at(grid, label, b) else 0
        carry = round(sum(hav(pts[i - 1], pts[i]) for i in range(1, len(pts))))
        rec = {
            "id": "P-" + p["name"], "a": ba, "b": bb, "carryM": carry,
            "endA": [round(a[0], 5), round(a[1], 5)], "endB": [round(b[0], 5), round(b[1], 5)],
        }
        if ba and bb and ba != bb:
            portages.append(rec)
        else:
            intra.append((rec["id"], ba, bb))

    out = {
        "bodies": nbodies,
        "nodes": {k: [round(v[0], 5), round(v[1], 5)] for k, v in nodes.items()},
        "access": access,
        "members": members,
        "portages": portages,
    }
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(f"bodies: {nbodies} | members placed: {len(members)} | portages joining bodies: {len(portages)}")
    if homeless:
        print(f"  nodes off the water grid ({len(homeless)}): {', '.join(homeless)}")
    if intra:
        print(f"  portages NOT joining two bodies ({len(intra)}): " +
              ", ".join(f"{i}({a}/{b})" for i, a, b in intra))
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")

    # --- validation against the user-verified branches ---
    print("validation:")
    for nid in ("30", "31", "25", "29", "24"):
        print(f"  site {nid} -> body {members.get(nid, 'HOMELESS')}")
    pmap = {p["id"]: p for p in portages}
    for pid in ("P-I", "P-J", "P-D", "P-F", "P-E", "P-O"):
        p = pmap.get(pid)
        desc = f"{p['a']} <-> {p['b']}" if p else "NOT a body-connector"
        print(f"  {pid}: {desc}")

    # reachability: every paddle-accessible site should reach Kejimkujik Lake (the hub)
    adj = {}
    for p in portages:
        adj.setdefault(p["a"], set()).add(p["b"])
        adj.setdefault(p["b"], set()).add(p["a"])
    hub = members.get("24")  # Minards Bay, Kejimkujik Lake
    seen = {hub}
    stack = [hub]
    while stack:
        u = stack.pop()
        for v in adj.get(u, ()):
            if v not in seen:
                seen.add(v)
                stack.append(v)
    stranded = [
        nid for nid, (la, ln, ac, lake) in places.items()
        if ac in ("paddle", "both") and members.get(nid) and members[nid] not in seen
    ]
    print(f"  paddle sites stranded from Kejimkujik Lake: {stranded or 'none'}")


if __name__ == "__main__":
    sys.exit(main())

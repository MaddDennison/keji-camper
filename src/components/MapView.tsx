import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { PLACES } from '../data/sites';
import { GEO, portageMeters } from '../lib/mapdata';
import { legGeometry } from '../lib/routegeo';
import type { Place, TravelMode } from '../types';

export interface RouteOverlay {
  nodes: string[]; // routing node ids in travel order
  mode: TravelMode;
}

interface Props {
  selectedId?: string | null;
  visited: Set<string>;
  routeOverlay?: RouteOverlay[] | null;
  // When set, a trip is selected: markers not in this set of place ids are faded.
  tripPlaceIds?: Set<string> | null;
  onSelect: (place: Place) => void;
  height?: string;
}

const KIND_COLOR: Record<string, string> = {
  site: '#2f5d46',
  group: '#5b3e80',
  cabin: '#8a5a18',
  walkin: '#3f6f6a',
  launch: '#c2562b',
};

function pinIcon(p: Place, visited: boolean, selected: boolean) {
  const color = KIND_COLOR[p.kind] ?? '#2f5d46';
  const scale = selected ? 1.25 : 1;
  return L.divIcon({
    className: '',
    html: `<div class="site-pin ${visited ? 'visited' : ''}" style="background:${color};transform:rotate(-45deg) scale(${scale})"><span>${p.label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
  });
}

export default function MapView({ selectedId, visited, routeOverlay, tripPlaceIds, onSelect, height }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // create map once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      center: [44.38, -65.28],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    const topo = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 17, attribution: 'Tiles © Esri — Esri, USGS, NOAA' },
    ).addTo(map);
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    });
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, attribution: 'Imagery © Esri — Maxar, Earthstar Geographics' },
    );

    // park boundary
    const boundary = L.layerGroup(
      GEO.boundary.map((ring) =>
        L.polygon(ring as [number, number][], {
          color: '#1d3d2f', weight: 2.5, dashArray: '10 6', fill: false, opacity: 0.8,
        }),
      ),
    ).addTo(map);

    // trails
    const trails = L.layerGroup(
      GEO.trails.map((t) =>
        L.polyline(t.points as [number, number][], {
          color: '#9c4220', weight: 2.5, opacity: 0.85, dashArray: '1 7', lineCap: 'round',
        }).bindTooltip(t.name, { sticky: true }),
      ),
    ).addTo(map);

    // portages
    const portages = L.layerGroup(
      GEO.portages.map((p) =>
        L.polyline(p.points as [number, number][], {
          color: '#b3261e', weight: 3.4, opacity: 0.95,
        }).bindTooltip(
          `Portage ${p.name} · ~${portageMeters[`P-${p.name}`] ?? '?'} m`,
          { sticky: true },
        ),
      ),
    ).addTo(map);

    L.control
      .layers(
        { 'Topo (Esri)': topo, Streets: streets, Satellite: sat },
        { 'Park boundary': boundary, Trails: trails, Portages: portages },
        { collapsed: true },
      )
      .addTo(map);

    // markers
    for (const p of PLACES) {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p, false, false) })
        .addTo(map)
        .bindPopup(
          `<div class="popup"><h4>${p.name}</h4><div class="lake">${p.lake}</div></div>`,
          { closeButton: false },
        );
      m.on('click', () => onSelect(p));
      markersRef.current.set(p.id, m);
    }

    routeLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // marker styling on selection/visited change
  useEffect(() => {
    for (const p of PLACES) {
      const m = markersRef.current.get(p.id);
      if (!m) continue;
      m.setIcon(pinIcon(p, visited.has(p.id), selectedId === p.id));
      m.setZIndexOffset(selectedId === p.id ? 1000 : 0);
      // Fade markers that aren't part of the selected trip (keep the selected one solid).
      const dimmed = !!tripPlaceIds && !tripPlaceIds.has(p.id) && selectedId !== p.id;
      m.setOpacity(dimmed ? 0.3 : 1);
    }
    if (selectedId) {
      const p = PLACES.find((x) => x.id === selectedId);
      if (p && mapRef.current) {
        mapRef.current.panTo([p.lat, p.lng]);
      }
    }
  }, [selectedId, visited, tripPlaceIds]);

  // route overlay — true-to-terrain geometry where the data allows (v0.2 F4)
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!routeOverlay) return;
    const all: [number, number][] = [];
    routeOverlay.forEach((leg, i) => {
      const color = leg.mode === 'paddle' ? '#3f6f6a' : '#c2562b';
      for (const seg of legGeometry(leg.mode, leg.nodes)) {
        if (seg.points.length < 2) continue;
        all.push(...seg.points);
        const isCarry = !!seg.portage;
        L.polyline(seg.points, {
          color: isCarry ? '#b3261e' : color, // portage red matches the standalone tracks
          weight: isCarry ? 3.4 : seg.schematic ? 3 : 4.5,
          opacity: isCarry ? 0.95 : seg.schematic ? 0.55 : 0.9,
          dashArray: isCarry ? undefined : seg.schematic ? '2 10' : leg.mode === 'hike' ? '8 6' : undefined,
          lineCap: 'round',
        })
          .bindTooltip(
            isCarry
              ? `Leg ${i + 1} · carry over Portage ${seg.portage!.slice(2)}`
              : `Leg ${i + 1} (${leg.mode}${seg.schematic ? ' · schematic line' : ''})`,
            { sticky: true },
          )
          .addTo(layer);
      }
    });
    if (all.length > 1 && mapRef.current) {
      mapRef.current.fitBounds(L.latLngBounds(all).pad(0.18));
    }
  }, [routeOverlay]);

  return (
    <div className="map-wrap" style={height ? { minHeight: height } : undefined}>
      <div ref={divRef} className="leaflet-container" />
      <div className="map-legend">
        <div className="row"><span className="dot" style={{ background: '#2f5d46' }} /> campsite</div>
        <div className="row"><span className="dot" style={{ background: '#5b3e80' }} /> group site</div>
        <div className="row"><span className="dot" style={{ background: '#8a5a18' }} /> cabin</div>
        <div className="row"><span className="dot" style={{ background: '#c2562b' }} /> launch / trailhead</div>
        <div className="row"><span style={{ color: '#b3261e', fontWeight: 800 }}>━</span> portage</div>
        <div className="row"><span style={{ color: '#9c4220', fontWeight: 800 }}>┄</span> trail</div>
      </div>
    </div>
  );
}

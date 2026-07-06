import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../App';
import { PORTAGE_NAMES } from '../data/distances';
import { placeById } from '../data/sites';
import { EMERGENCY_LINES } from '../lib/emergency';
import { fmtCarry, fmtDate, fmtKm } from '../lib/format';
import {
  buildMapPack,
  declinationDeg,
  scaleBar,
  wmsUrl,
  type Bbox,
  type DayPlan,
  type MapPack,
  type PageSpec,
} from '../lib/mappack';
import { fmtHours } from '../lib/routing';
import { useStore } from '../lib/store';
import type { LegSegment } from '../lib/routegeo';
import '../styles/mappack.css';

/**
 * Printable topo map pack (v1): cover/overview page + one page per travel day,
 * printed via the browser dialog (paper or Save-as-PDF). Design + adversarial
 * findings: Plans/TOPO-MAP-PACK.md. Pure page math lives in lib/mappack.ts.
 *
 * Print integration notes:
 *  - the sheet is landscape Letter; the @page rule is injected only while this
 *    page is mounted so the trip PrintSheet keeps the browser's default page
 *    setup (the global @media print block is intentionally untouched)
 *  - map images arrive via fetch+AbortController (a bare <img src=wms> can hang
 *    forever with no diagnosis); the print button gates on every page being
 *    ready, and an unready page shows a do-not-print placeholder that also
 *    prints, so menu-print/Cmd+P can't emit blank map windows
 */

type ImgState = { status: 'loading' | 'ok' | 'error'; url?: string; message?: string };

const FETCH_TIMEOUT_MS = 15_000;

/** Home-screen PWAs and in-app browsers can't drive window.print() reliably. */
function printingSupported(): boolean {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/.test(navigator.userAgent);
  return !standalone && !inApp;
}

export default function MapPackPage({ tripId }: { tripId: string }) {
  const { data } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);

  const pack: MapPack | null = useMemo(
    () => (trip ? buildMapPack(trip, data.settings.paddleKmh, data.settings.hikeKmh) : null),
    [trip, data.settings.paddleKmh, data.settings.hikeKmh],
  );

  const pages = useMemo(() => {
    if (!pack) return [] as { key: string; page: PageSpec }[];
    return [
      { key: 'cover', page: pack.cover },
      ...pack.days.map((d) => ({ key: `day-${d.day}`, page: d.page })),
    ];
  }, [pack]);

  const [images, setImages] = useState<Record<string, ImgState>>({});
  const ctrls = useRef<Record<string, AbortController>>({});
  const urls = useRef<Record<string, string>>({});

  const fetchPage = useCallback((key: string, page: PageSpec) => {
    ctrls.current[key]?.abort();
    const ctrl = new AbortController();
    ctrls.current[key] = ctrl;
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    setImages((s) => ({ ...s, [key]: { status: 'loading' } }));
    fetch(wmsUrl(page), { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`map server replied ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('map server returned a non-image (service error)');
        if (urls.current[key]) URL.revokeObjectURL(urls.current[key]);
        const url = URL.createObjectURL(blob);
        urls.current[key] = url;
        setImages((s) => ({ ...s, [key]: { status: 'ok', url } }));
      })
      .catch((e: unknown) => {
        const message = ctrl.signal.aborted
          ? 'timed out after 15 s'
          : e instanceof TypeError
            ? 'network error'
            : e instanceof Error
              ? e.message
              : 'failed';
        setImages((s) => ({ ...s, [key]: { status: 'error', message } }));
      })
      .finally(() => clearTimeout(timer));
  }, []);

  useEffect(() => {
    for (const { key, page } of pages) fetchPage(key, page);
    const controllers = ctrls.current;
    const objectUrls = urls.current;
    return () => {
      for (const c of Object.values(controllers)) c.abort();
      for (const u of Object.values(objectUrls)) URL.revokeObjectURL(u);
    };
  }, [pages, fetchPage]);

  // Landscape page setup, alive only while this route is mounted (see header note).
  useEffect(() => {
    document.body.classList.add('mappack-print');
    const style = document.createElement('style');
    style.textContent = '@page { size: 11in 8.5in; margin: 0; }';
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove('mappack-print');
      style.remove();
    };
  }, []);

  if (!trip) {
    return (
      <main className="page">
        <div className="notice">
          Trip not found — it may not be saved on this device.{' '}
          <button className="btn small" onClick={() => navigate('trips')}>← All trips</button>
        </div>
      </main>
    );
  }
  if (!pack || pack.days.length === 0) {
    return (
      <main className="page">
        <div className="notice">
          This trip needs at least two stops before a map pack can be built.{' '}
          <button className="btn small" onClick={() => navigate('trips', trip.id)}>← Back to trip</button>
        </div>
      </main>
    );
  }

  const readyCount = pages.filter(({ key }) => images[key]?.status === 'ok').length;
  const allReady = readyCount === pages.length;
  const allFailed =
    pages.length > 0 && pages.every(({ key }) => images[key]?.status === 'error');
  const canPrint = printingSupported();

  return (
    <main className="mappack">
      <div className="mp-toolbar">
        <button className="btn ghost small" onClick={() => navigate('trips', trip.id)}>← Back to trip</button>
        <b>{trip.name || 'Keji trip'} — map pack</b>
        <span className={`chip ${allReady ? '' : 'muted'}`}>
          maps {readyCount}/{pages.length} loaded
        </span>
        {canPrint ? (
          <button className="btn right" onClick={() => window.print()} disabled={!allReady}
            title={allReady ? 'Print, or choose “Save as PDF” in the dialog' : 'Wait for every map to load'}>
            🖨 Print / Save as PDF
          </button>
        ) : (
          <span className="mp-guidance right">
            Printing isn’t available in this app view — open this trip in your browser on a
            computer to print or save the PDF.
          </span>
        )}
      </div>
      {allFailed && (
        <div className="notice mp-screen-only">
          The map server can’t be reached from here. This is usually the network, not the app:
          some DNS resolvers fail on <code>maps.geogratis.gc.ca</code> — try a different network,
          or set your DNS to 8.8.8.8, then retry the pages below.
        </div>
      )}
      <p className="tiny muted mp-screen-only">
        Print at <b>100% / Actual size</b> on Letter (fits A4 too). The scale bar on each page
        stays true even if a viewer scales the print.
      </p>

      <CoverSheet trip={{ name: trip.name, startDate: trip.startDate }} pack={pack}
        img={images['cover']} onRetry={() => fetchPage('cover', pack.cover)} />
      {pack.days.map((d) => (
        <DaySheet key={d.day} day={d} total={pack.days.length} tripName={trip.name}
          img={images[`day-${d.day}`]} onRetry={() => fetchPage(`day-${d.day}`, d.page)} />
      ))}
    </main>
  );
}

/* ---------- shared sheet furniture ---------- */

function project(bbox: Bbox, w: number, h: number, lat: number, lon: number): [number, number] {
  return [
    ((lon - bbox[0]) / (bbox[2] - bbox[0])) * w,
    ((bbox[3] - lat) / (bbox[3] - bbox[1])) * h,
  ];
}

function pointsAttr(bbox: Bbox, w: number, h: number, pts: [number, number][]): string {
  return pts.map(([lat, lon]) => project(bbox, w, h, lat, lon).map((n) => n.toFixed(1)).join(',')).join(' ');
}

/**
 * Route overlay for one page. Encodings are grayscale-redundant by design
 * (confirmed finding: hue-only route coding collapses on mono lasers):
 * paddle = solid dark on white casing, hike = long-dash, schematic = dotted,
 * carries = extra-bold dark red on casing with a lettered badge.
 */
function SegmentsOverlay({ page, segments }: { page: PageSpec; segments: LegSegment[] }) {
  const { bbox, widthPx: w, heightPx: h } = page;
  return (
    <>
      {segments.map((s, i) => {
        if (s.points.length < 2) return null;
        const pts = pointsAttr(bbox, w, h, s.points);
        const carry = !!s.portage;
        const stroke = carry ? '#7a1610' : '#123f3a';
        const width = carry ? 7 : 6.5;
        const dash = carry ? undefined : s.schematic ? '4 14' : undefined;
        return (
          <g key={i}>
            <polyline points={pts} fill="none" stroke="#fff" strokeWidth={carry ? 14 : 13}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.78} />
            <polyline points={pts} fill="none" stroke={stroke} strokeWidth={width}
              strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      {segments.filter((s) => s.portage && s.points.length > 0).map((s, i) => {
        const mid = s.points[Math.floor(s.points.length / 2)];
        const [mx, my] = project(bbox, w, h, mid[0], mid[1]);
        const letter = (s.portage ?? '').replace(/^P-/, '');
        return (
          <g key={`badge-${i}`}>
            <circle cx={mx} cy={my} r={19} fill="#7a1610" stroke="#fff" strokeWidth={3} />
            <text x={mx} y={my} dy={7} textAnchor="middle" fontSize={22} fontWeight={800}
              fill="#fff" fontFamily="Arial, sans-serif">{letter}</text>
          </g>
        );
      })}
    </>
  );
}

function Marker({ page, node, text, anchor = 'middle' }: {
  page: PageSpec; node: string; text: string; anchor?: 'start' | 'middle' | 'end';
}) {
  const place = placeById.get(node);
  if (!place) return null;
  const [x, y] = project(page.bbox, page.widthPx, page.heightPx, place.lat, place.lng);
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill="#2f5d46" stroke="#fff" strokeWidth={4} />
      <text x={x} y={y - 26} textAnchor={anchor} fontSize={30} fontWeight={800} fill="#1d3d2f"
        fontFamily="Arial, sans-serif" stroke="#fff" strokeWidth={6} paintOrder="stroke">{text}</text>
    </g>
  );
}

function MapWindow({ page, img, onRetry, children }: {
  page: PageSpec;
  img?: ImgState;
  onRetry: () => void;
  children: React.ReactNode; // overlay SVG content
}) {
  return (
    <div className="mp-mapwin">
      {img?.status === 'ok' ? (
        <>
          <img src={img.url} alt="topographic map" />
          <svg viewBox={`0 0 ${page.widthPx} ${page.heightPx}`} preserveAspectRatio="none">{children}</svg>
        </>
      ) : (
        <div className="mp-map-missing">
          <b>{img?.status === 'error' ? '⚠ Map failed to load' : '… loading map'}</b>
          {img?.status === 'error' && (
            <>
              <span>{img.message}</span>
              <button className="btn small mp-screen-only" onClick={onRetry}>↻ Retry this page</button>
              <span className="mp-noprint-note">Do not print this page until the map loads.</span>
            </>
          )}
        </div>
      )}
      <div className="mp-attr">
        Topo: Toporama © Natural Resources Canada — Contains information licensed under the
        Open Government Licence – Canada · Keji Camper (unofficial)
      </div>
      {page.clipped && (
        <div className="mp-clip-banner">route exceeds this page at 1:{page.scale.toLocaleString()} — edges are cut off</div>
      )}
    </div>
  );
}

function ScaleBarBox({ scale }: { scale: number }) {
  const bar = scaleBar(scale);
  const segs = bar.km <= 5 ? bar.km : 4;
  const step = bar.km / segs;
  return (
    <div className="mp-scalebox">
      <b>1:{scale.toLocaleString()}</b> · NAD83 ·{' '}
      <span className="mp-honesty">Print at 100% / Actual size — the bar below is true even if scaled</span>
      <div className="mp-bar" style={{ width: `${bar.mm}mm` }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} style={{ background: i % 2 ? '#fff' : '#2e2a22' }} />
        ))}
      </div>
      <div className="mp-ticks" style={{ width: `${bar.mm}mm` }}>
        {Array.from({ length: segs + 1 }).map((_, i) => (
          <span key={i}>{i === segs ? `${bar.km} km` : i * step}</span>
        ))}
      </div>
    </div>
  );
}

function NorthBox({ dateIso }: { dateIso: string }) {
  const decl = declinationDeg(dateIso || new Date().toISOString().slice(0, 10));
  return (
    <div className="mp-north">
      <svg width="26" height="34" viewBox="0 0 34 42">
        <polygon points="17,2 22,26 17,21 12,26" fill="#2e2a22" />
        <text x="17" y="38" textAnchor="middle" fontSize="11" fontWeight="bold">N</text>
      </svg>
      <div>Declination ≈{Math.abs(decl).toFixed(0)}°{decl < 0 ? 'W' : 'E'} — set your compass</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mp-legend">
      <span><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="#123f3a" strokeWidth="4" /></svg> paddle</span>
      <span><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="#123f3a" strokeWidth="4" strokeDasharray="7 5" /></svg> hike</span>
      <span><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="#7a1610" strokeWidth="5" /><circle cx="17" cy="5" r="4.5" fill="#7a1610" /></svg> portage (letter = carry)</span>
      <span><svg width="34" height="10"><circle cx="17" cy="5" r="5" fill="#2f5d46" stroke="#fff" /></svg> campsite</span>
      <span><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="#123f3a" strokeWidth="3" strokeDasharray="2 7" /></svg> schematic — not the exact path</span>
    </div>
  );
}

function EmergencyBox() {
  return (
    <div className="mp-emergency">
      <b>Emergency:</b>{' '}
      {EMERGENCY_LINES.map((l, i) => (
        <span key={l.label}>
          {i > 0 && ' · '}
          {l.label} {l.bold ? <b>{l.value}</b> : l.value}
        </span>
      ))}
      <br />
      Unofficial fan project — carry the official Backcountry Guide map & compass.
    </div>
  );
}

/* ---------- sheets ---------- */

function DaySheet({ day, total, tripName, img, onRetry }: {
  day: DayPlan;
  total: number;
  tripName: string;
  img?: ImgState;
  onRetry: () => void;
}) {
  const carries = day.carries.map((c) => `${(PORTAGE_NAMES[c.id] ?? c.id).replace('Portage ', '')} ${fmtCarry(c.carryM)}`);
  return (
    <section className="mp-sheet">
      <header>
        <div>
          <span className="mp-day">Day {day.day} of {total}</span>{' '}
          <span className="mp-trip">{tripName || 'Keji trip'}</span>
          <div className="mp-legline">
            {day.fromName} → {day.toName} · {day.mode}
            {day.dateIso && <> · {fmtDate(day.dateIso)}</>}
            {day.schematic && <b className="mp-warn"> · route line is schematic — not the exact path</b>}
          </div>
        </div>
        <div className="mp-stats">
          {fmtKm(day.km)}{day.exact ? '' : ' ≈'} · ~{fmtHours(day.hours)}
          <br />
          {carries.length > 0
            ? <>Carries: {carries.slice(0, 5).join(' · ')}{carries.length > 5 && <> · +{carries.length - 5} more</>}</>
            : 'No carries today'}
        </div>
      </header>

      <MapWindow page={day.page} img={img} onRetry={onRetry}>
        <SegmentsOverlay page={day.page} segments={day.segments} />
        <Marker page={day.page} node={day.from} text={`START · ${day.fromName.toUpperCase()}`} anchor="start" />
        <Marker page={day.page} node={day.to} text={`${day.day === total ? 'OUT' : 'CAMP'} · ${day.toName.toUpperCase()}`} />
      </MapWindow>

      <footer>
        <ScaleBarBox scale={day.page.scale} />
        <NorthBox dateIso={day.dateIso} />
        <Legend />
        <EmergencyBox />
      </footer>
    </section>
  );
}

function CoverSheet({ trip, pack, img, onRetry }: {
  trip: { name: string; startDate: string };
  pack: MapPack;
  img?: ImgState;
  onRetry: () => void;
}) {
  const days = pack.days;
  const nights = Math.max(0, days.length - 1);
  return (
    <section className="mp-sheet">
      <header>
        <div>
          <span className="mp-day">{trip.name || 'Keji backcountry trip'}</span>{' '}
          <span className="mp-trip">topo map pack</span>
          <div className="mp-legline">
            {trip.startDate ? fmtDate(trip.startDate) : 'date TBD'} · {days.length} travel day{days.length === 1 ? '' : 's'} ·{' '}
            {nights} night{nights === 1 ? '' : 's'} · {days.length + 1} pages (this overview + one per day)
          </div>
        </div>
        <div className="mp-stats">
          {fmtKm(days.reduce((k, d) => k + d.km, 0))} total ·{' '}
          {days.reduce((n, d) => n + d.carries.length, 0)} carries
        </div>
      </header>

      <div className="mp-cover-body">
        <MapWindow page={pack.cover} img={img} onRetry={onRetry}>
          {days.map((d) => <SegmentsOverlay key={d.day} page={pack.cover} segments={d.segments} />)}
          {days.map((d) => <DayBadge key={d.day} page={pack.cover} day={d} />)}
          <Marker page={pack.cover} node={days[0].from} text="START" anchor="start" />
        </MapWindow>

        <table className="mp-itinerary">
          <thead>
            <tr><th>Day</th><th>Route</th><th>Dist.</th><th>~Time</th><th>Carries</th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.fromName} → {d.toName} ({d.mode})</td>
                <td>{fmtKm(d.km)}{d.exact ? '' : ' ≈'}</td>
                <td>{fmtHours(d.hours)}</td>
                <td>{d.carries.map((c) => (PORTAGE_NAMES[c.id] ?? c.id).replace('Portage ', '')).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer>
        <ScaleBarBox scale={pack.cover.scale} />
        <NorthBox dateIso={trip.startDate} />
        <Legend />
        <EmergencyBox />
      </footer>
    </section>
  );
}

/** Numbered day badge at the midpoint of the day's drawn line. */
function DayBadge({ page, day }: { page: PageSpec; day: DayPlan }) {
  if (!day.midPoint) return null;
  const [x, y] = project(page.bbox, page.widthPx, page.heightPx, day.midPoint[0], day.midPoint[1]);
  return (
    <g>
      <circle cx={x} cy={y} r={17} fill="#f4ecd8" stroke="#2e2a22" strokeWidth={3} />
      <text x={x} y={y} dy={7} textAnchor="middle" fontSize={22} fontWeight={800} fill="#2e2a22"
        fontFamily="Arial, sans-serif">{day.day}</text>
    </g>
  );
}

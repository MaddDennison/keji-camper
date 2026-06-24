import { moonInfo, sunTimes } from '../lib/astro';
import { placeById } from '../data/sites';
import { addDaysIso, fmtCarry, fmtDate, fmtKm, fmtTime } from '../lib/format';
import { legCarries } from '../lib/routegeo';
import { fmtHours, legHours, route } from '../lib/routing';
import type { Camper, Trip } from '../types';

/**
 * Print-only trip sheet (v0.2): hidden on screen, becomes the whole document
 * in @media print. Paper belongs in a barrel.
 */
export default function PrintSheet({
  trip, campers, paddleKmh, hikeKmh,
}: {
  trip: Trip;
  campers: Camper[];
  paddleKmh: number;
  hikeKmh: number;
}) {
  const nights = Math.max(1, trip.stops.length - 2 || 1);
  const party = campers.filter((c) => trip.partyIds.includes(c.id));
  const name = (id: string) => placeById.get(id)?.name ?? id;

  return (
    <div className="print-sheet">
      <h1>🛶 {trip.name || 'Keji backcountry trip'}</h1>
      <p>
        <b>{trip.startDate ? fmtDate(trip.startDate) : 'date TBD'}</b> · {nights} night{nights === 1 ? '' : 's'}
        {party.length > 0 && <> · party: {party.map((c) => `${c.emoji} ${c.name}`).join(', ')}</>}
      </p>

      <h2>Route</h2>
      <table>
        <thead><tr><th>Leg</th><th>From → To</th><th>Mode</th><th>Distance</th><th>Est. time</th><th>Carries</th></tr></thead>
        <tbody>
          {trip.stops.slice(0, -1).map((from, i) => {
            const to = trip.stops[i + 1];
            const mode = trip.modes[i] ?? 'paddle';
            const r = from && to ? route(mode, from, to) : null;
            const carries = r ? legCarries(mode, r.path) : [];
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{name(from)} → {name(to)}</td>
                <td>{mode === 'paddle' ? 'paddle' : 'hike'}</td>
                <td>{r ? fmtKm(r.km) + (r.exact ? '' : ' ≈') : '—'}</td>
                <td>{r ? '~' + fmtHours(legHours(r.km, mode, mode === 'paddle' ? paddleKmh : hikeKmh)) : '—'}</td>
                <td>{carries.length ? carries.map((c) => `${c.id.slice(2)} (${fmtCarry(c.carryM)})`).join(', ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {trip.startDate && (
        <>
          <h2>Nights</h2>
          <table>
            <thead><tr><th>Night</th><th>Date</th><th>Sleep at</th><th>Sunset</th><th>True dark</th><th>Sunrise</th><th>Moon</th></tr></thead>
            <tbody>
              {Array.from({ length: nights }).map((_, n) => {
                const dateIso = addDaysIso(trip.startDate, n);
                const d = new Date(dateIso + 'T22:00:00');
                const sun = sunTimes(d);
                const moon = moonInfo(d);
                const stop = trip.stops[n + 1];
                return (
                  <tr key={n}>
                    <td>{n + 1}</td>
                    <td>{fmtDate(dateIso)}</td>
                    <td>{stop ? name(stop) : '—'}</td>
                    <td>{fmtTime(sun.sunset)}</td>
                    <td>{fmtTime(sun.darkStart)}–{fmtTime(sun.darkEnd)}</td>
                    <td>{fmtTime(sun.sunrise)}</td>
                    <td>{moon.emoji} {Math.round(moon.illumination * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {trip.notes && (
        <>
          <h2>Notes</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{trip.notes}</p>
        </>
      )}

      <h2>Float plan (leave with someone at home)</h2>
      <div className="float-plan">
        <p>Vehicle & plate: ____________________ &nbsp; Put-in/out: ____________________</p>
        <p>Expected return (date/time): ____________________ &nbsp; Call for help if not heard from by: ____________________</p>
      </div>

      <h2>Emergency</h2>
      <ul>
        <li>Emergencies: <b>911</b></li>
        <li>Parks Canada 24-h emergency dispatch: <b>1-877-852-3100</b></li>
        <li>Kejimkujik Visitor Centre: 902-682-2772</li>
        <li>Cell coverage in the backcountry is unreliable — file this float plan before you launch.</li>
      </ul>

      <p className="print-foot">
        Keji Camper · unofficial fan project, not Parks Canada · distances from Friends of Keji charts ·
        verify conditions at parks.canada.ca before departure
      </p>
    </div>
  );
}

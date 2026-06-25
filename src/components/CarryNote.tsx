import { fmtCarry } from '../lib/format';
import { carriesFor } from '../lib/mapdata';

/**
 * One quiet line naming the carry(ies) a site sits on, with lengths drawn from
 * portageMeters (never typed into prose). The little bar echoes the red portage
 * line on the map.
 */
export default function CarryNote({ ids }: { ids?: string[] }) {
  const carries = carriesFor(ids);
  if (carries.length === 0) return null;

  const letter = (name: string) => name.replace('Portage ', '');
  const text =
    carries.length === 1
      ? `Portage ${letter(carries[0].name)} · ${fmtCarry(carries[0].meters)} carry`
      : `Portages ${carries.map((c) => `${letter(c.name)} · ${fmtCarry(c.meters)}`).join(' & ')}`;

  return (
    <p className="small carry-note">
      <span className="carry-dot" aria-hidden="true" />
      {text}
    </p>
  );
}

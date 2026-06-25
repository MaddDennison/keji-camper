import type { Place } from '../types';

/**
 * Generative passport stamp (v0.2 / F5). Pure SVG, deterministic per site:
 * the site id seeds rotation, ink colour and wear so every stamp is unique
 * but stable across renders, exports and share cards.
 */

const INKS = [
  { ink: '#9c4220', name: 'rust' },
  { ink: '#1d3d2f', name: 'pine' },
  { ink: '#3f6f6a', name: 'lake' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function motifPath(p: Place): JSX.Element {
  // simple line-art motifs by kind/access, drawn in a 24×14 box centred on 0,0
  if (p.kind === 'cabin') {
    return (
      <g strokeWidth="1.6" fill="none">
        <path d="M-8 5 V-1 L0 -7 L8 -1 V5 Z" />
        <path d="M-2.5 5 V0 H2.5 V5" />
      </g>
    );
  }
  if (p.access === 'hike') {
    return (
      <g strokeWidth="1.6" fill="none">
        <path d="M-9 5 L-3 -5 L1 1 L4 -3 L9 5 Z" />
        <circle cx="6.5" cy="-6" r="2.2" />
      </g>
    );
  }
  if (p.kind === 'group' || p.kind === 'walkin') {
    return (
      <g strokeWidth="1.6" fill="none">
        <path d="M-10 5 L-5 -4 L0 5 Z M0 5 L5 -4 L10 5 Z" />
      </g>
    );
  }
  return (
    <g strokeWidth="1.6" fill="none">
      <path d="M-10 0 Q0 4.5 10 0 Q5 5 0 5 Q-5 5 -10 0 Z" />
      <path d="M0 -5 V0 M-2.5 -3 L0 -5 L2.5 -3" />
    </g>
  );
}

export default function Stamp({
  place, year, size = 116, ghost = false,
}: {
  place: Place;
  year?: string;
  size?: number;
  ghost?: boolean;
}) {
  const h = hash(place.id);
  const rot = (h % 13) - 6;
  const ink = INKS[h % INKS.length].ink;
  const uid = `st-${place.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const wearSeed = (h % 97) + 1;

  // TODO(v0.3 F14, docs/PLAN-v0.3.md): long lake names clip on the top arc below —
  // fit them (auto-shrink to the arc / abbreviate) or truncate deliberately.
  const topText = place.lake.split('/')[0].trim().toUpperCase();
  const bottomText = 'KEJIMKUJIK BACKCOUNTRY';

  if (ghost) {
    return (
      <svg viewBox="-60 -60 120 120" width={size} height={size} aria-label={`${place.name} — not yet visited`}>
        <circle r="54" fill="none" stroke="rgba(46,42,34,0.3)" strokeWidth="2" strokeDasharray="6 6" />
        <text y="10" textAnchor="middle" fontFamily="Bitter, serif" fontWeight="900" fontSize="34"
          fill="rgba(46,42,34,0.25)">{place.label}</text>
      </svg>
    );
  }

  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size} aria-label={`${place.name} stamp${year ? `, first visit ${year}` : ''}`}>
      <defs>
        <path id={`${uid}-top`} d="M -44 0 A 44 44 0 0 1 44 0" />
        <path id={`${uid}-bot`} d="M -41 0 A 41 41 0 0 0 41 0" />
        <filter id={`${uid}-rough`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={wearSeed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
          <feComponentTransfer><feFuncA type="linear" slope="0.92" /></feComponentTransfer>
        </filter>
      </defs>
      <g transform={`rotate(${rot})`} filter={`url(#${uid}-rough)`} stroke={ink} fill={ink}>
        <circle r="56" fill="none" strokeWidth="3.2" />
        <circle r="50.5" fill="none" strokeWidth="1.2" />
        <circle r="30" fill="none" strokeWidth="1.1" />
        <text fontFamily="Work Sans, sans-serif" fontWeight="700" fontSize="8.6" letterSpacing="1.6" stroke="none">
          <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">{topText}</textPath>
        </text>
        <text fontFamily="Work Sans, sans-serif" fontWeight="600" fontSize="6.6" letterSpacing="1.8" stroke="none" opacity="0.85">
          <textPath href={`#${uid}-bot`} startOffset="50%" textAnchor="middle">{bottomText}</textPath>
        </text>
        <g transform="translate(0,-16)">{motifPath(place)}</g>
        <text y="14" textAnchor="middle" fontFamily="Bitter, serif" fontWeight="900"
          fontSize={place.label.length > 2 ? 22 : 30} stroke="none">{place.label}</text>
        <text y="25" textAnchor="middle" fontFamily="Work Sans, sans-serif" fontWeight="700"
          fontSize="6.4" letterSpacing="1.4" stroke="none">{year ? `EST’D ${year}` : '★ ★ ★'}</text>
      </g>
    </svg>
  );
}

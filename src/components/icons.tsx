// Tiny inline icon set (stroke = currentColor) — retro-simple line work.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconMap = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

export const IconCanoe = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M2 13q10 5 20 0-2 5-10 5T2 13Z" />
    <path d="M12 4v7M9 7.5 12 5l3 2.5" />
  </svg>
);

export const IconJournal = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
    <path d="M5 4a2 2 0 0 0 2 2h11M9 10h6M9 13.5h6" />
  </svg>
);

export const IconTent = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 4 2 20h20L12 4Z" />
    <path d="m12 12-4 8M12 12l4 8" />
  </svg>
);

export const IconStar = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M17 3a7 7 0 0 0 4 9 7 7 0 1 1-4-9Z" />
    <path d="m7 5 .6 1.6L9 7l-1.4.5L7 9l-.6-1.5L5 7l1.4-.4L7 5ZM10 11l.5 1.2 1.2.5-1.2.5L10 14.5l-.5-1.3-1.2-.5 1.2-.5L10 11Z" />
  </svg>
);

export const IconInfo = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8.2v.1M12 11v5" />
  </svg>
);

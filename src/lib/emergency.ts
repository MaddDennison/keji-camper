/**
 * Emergency contacts printed on trip artifacts. Single source of truth —
 * PrintSheet and the map pack both render from here so safety content can
 * never drift between the two print paths.
 */
export const EMERGENCY_LINES = [
  { label: 'Emergencies', value: '911', bold: true },
  { label: 'Parks Canada 24-h emergency dispatch', value: '1-877-852-3100', bold: true },
  { label: 'Kejimkujik Visitor Centre', value: '902-682-2772', bold: false },
] as const;

export const EMERGENCY_NOTE =
  'Cell coverage in the backcountry is unreliable — file this float plan before you launch.';

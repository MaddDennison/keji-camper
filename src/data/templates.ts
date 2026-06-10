import type { TravelMode } from '../types';

/**
 * One-tap starting points for the classic Keji routes (v0.2 / F7).
 * Stops use routing-node ids; modes per leg. Notes condensed from the
 * route research in docs/DATA.md sources.
 */
export interface TripTemplate {
  id: string;
  name: string;
  emoji: string;
  nights: number;
  stops: string[];
  modes: TravelMode[];
  blurb: string;
}

export const TRIP_TEMPLATES: TripTemplate[] = [
  {
    id: 'first-timer',
    name: 'First-timer overnight',
    emoji: '⛺',
    nights: 1,
    stops: ['jakes', '13', 'merrymakedge'],
    modes: ['paddle', 'paddle'],
    blurb:
      'Rent at Jakes Landing, a 2 km paddle to the Ritchie Island cluster, and a short hop ' +
      'out to Merrymakedge in the morning. The perfect introduction — big-trip feeling, tiny commitment.',
  },
  {
    id: 'frozen-ocean',
    name: 'Frozen Ocean Loop',
    emoji: '🛶',
    nights: 3,
    stops: ['bigdam', '4', '7', '11', 'jakes'],
    modes: ['paddle', 'paddle', 'paddle', 'paddle'],
    blurb:
      'The classic three-nighter: up Still Brook to Frozen Ocean’s big lonely water, then down ' +
      'the Little River to Kejimkujik Lake and out at Jakes Landing. Needs a car shuttle (or add a day back to Big Dam).',
  },
  {
    id: 'southern-lakes',
    name: 'Southern Lakes Loop',
    emoji: '🏞',
    nights: 4,
    stops: ['jakes', '24', '30', '40', '31', 'jakes'],
    modes: ['paddle', 'paddle', 'paddle', 'paddle', 'paddle'],
    blurb:
      'Keji Lake to Minards Bay, over the portage chain to Lower Silver, then west to remote Peskawa ' +
      'and back along Peskowesk. A dozen carries — bring one barrel, not three. Cross the big lakes early; wind builds by noon.',
  },
  {
    id: 'liberty-lake',
    name: 'Liberty Lake Thru-hike',
    emoji: '🥾',
    nights: 3,
    stops: ['bigdam', '44', '42', 'W1', 'eelweir'],
    modes: ['hike', 'hike', 'hike', 'hike'],
    blurb:
      'The park’s big walk: Big Dam to Eel Weir around the wilderness perimeter — Stewart Brook, ' +
      'the most remote site in the park at Liberty Lake, and a night at Mason’s Cabin to finish. ~56 km over four days.',
  },
];

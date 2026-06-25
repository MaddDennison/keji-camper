export type Access = 'paddle' | 'hike' | 'both';
export type PlaceKind = 'site' | 'cabin' | 'group' | 'walkin' | 'launch';

export interface Place {
  id: string; // chart/routing node id, e.g. "12", "W1", "bigdam"
  label: string; // short label for pins, e.g. "12", "W1", "BD"
  name: string;
  lake: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
  access: Access;
  blurb: string;
  tips?: string;
  // Portage ids (e.g. 'P-R') this site physically sits on, in travel order.
  // Lengths are never stored here — they render from portageMeters so they
  // stay in sync with the GPX. Sites merely *near* a carry keep it in prose.
  carries?: string[];
  bookable?: boolean; // appears in the Parks Canada reservation system
}

export type TravelMode = 'paddle' | 'hike';

export interface TripLeg {
  from: string; // place id
  to: string;
  mode: TravelMode;
}

export type TripStatus = 'dream' | 'planned' | 'completed';

/** Fork provenance (M4): which remote entity this copy came from. */
export interface Origin {
  owner: string; // profile id of the original owner
  id: string; // their entity id
}

export interface Trip {
  id: string;
  name: string;
  startDate: string; // ISO yyyy-mm-dd of night 1
  // ordered place ids; legs derived between consecutive stops. Each interior stop
  // is currently one night (nights derive from count).
  // TODO(v0.3 F12, docs/PLAN-v0.3.md): allow same-day stops — scenic detours and
  // basecamp day trips that add travel without adding a night.
  stops: string[];
  modes: TravelMode[]; // modes[i] = mode of leg stops[i] -> stops[i+1]
  /** modesLocked[i]: the user explicitly chose modes[i]; smart inference must not touch it */
  modesLocked?: boolean[];
  /** legRoutes[i]: chosen portage-routing option for leg i where it branches (0/undefined = default). */
  legRoutes?: number[];
  partyIds: string[];
  notes: string;
  status: TripStatus;
  /** Co-attribution (M4): profile ids of everyone who was there; travels with forks. */
  attendees?: string[];
  /** Set only on forked copies; powers de-dupe so re-accepts never duplicate. */
  origin?: Origin;
}

export interface Camper {
  id: string;
  name: string;
  emoji: string;
  /** Links this local crew tag to a real account (M4); unset = plain local tag. */
  profileId?: string;
}

export interface Memory {
  id: string;
  placeId: string;
  tripId?: string;
  authorId?: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  text: string;
  rating: number; // 1..5 paddles
  tags: string[];
  photos: string[]; // small data-URLs
  /** Co-attribution (M4): profile ids of everyone who was there; travels with forks. */
  attendees?: string[];
  /** Set only on forked copies; powers de-dupe so re-accepts never duplicate. */
  origin?: Origin;
}

export interface Settings {
  paddleKmh: number;
  hikeKmh: number;
  userName: string;
}

export interface AppData {
  version: 1;
  campers: Camper[];
  trips: Trip[];
  memories: Memory[];
  settings: Settings;
}

export interface RouteResult {
  km: number;
  exact: boolean; // true when the value is straight from a published chart
  path: string[]; // node ids traversed (chart nodes)
}

/**
 * A month-by-month guide to the night sky over Kejimkujik (latitude 44.4° N),
 * written for naked eyes and binoculars at a Dark-Sky Preserve.
 */

export interface MonthSky {
  month: number; // 1-12
  headline: string;
  constellations: string[];
  highlights: string[];
}

export const MONTHLY_SKY: MonthSky[] = [
  {
    month: 1,
    headline: 'The winter giants',
    constellations: ['Orion', 'Taurus', 'Gemini', 'Canis Major', 'Auriga'],
    highlights: [
      'Orion due south by mid-evening — the Orion Nebula (M42) is naked-eye from Keji’s dark sky.',
      'Sirius, the brightest star, glitters over the southern treeline.',
      'The Pleiades ride high in Taurus; count how many you can split.',
    ],
  },
  {
    month: 2,
    headline: 'The Winter Hexagon',
    constellations: ['Orion', 'Canis Minor', 'Auriga', 'Taurus', 'Gemini'],
    highlights: [
      'Trace the Winter Hexagon: Sirius → Rigel → Aldebaran → Capella → Pollux → Procyon.',
      'On crisp nights the winter Milky Way runs faintly through Auriga and Monoceros.',
    ],
  },
  {
    month: 3,
    headline: 'The Bear climbs',
    constellations: ['Ursa Major', 'Leo', 'Cancer', 'Gemini'],
    highlights: [
      'The Big Dipper — Muin, the Bear of Mi’kmaw sky stories — stands on its handle in the northeast.',
      'The Beehive Cluster (M44) in Cancer is a binocular gem straight overhead.',
      'Leo rises in the east: spring is coming.',
    ],
  },
  {
    month: 4,
    headline: 'Galaxies and the Herdsman',
    constellations: ['Ursa Major', 'Leo', 'Boötes', 'Virgo'],
    highlights: [
      'Mizar & Alcor, the Dipper’s double star, split easily from a dark campsite.',
      'Follow the Dipper’s arc to Arcturus, then spike to Spica.',
      'Lyrid meteors peak around April 22.',
    ],
  },
  {
    month: 5,
    headline: 'Soft spring nights',
    constellations: ['Boötes', 'Virgo', 'Corona Borealis', 'Ursa Major'],
    highlights: [
      'Corona Borealis — the Northern Crown — is a perfect little arc high in the east.',
      'Eta Aquariid meteors (Halley’s Comet dust) streak the pre-dawn sky in early May.',
      'Loons and barred owls provide the soundtrack.',
    ],
  },
  {
    month: 6,
    headline: 'Short nights, first fireflies',
    constellations: ['Hercules', 'Lyra', 'Scorpius (low)', 'Boötes'],
    highlights: [
      'The great globular cluster M13 in Hercules — a fuzzy snowball in binoculars.',
      'Vega blazes in the northeast as true dark finally arrives near midnight.',
      'Antares, the red heart of Scorpius, skims the southern horizon over the lakes.',
    ],
  },
  {
    month: 7,
    headline: 'The Milky Way returns',
    constellations: ['Cygnus', 'Lyra', 'Aquila', 'Sagittarius (low)', 'Scorpius (low)'],
    highlights: [
      'The Summer Triangle — Vega, Deneb, Altair — frames the Milky Way overhead by late evening.',
      'Look south over open water: the “teapot” of Sagittarius marks the centre of our galaxy.',
      'Delta Aquariid meteors build through late July.',
    ],
  },
  {
    month: 8,
    headline: 'Perseids over the lake',
    constellations: ['Cygnus', 'Aquila', 'Cassiopeia (rising)', 'Sagittarius (low)'],
    highlights: [
      'Perseid meteors peak around August 12 — lie back on a warm granite slab and count.',
      'The Milky Way arches horizon to horizon; the Cygnus star clouds are dazzling from Peskawa or Frozen Ocean.',
      'Watch for the zodiacal light before dawn late in the month.',
    ],
  },
  {
    month: 9,
    headline: 'Andromeda rising',
    constellations: ['Pegasus', 'Andromeda', 'Cassiopeia', 'Cygnus'],
    highlights: [
      'The Andromeda Galaxy (M31) — 2.5 million light-years — is naked-eye from any Keji campsite.',
      'The Great Square of Pegasus climbs the east: autumn’s signpost.',
      'Equinox nights bring the year’s fastest-lengthening darkness.',
    ],
  },
  {
    month: 10,
    headline: 'Harvest skies',
    constellations: ['Pegasus', 'Andromeda', 'Cassiopeia', 'Perseus'],
    highlights: [
      'Orionid meteors around October 21.',
      'Cassiopeia’s “W” stands high in the northeast — your pointer to M31 and the Double Cluster.',
      'Fomalhaut, the lonely autumn star, glints low in the south.',
    ],
  },
  {
    month: 11,
    headline: 'Frost and the Seven Sisters',
    constellations: ['Taurus', 'Perseus', 'Andromeda', 'Cassiopeia'],
    highlights: [
      'The Pleiades clear the eastern trees by early evening — winter’s herald.',
      'Leonid meteors peak around November 17.',
      'Crisp, transparent nights: the best limiting magnitude of the year.',
    ],
  },
  {
    month: 12,
    headline: 'Geminids — the year’s best',
    constellations: ['Orion (rising)', 'Taurus', 'Gemini', 'Auriga'],
    highlights: [
      'Geminid meteors peak December 13–14, up to two a minute under Keji’s dark sky.',
      'Orion returns in full by late evening; the long nights give 14+ hours of darkness.',
      'Ursid meteors offer a quiet encore near the solstice.',
    ],
  },
];

export const DARK_SKY_FACTS: string[] = [
  'Kejimkujik was designated a Dark-Sky Preserve by the Royal Astronomical Society of Canada in 2010 — outdoor lighting in the park is controlled to protect the night.',
  'In the backcountry there is essentially no local light pollution: on a clear moonless night the Milky Way casts visible structure from horizon to horizon.',
  'The park runs Dark-Sky programming in summer (including at the Sky Circle near Jeremy’s Bay) — check the Parks Canada events calendar.',
  'For 4,000+ years the Mi’kmaq have read this sky. Kejimkujik is a National Historic Site in recognition of that living cultural landscape.',
];

export const MIKMAW_SKY_NOTE =
  'In Mi’kmaw star knowledge, the bowl of the Big Dipper is Muin, the Celestial Bear, ' +
  'pursued through the seasons by seven bird hunters — the stars of the Dipper’s handle and nearby Boötes. ' +
  'As autumn comes, the bear “falls” to the horizon and the leaves redden. ' +
  'Hear the story told properly at a Parks Canada Dark-Sky event with Mi’kmaw interpreters — it is theirs to tell; ' +
  'this app only points you toward it.';

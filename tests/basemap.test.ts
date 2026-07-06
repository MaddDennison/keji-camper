import { describe, expect, it } from 'vitest';
import mapViewSrc from '../src/components/MapView.tsx?raw';
import { TOPORAMA_WMS } from '../src/lib/basemaps';

// The old default (Esri World_Topo_Map) is frozen since ~2021 and retires
// March 2028 / December 2029; these pin the replacement so it can't drift back.
describe('default basemap (NRCan Toporama WMS)', () => {
  it('pins the Toporama WMS config (1.1.1 is the only version the service speaks)', () => {
    expect(TOPORAMA_WMS.url).toBe('https://maps.geogratis.gc.ca/wms/toporama_en');
    expect(TOPORAMA_WMS.params.version).toBe('1.1.1');
    expect(TOPORAMA_WMS.params.layers).toBe('WMS-Toporama');
    expect(TOPORAMA_WMS.params.format).toBe('image/png');
    expect(TOPORAMA_WMS.params.attribution).toContain('Natural Resources Canada');
    expect(TOPORAMA_WMS.params.attribution).toContain('Open Government Licence');
  });

  it('keeps the retired World_Topo_Map service out of the map component', () => {
    expect(mapViewSrc).not.toContain('World_Topo_Map');
  });
});

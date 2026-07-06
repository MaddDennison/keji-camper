/** Default basemap: NRCan Toporama WMS. Speaks WMS 1.1.1 only; kept as pure
 *  data so the node-env test suite can assert it without importing Leaflet. */
export const TOPORAMA_WMS = {
  url: 'https://maps.geogratis.gc.ca/wms/toporama_en',
  params: {
    layers: 'WMS-Toporama',
    format: 'image/png',
    version: '1.1.1',
    maxZoom: 17,
    // WMS tiles are rendered per-request (no CDN); only fetch once panning
    // settles, and keep recently-seen tiles around for back-and-forth pans.
    updateWhenIdle: true,
    keepBuffer: 4,
    attribution: 'Toporama © Natural Resources Canada — Open Government Licence – Canada',
  },
};

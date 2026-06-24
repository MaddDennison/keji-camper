import type { TravelMode } from '../types';

/**
 * Official Kejimkujik backcountry distance charts, transcribed from the
 * Friends of Keji Cooperating Association PDFs (friendsofkeji.ns.ca):
 *
 *   - Backcountry Hiking Distance Chart            (mode: hike)
 *   - Frozen Ocean Loop Canoeing Distances         (mode: paddle, portages included)
 *   - Kejimkujik Lake & Lower Mersey Canoeing      (mode: paddle, portages included)
 *   - South District Canoeing Distances            (mode: paddle, portages included)
 *   - Upper Mersey River Canoeing Distances        (mode: paddle)
 *   - Grafton Lake Canoeing Distances              (mode: paddle)
 *
 * Each chart stores its upper triangle: tri[i][k] = km between nodes[i] and
 * nodes[i + 1 + k]. `0.05` encodes “adjacent” cells the source leaves blank
 * (e.g. Portage S lands at Site 5). A handful of cells in the source charts
 * disagree between the two printed triangles or break the triangle
 * inequality; those are listed in QUIRKS / EXCLUDED_EDGES and documented in
 * docs/DATA.md. Values are presented as published — travel times derived
 * from them are estimates.
 */

export interface Chart {
  id: string;
  name: string;
  mode: TravelMode;
  nodes: string[];
  tri: number[][];
}

const ADJ = 0.05; // “same spot” blank cells in the source charts

export const CHARTS: Chart[] = [
  {
    id: 'hiking',
    name: 'Backcountry Hiking Distance Chart',
    mode: 'hike',
    nodes: ['bigdam', '1', '3', '5', '6', '7', '17', '22', '25', '28', 'W1', '38', '41', '42', '43', '44', '45', '46', 'eelweir'],
    tri: [
      [1.3, 3.2, 10.38, 13, 12.2, 5.02, 35.6, 58.9, 50, 37.5, 32.8, 33.7, 24.9, 17.8, 14, 9.84, 10, 55.7],
      [1.8, 8.4, 9, 9.7, 17.2, 31.5, 57.9, 49, 36.5, 31.8, 32.7, 21.1, 14, 10.4, 7.9, 6.8, 54.7],
      [6.6, 7.2, 7.9, 15.4, 29.7, 56.1, 47.2, 34.7, 30, 30.9, 19.3, 12.2, 8.6, 6.1, 5, 52.9],
      [0.7, 3.7, 7.86, 25.3, 52.4, 42.8, 29.2, 33.7, 26.6, 15.4, 8.2, 4.6, 2.5, 1.1, 41.7],
      [5, 7.1, 26, 53.1, 43.5, 29.9, 34.4, 27.3, 16, 8.9, 5.3, 3.7, 1.8, 42.4],
      [11.4, 21.6, 48.7, 39.1, 25.5, 30, 22.9, 11.6, 4.5, 0.9, 1.2, 2.6, 38],
      [33, 60.1, 50.5, 36.9, 41.4, 37.3, 23, 15.9, 12.3, 10, 8.6, 49.4],
      [46.4, 28.7, 16.6, 20.5, 14.1, 10, 17.1, 20.3, 22.4, 23.5, 34.1],
      [9.3, 21.8, 20.7, 17.2, 36.1, 43.5, 38.1, 49.6, 50.6, 9.1],
      [12.33, 11.4, 16.6, 26.8, 34.2, 37.8, 40.3, 41.3, 5.82],
      [3.6, 4.62, 13.9, 21.4, 25, 27.5, 28.9, 17.9],
      [9, 17.5, 25, 28.6, 31.3, 32.5, 16.8],
      [10.55, 18, 21.2, 23.3, 24.4, 22],
      [7.1, 10.3, 12.88, 13.5, 31.8],
      [3.2, 5.3, 6.4, 39.3],
      [2.1, 3.2, 42.9],
      [1.1, 45.5],
      [46.4],
    ],
  },
  {
    id: 'frozenocean',
    name: 'Frozen Ocean Loop Canoeing Distances',
    mode: 'paddle',
    nodes: ['bigdam', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '17', 'indianpoint', 'jakes', 'kedge', 'luxie', 'meadows', 'P-Q', 'P-R', 'P-S', 'P-T', 'P-U', 'P-V', 'P-W', 'slapfoot', 'tmboundary', 'tmmouth', 'wrmouth'],
    tri: [
      [0.9, 1.4, 2.4, 4.0, 5.3, 6.0, 6.0, 7.3, 13.6, 12.0, 14.0, 12.0, 17.7, 19.8, 19.2, 16.4, 20.4, 0.4, 3.8, 7.5, 10.1, 10.5, 13.6, 15.8, 20.6, 5.0, 3.3, 17.4],
      [0.7, 1.6, 3.3, 7.1, 7.9, 8.0, 8.9, 12.9, 13.6, 15.6, 13.6, 19.4, 21.5, 20.9, 18.1, 20.7, 0.5, 3.1, 6.8, 9.4, 9.9, 12.9, 15.1, 19.9, 4.1, 2.4, 16.7],
      [0.9, 2.6, 6.4, 7.2, 7.3, 8.2, 12.2, 12.9, 14.9, 12.9, 18.7, 20.8, 20.2, 17.4, 20.0, 1.0, 2.4, 6.1, 8.7, 9.2, 12.2, 14.4, 19.2, 3.5, 1.8, 16.0],
      [1.3, 5.1, 5.9, 5.9, 6.9, 10.9, 11.6, 13.6, 11.6, 17.4, 19.5, 18.9, 16.1, 18.7, 2.0, 1.1, 4.8, 7.4, 7.9, 10.9, 13.1, 17.9, 2.9, 1.2, 14.7],
      [4.6, 4.5, 6.2, 7.5, 8.8, 11.3, 13.3, 11.3, 17.0, 19.1, 18.5, 15.7, 19.7, 3.6, 0.2, 3.6, 5.3, 5.8, 8.8, 11.0, 15.8, 2.5, 0.8, 12.6],
      [0.7, 0.7, 2.0, 6.0, 6.7, 8.7, 6.7, 12.5, 14.6, 14.0, 11.2, 13.8, 4.9, 4.0, ADJ, 2.5, 3.0, 6.0, 8.2, 13.0, 6.3, 4.6, 9.8],
      [0.8, 1.9, 5.9, 6.6, 8.6, 6.6, 12.4, 14.5, 13.9, 11.1, 13.7, 5.6, 3.9, 0.7, 2.4, 2.9, 5.9, 8.1, 12.9, 7.1, 5.4, 9.7],
      [1.4, 5.4, 6.1, 8.1, 6.1, 11.9, 14.0, 13.4, 10.6, 13.2, 5.6, 4.7, 0.7, 1.9, 2.4, 5.4, 7.6, 12.4, 7.1, 5.4, 9.2],
      [4.0, 4.7, 6.7, 4.7, 10.5, 12.6, 12.0, 9.2, 11.8, 6.9, 6.0, 2.0, 0.5, 1.0, 4.0, 6.2, 11.0, 8.3, 6.6, 7.8],
      [1.2, 3.2, 1.5, 6.9, 9.0, 8.4, 5.6, 9.6, 13.2, 8.2, 6.0, 0.7, 1.7, ADJ, 2.3, 6.8, 12.2, 10.5, 3.6],
      [2.0, 2.1, 5.8, 7.9, 7.3, 4.5, 7.1, 11.6, 10.7, 6.7, 3.8, 3.2, 0.5, 1.5, 6.3, 12.7, 11.0, 3.1],
      [4.1, 3.7, 5.8, 5.2, 2.4, 5.0, 13.6, 12.7, 8.7, 5.8, 5.2, 2.5, 0.4, 4.2, 14.7, 13.0, 1.0],
      [7.8, 9.9, 9.3, 6.5, 9.1, 11.6, 10.7, 6.7, 3.8, 3.2, 1.5, 3.8, 8.3, 12.8, 11.1, 5.1],
      [3.6, 1.5, 1.3, 2.7, 17.3, 16.4, 12.4, 9.5, 8.9, 6.2, 4.1, 2.1, 18.3, 16.6, 4.0],
      [1.1, 4.9, 3.3, 19.4, 18.5, 14.5, 11.6, 11.0, 8.3, 6.2, 2.6, 20.5, 18.8, 7.6],
      [2.8, 2.6, 18.8, 17.9, 13.9, 11.0, 10.4, 7.7, 5.6, 1.8, 19.7, 18.0, 4.9],
      [4.0, 16.0, 15.1, 11.1, 8.2, 7.6, 4.9, 2.8, 3.4, 16.9, 15.2, 2.7],
      [20.0, 19.1, 15.1, 12.2, 11.6, 8.9, 6.8, 0.8, 20.3, 18.6, 5.2],
      [3.4, 7.1, 9.7, 10.1, 13.2, 15.4, 20.2, 4.6, 2.9, 17.0],
      [3.0, 4.7, 5.2, 8.2, 10.4, 15.2, 2.3, 0.6, 12.0],
      [2.5, 3.0, 6.0, 8.2, 13.0, 6.1, 4.4, 9.8],
      [0.2, 0.7, 3.7, 5.9, 8.5, 6.8, 10.7],
      [1.7, 4.0, 8.5, 9.1, 7.4, 5.3],
      [1.6, 6.1, 12.2, 10.5, 2.9],
      [4.6, 14.5, 12.8, 1.8],
      [18.9, 17.2, 6.1],
      [1.7, 16.0],
      [14.3],
    ],
  },
  {
    id: 'kejilake',
    name: 'Kejimkujik Lake & Lower Mersey River Canoeing Distances',
    mode: 'paddle',
    nodes: ['11', '12', '13', '14', '15', '16', '18', '19', '20', '21', '22', '23', '24', 'fairybay', 'indianpoint', 'jakes', 'kedge', 'lanternrock', 'lrmersey', 'luxie', 'meadows', 'merrymakedge', 'P-A', 'P-E', 'P-O', 'P-P', 'P-W', 'slapfoot', 'wrmouth'],
    tri: [
      [4.0, 4.4, 4.6, 3.3, 3.5, 6.5, 7.0, 1.6, 4.4, 5.0, 11.5, 6.7, 5.0, 3.7, 5.8, 5.2, 5.6, 13.7, 2.4, 5.0, 6.0, 6.7, 6.7, 9.1, 11.5, 0.4, 4.2, 1.0],
      [0.4, 0.4, 1.0, 2.9, 3.5, 3.6, 3.6, 7.2, 7.8, 8.5, 4.0, 1.3, 1.2, 2.0, 1.3, 1.9, 10.7, 1.7, 2.3, 2.1, 4.0, 3.9, 6.1, 8.5, 4.6, 1.8, 4.5],
      [0.3, 1.3, 3.1, 3.4, 3.8, 4.1, 7.6, 8.2, 8.4, 4.0, 1.3, 1.5, 2.1, 1.4, 2.6, 10.6, 2.0, 2.9, 1.6, 4.0, 4.0, 6.0, 8.4, 4.7, 2.1, 4.6],
      [1.8, 2.4, 3.0, 3.4, 4.4, 8.2, 8.8, 8.0, 3.8, 1.7, 1.7, 2.4, 1.8, 2.1, 10.2, 2.0, 2.9, 2.3, 3.8, 3.8, 5.6, 8.0, 5.1, 2.2, 4.8],
      [2.1, 3.2, 3.7, 3.2, 7.0, 7.6, 8.2, 3.6, 2.1, 1.0, 2.4, 2.2, 2.6, 10.4, 0.9, 2.6, 3.0, 3.6, 3.6, 5.8, 8.2, 3.8, 1.8, 3.6],
      [3.0, 3.4, 2.3, 6.4, 7.0, 8.0, 3.2, 4.1, 2.8, 4.4, 4.4, 2.7, 10.2, 1.8, 4.5, 4.0, 3.2, 3.2, 5.6, 8.0, 3.8, 3.6, 3.0],
      [0.6, 5.2, 9.5, 10.1, 5.0, 1.4, 4.7, 4.5, 5.6, 4.8, 1.0, 7.2, 4.2, 5.8, 4.0, 1.4, 1.5, 2.6, 5.0, 7.0, 5.0, 6.1],
      [5.8, 10.0, 10.6, 5.6, 2.0, 4.8, 4.8, 5.6, 5.1, 1.2, 7.8, 4.8, 6.5, 4.0, 2.0, 2.1, 3.2, 5.6, 7.9, 5.6, 6.6],
      [4.6, 5.2, 10.2, 5.2, 4.8, 3.4, 5.0, 4.2, 5.2, 12.4, 2.1, 4.7, 5.8, 5.2, 5.2, 7.8, 10.2, 1.9, 3.8, 1.2],
      [0.6, 14.5, 9.4, 8.6, 3.0, 11.0, 8.3, 9.2, 16.7, 6.1, 8.6, 9.6, 9.7, 9.7, 12.1, 14.5, 5.2, 9.5, 3.4],
      [15.1, 10.0, 9.2, 8.0, 11.6, 8.9, 9.8, 17.3, 6.7, 9.2, 10.2, 10.3, 10.3, 12.7, 15.1, 5.8, 10.1, 4.0],
      [6.0, 9.7, 9.5, 10.6, 9.8, 6.0, 12.2, 9.2, 10.8, 9.0, 6.4, 6.5, 1.4, ADJ, 12.0, 10.0, 11.1],
      [5.2, 5.0, 6.0, 5.5, 2.0, 8.6, 4.4, 5.9, 4.8, ADJ, 0.4, 4.0, 4.0, 6.8, 5.2, 6.0],
      [1.8, 1.4, 1.0, 3.4, 11.9, 2.4, 2.8, 1.6, 5.2, 5.2, 7.3, 4.6, 4.8, 2.1, 5.2],
      [1.9, 1.5, 3.7, 11.7, 1.2, 1.0, 2.8, 4.8, 4.8, 7.1, 7.8, 4.1, 0.4, 4.0],
      [1.1, 4.4, 12.8, 4.9, 3.3, 6.5, 6.2, 6.2, 8.2, 12.0, 4.7, 2.6, 7.6],
      [3.8, 12.0, 2.8, 2.6, 2.3, 5.6, 5.6, 7.4, 12.6, 3.9, 1.8, 4.9],
      [8.2, 3.5, 4.8, 2.7, 1.8, 2.1, 3.6, 8.6, 6.2, 4.1, 5.8],
      [11.4, 13.0, 11.2, 8.6, 8.7, 3.8, 2.1, 14.2, 12.2, 13.3],
      [4.0, 3.5, 4.6, 4.6, 6.8, 7.8, 2.8, 3.4, 2.7],
      [4.0, 6.0, 6.0, 8.4, 7.6, 2.1, 0.8, 5.2],
      [4.7, 4.7, 6.6, 8.6, 5.8, 3.2, 6.2],
      [0.4, 4.0, 8.1, 7.2, 5.5, 6.3],
      [4.1, 4.6, 7.2, 5.5, 6.3],
      [2.1, 9.6, 7.6, 8.7],
      [12.0, 10.0, 11.1],
      [2.4, 1.8],
      [6.1],
    ],
  },
  {
    id: 'south',
    name: 'South District Canoeing Distances',
    mode: 'paddle',
    nodes: ['24', '25', '26', '27', '29', '30', '31', '32', '34', 'W1', '38', '40', 'lucifee', 'pebbleboundary', 'peskwharf', 'P-A', 'P-B', 'P-C', 'P-D', 'P-E', 'P-F', 'P-G', 'P-H', 'P-I', 'P-J', 'P-K', 'P-L', 'P-M', 'P-N'],
    tri: [
      [2.4, 4.6, 3.4, 5.9, 7.9, 4.4, 5.0, 7.0, 10.8, 10.9, 11.6, 13.2, 11.5, 5.6, ADJ, 1.8, 2.9, 4.6, 0.4, 3.8, 6.1, 7.6, 8.2, 5.6, 8.5, 9.5, 10.8, 9.2],
      [2.2, 3.1, 5.0, 6.9, 2.0, 2.6, 4.0, 8.5, 7.6, 9.2, 10.8, 9.2, 4.7, 2.5, 4.4, 3.1, 3.7, ADJ, 1.4, 5.1, 6.7, 7.3, 3.2, 6.1, 7.1, 8.4, 6.8],
      [0.9, 2.8, 3.9, 2.8, 3.4, 4.8, 9.3, 8.4, 9.9, 11.5, 10.0, 2.5, 3.4, 2.2, 0.9, 1.5, 2.2, 2.2, 2.9, 4.5, 5.1, 4.0, 6.9, 7.9, 9.2, 7.6],
      [2.5, 4.4, 3.9, 4.5, 5.9, 10.4, 9.5, 11.0, 12.6, 11.1, 2.2, 2.2, 0.9, ADJ, 1.2, 3.1, 3.3, 2.6, 4.2, 4.8, 5.1, 8.0, 9.0, 10.3, 8.7],
      [2.0, 2.7, 2.7, 1.1, 8.5, 7.6, 9.1, 10.7, 9.2, 0.1, 4.7, 3.8, 2.5, 0.7, 2.5, 2.7, 0.2, 1.8, 2.4, 2.2, 6.2, 7.2, 8.4, 6.8],
      [4.6, 4.6, 3.1, 10.1, 9.5, 11.0, 12.6, 10.8, 2.0, 6.7, 5.8, 4.5, 2.6, 6.8, 4.6, 1.0, ADJ, 0.4, 3.6, 9.0, 10.0, 11.3, 9.9],
      [0.6, 2.0, 6.5, 5.6, 7.1, 8.8, 7.1, 3.0, 5.8, 5.2, 3.9, 3.2, 1.9, ADJ, 2.8, 4.6, 4.2, 1.2, 4.1, 5.1, 6.4, 4.8],
      [2.0, 5.8, 4.9, 6.5, 8.1, 6.5, 3.0, 6.4, 5.8, 4.5, 3.2, 2.5, 0.6, 2.8, 4.6, 4.2, 1.2, 3.5, 4.5, 5.8, 4.1],
      [7.8, 7.1, 8.6, 10.2, 8.5, 1.4, 5.8, 4.6, 3.3, 1.5, 3.9, 2.0, 1.3, 2.9, 3.5, 1.5, 5.4, 6.4, 7.7, 6.3],
      [2.3, 2.4, 3.0, 0.7, 8.8, 13.2, 12.3, 10.4, 9.2, 8.5, 6.5, 8.5, 10.1, 10.0, 7.0, 2.0, 1.0, 0.1, 2.3],
      [1.5, 3.1, 3.0, 7.7, 11.3, 10.7, 9.5, 8.1, 7.6, 5.6, 7.7, 9.5, 9.1, 6.1, 1.6, 5.3, 2.2, ADJ],
      [1.6, 3.1, 9.2, 12.8, 12.2, 11.0, 9.6, 9.1, 7.1, 9.2, 11.0, 10.6, 7.6, 3.4, 2.4, 2.3, 1.6],
      [3.7, 10.8, 14.4, 13.8, 12.6, 11.2, 10.7, 8.7, 10.8, 12.6, 12.2, 9.2, 4.2, 3.2, 2.9, 3.1],
      [9.5, 13.9, 13.0, 11.1, 9.9, 9.2, 7.2, 9.2, 10.8, 10.7, 7.7, 2.7, 1.7, 0.6, 3.0],
      [4.8, 3.9, 2.6, 0.4, 2.6, 2.8, 0.2, 1.9, 2.5, 2.3, 6.4, 7.3, 8.7, 6.9],
      [1.0, 1.9, 3.6, 2.5, 5.5, 4.9, 6.5, 6.9, 6.9, 9.9, 10.9, 13.1, 10.6],
      [0.8, 2.1, 4.4, 4.2, 4.0, 5.6, 6.2, 6.0, 10.0, 11.0, 12.2, 10.6],
      [1.2, 3.1, 3.3, 2.6, 4.2, 4.8, 5.1, 8.0, 9.0, 10.3, 8.7],
      [3.7, 3.2, 0.8, 2.5, 3.1, 2.9, 6.9, 7.9, 9.1, 7.5],
      [1.3, 5.1, 6.7, 7.3, 3.2, 6.1, 7.1, 8.4, 6.8],
      [2.8, 4.6, 4.2, 1.2, 4.1, 5.1, 6.4, 4.8],
      [0.8, 1.4, 2.2, 6.3, 7.3, 8.6, 6.9],
      [0.4, 3.6, 9.0, 10.0, 11.3, 9.9],
      [1.8, 7.7, 8.7, 10.0, 8.3],
      [4.2, 5.7, 7.0, 5.1],
      [0.6, 1.9, 0.8],
      [0.9, 5.3],
      [2.2],
    ],
  },
  {
    id: 'uppermersey',
    name: 'Upper Mersey River Canoeing Distances',
    mode: 'paddle',
    nodes: ['fairybay', 'indianpoint', 'jakes', 'jline', 'kedge', 'lookoff2', 'meadows', 'merrymakedge', 'oakledges', 'oldestillwater', 'powerline', 'rogersbrook', 'slapfoot', 'visitorcentre'],
    tri: [
      [1.8, 1.4, 4.9, 1.0, 7.4, 2.8, 1.6, 7.8, 9.8, 2.3, 2.0, 2.1, 8.8],
      [1.9, 5.4, 1.5, 7.9, 1.0, 2.8, 8.3, 10.3, 2.7, 2.4, 0.4, 9.3],
      [3.5, 1.1, 6.0, 3.3, 6.5, 6.4, 8.4, 0.8, 0.5, 2.3, 7.4],
      [4.6, 2.5, 6.8, 10.0, 2.9, 4.9, 2.7, 3.0, 2.6, 3.9],
      [7.1, 2.6, 2.3, 7.5, 9.5, 1.9, 1.6, 1.8, 8.5],
      [6.0, 12.5, 0.4, 2.4, 5.2, 5.5, 8.3, 1.4],
      [4.0, 9.7, 11.7, 4.1, 3.8, 0.8, 10.7],
      [12.9, 14.9, 7.3, 7.0, 3.2, 13.9],
      [2.0, 5.6, 5.9, 8.7, 1.0],
      [7.6, 7.9, 10.7, 1.0],
      [0.3, 2.8, 6.6],
      [3.1, 6.9],
      [9.7],
    ],
  },
  {
    id: 'grafton',
    name: 'Grafton Lake Canoeing Distances',
    mode: 'paddle',
    nodes: ['clarypoint', 'minardbrook', 'morganisland', 'sweeneybrook', 'graftonwharf'],
    tri: [
      [1.6, 0.8, 1.3, 1.3],
      [0.9, 2.8, 2.0],
      [1.9, 1.1],
      [2.3],
    ],
  },
];

/**
 * Estimated connector edges (NOT from the published charts). These wire
 * on-water places that no paddle chart lists into the routing graph, so they
 * stop returning “no paddle route”. Distances are open-water estimates; routes
 * that use them are flagged ≈. (Carries are handled separately in portages.ts.)
 */
export const EXTRA_EDGES: { a: string; b: string; km: number; mode: TravelMode }[] = [
  // Wil-Bo-Wil cabin is absent from the charts; rough links near Peskowesk’s east end.
  { a: 'W2', b: 'peskwharf', km: 0.7, mode: 'paddle' },
  { a: 'W2', b: '29', km: 0.8, mode: 'paddle' },
  // Eel Weir sits on the water at the foot of Keji Lake but appears only in the
  // hiking chart, so by canoe it was a dead end. Link it across the south end of
  // Keji Lake to Lantern Rock (open paddle, ~3.4 km); the Mersey-side route down
  // past the dam is the Portage O carry in portages.ts.
  { a: 'eelweir', b: 'lanternrock', km: 3.4, mode: 'paddle' },
  // (Sites 45 & 46 overlook Frozen Ocean Lake but are reached up the Liberty
  // Lake / Channel Lake trails, so they stay hike-access — no paddle connector.)
  // The hiking chart footnote: West River Trail junction (on the Liberty Lake
  // Trail) to Site 22 is 6.4 km. We expose it as 22 <-> 42 / 22 <-> 41 hike
  // links via the published row for 22 already, so nothing extra needed here.
];

/**
 * Chart cells that contradict the rest of their own chart (triangle-inequality
 * breaks or mismatched triangles in the source PDFs). They are still shown in
 * the chart viewer, but the route planner ignores them. See docs/DATA.md.
 */
export const EXCLUDED_EDGES = new Set([
  'fairybay|P-P', //  4.6 km printed; other rows imply ≈ 14
  'P-E|P-P', //       4.6 km printed; via Portage O it is ≥ 6.2
  '21|indianpoint', // 3.0 km printed; West River mouth alone is 3.4 + 4.0
  '25|44', //         38.1 km printed in hiking chart; neighbouring rows imply ≈ 47
]);

/** Pretty names for chart-only nodes (waypoints that are not campsites). */
export const WAYPOINT_NAMES: Record<string, string> = {
  bigdam: 'Big Dam parking',
  eelweir: 'Eel Weir parking',
  jakes: 'Jakes Landing',
  indianpoint: 'Indian Point',
  kedge: 'Kedge Beach',
  luxie: 'Luxie Cove picnic site',
  meadows: 'Meadow Beach',
  slapfoot: 'Slapfoot Beach',
  merrymakedge: 'Merrymakedge',
  fairybay: 'Fairy Bay',
  lanternrock: 'Lantern Rock',
  lrmersey: 'Lower Mersey boundary',
  wrmouth: 'West River mouth',
  tmboundary: 'Thomas Meadow boundary',
  tmmouth: 'Thomas Meadow mouth',
  peskwharf: 'Peskowesk wharf',
  lucifee: 'Lucifee Brook',
  pebbleboundary: 'Pebbleloggitch boundary',
  jline: 'J-Line bridge',
  lookoff2: 'Look-off #2',
  oakledges: 'Oak Ledges',
  oldestillwater: 'Olde Stillwater boundary',
  powerline: 'Power line',
  rogersbrook: 'Rogers Brook',
  visitorcentre: 'Visitor Centre',
  graftonwharf: 'Grafton Lake wharf',
  clarypoint: 'Clary Point',
  minardbrook: 'Minard Brook mouth',
  morganisland: 'Morgan Island',
  sweeneybrook: 'Sweeney Brook mouth',
};

export const PORTAGE_NAMES: Record<string, string> = {
  'P-A': 'Portage A', 'P-B': 'Portage B', 'P-C': 'Portage C', 'P-D': 'Portage D',
  'P-E': 'Portage E', 'P-F': 'Portage F', 'P-G': 'Portage G', 'P-H': 'Portage H',
  'P-I': 'Portage I', 'P-J': 'Portage J', 'P-K': 'Portage K', 'P-L': 'Portage L',
  'P-M': 'Portage M', 'P-N': 'Portage N', 'P-O': 'Portage O', 'P-P': 'Portage P',
  'P-Q': 'Portage Q', 'P-R': 'Portage R', 'P-S': 'Portage S', 'P-T': 'Portage T',
  'P-U': 'Portage U', 'P-V': 'Portage V', 'P-W': 'Portage W',
};

import { smoothLine } from './geo.js';

// The place, measured off aerial photos and set down in meters.
// Origin: the middle of the house's front wall, at ground level.
// +x is east (toward the road), +z is south, +y is up. North is -z.

// Elevation grids are centered here (in world meters).
export const DEM_CENTER = { x: 18.5, z: 15.7 };

// County road out front, north to south. Smoothed when drawn.
export const ROAD = [
  [-81, -684], [-41, -644], [18, -564], [43, -434], [48, -234], [40, -124],
  [30.7, -41.4], [25.1, 0], [18.6, 47.4], [5, 112], [-26, 316], [-31, 341],
];
export const ROAD_SOUTH = [[-322, 496], [-212, 396], [-82, 356], [-31, 341], [200, 337], [720, 335]];
export const ROAD_WIDTH = 6.6;

// Dirt farm road heading northeast across the road, and the gravel lane to the northwest.
export const DIRT_NE = [[28.6, 2.6], [32, 0.4], [70, -52], [110, -108], [168, -204], [278, -354], [400, -520]];
export const LANE_NW = [[38.5, -109], [7.5, -100], [-31, -83], [-64, -61], [-97, -46], [-119, -42], [-141, -50], [-174, -113], [-201, -158], [-240, -210]];

export const ROAD_SMOOTH = smoothLine(ROAD, 12);

// x of the road centerline at a given z (the road runs north-south, z increases southward).
export function roadX(z) {
  const P = ROAD_SMOOTH;
  if (z <= P[0][1]) return P[0][0];
  let lo = 0, hi = P.length - 1;
  if (z >= P[hi][1]) return P[hi][0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][1] <= z) lo = m; else hi = m; }
  const t = (z - P[lo][1]) / (P[hi][1] - P[lo][1]);
  return P[lo][0] + (P[hi][0] - P[lo][0]) * t;
}

// Buildings: axis-aligned footprints [x0, z0, x1, z1].
export const HOUSE = {
  main: [-10, -13, 0, 13.7],        // the long front wing, gable ridge north-south
  garage: [-19.6, -13, -10, -3.4],   // back wing on the north end; the big doors face west
  bump: [0, -7.6, 0.6, -0.6],        // front room that steps forward
  floorY: 0.55,
  eaveY: 3.05,
  sideDoorX: -7.4,                   // north wall, lines up with the shop's walk door
};
// Out back: a deck off the sliding door, looking down into a walled pit at basement level,
// with stairs down on the south end.
export const PIT = { rect: [-15.6, -2.2, -10, 11.6], depth: 2.15, stairs: [-15.6, 10.3, -11.7, 11.6] };
export const DECK = [-13.0, 1.4, -10, 7.2];
export const SHOP = { rect: [-17, -28.1, 3, -18.1], eaveY: 5.0, leanTo: [-22.2, -28.4, -17, -19.4], walkDoorX: -7.4 };
// The concrete pull-in from the shop's big door all the way to the road.
export const APRON = [3, -26.6, 24.4, -19.6];
export const SIDEWALK = [-8.0, -18.1, -6.8, -13.0];
// Mowers and four-wheelers lived in this one.
export const UTILITY_SHED = { rect: [-38.5, 24.2, -30.2, 36.5] };
// The real horse shed: small and square, open to the north pasture, our door on the north side.
export const HORSE_SHED = { rect: [-35, -35, -28.5, -28.5] };
export const HOOP = [-25.6, -14.0];
export const GARDEN = [-33, -2.4, -24.6, 21.4];
export const SIGN = { x: 19.4, z: -10.6, lines: ['BOWLES STATELINE', 'DAIRY EQUIPMENT'] };
// A low wall of fieldstone in the island inside the circular drive, following the slope down.
export const ROCK_WALL = [[17.6, 13.2], [14.2, 10.2], [12.5, 5.8], [12.4, 1.6], [13.6, -1.4], [15.6, -3.4]];
export const ROCKS = [[3, -26.6], [24.6, -26.6], [26.6, -38.5], [3, -38.5]];
export const ARENA = [-43.7, 22.9, 9.6, 45.1];

export const NEIGHBORS = [
  { rect: [-3, -58, 17, -44], roof: 'red', y: 0 },        // north, right past the rocks
  { rect: [-42, 60, -26, 74], roof: 'dark', y: 0 },       // south, with its own loop drive
  { rect: [-83, 70, -71, 85], roof: 'metal', y: 0, shop: true },
  { rect: [64, -131, 80, -114], roof: 'blue', y: 0 },     // across the road, north
  { rect: [-38, 150, -22, 162], roof: 'metal', y: 0 },
];

// Circular asphalt drive: enters from the road on the south, swings past the front door,
// and leaves toward the shop apron on the north.
export const DRIVE = [
  [20.6, 21.4], [15.5, 19.6], [10.4, 16.6], [6.8, 12.2], [5.0, 7.0], [4.6, 2.6],
  [5.0, -2.5], [6.6, -7.6], [9.4, -11.6], [13.4, -14.4], [17.6, -15.6], [22.0, -16.0],
];
export const DRIVE_WIDTH = 3.7;
export const FRONT_PAD = [0.3, 0.9, 3.4, 4.3];   // concrete landing at the front steps
export const FRONT_DOOR_Z = 2.6;

export const LAWN = [
  [-20.0, -18.0], [3.0, -18.0], [3.0, -19.4], [22.6, -19.4], [17.2, 22.2], [-33, 22.2], [-33, -3.0], [-20.0, -3.0],
];
export const GRAVEL = [
  [-46, -40], [3, -40], [3, -18], [-20.2, -18.0], [-20.2, -3.4], [-33.4, -3.4], [-33.4, 22.4], [-46, 22.4],
];
export const NEIGHBOR_LAWNS = [
  [[-8, -64], [22, -64], [24.6, -39.5], [-8, -39.5]],
  [[-48, 54], [-18, 54], [-18, 80], [-48, 80]],
];

// Trees: kind, x, z, height (m), spread (canopy radius, m)
export const TREES = [
  { kind: 'birch', x: 2.6, z: 10.6, h: 10.5, r: 3.6, stems: 3 },
  { kind: 'birch', x: 4.0, z: 13.4, h: 9.0, r: 3.0, stems: 2 },
  { kind: 'spruce', x: 12.4, z: -4.8, h: 14.5, r: 4.4 },
  { kind: 'ash', x: 9.6, z: -16.4, h: 15.5, r: 6.4 },
  { kind: 'maple', x: -3.0, z: 18.8, h: 11, r: 5.2 },
  { kind: 'ash', x: -15.5, z: 17.8, h: 13, r: 5.6 },
  { kind: 'spruce', x: -24.5, z: -9.5, h: 11.5, r: 3.4 },
  // the north neighbor's yard
  { kind: 'ash', x: 21, z: -42, h: 15, r: 6.5 },
  { kind: 'maple', x: -6.5, z: -41.5, h: 11, r: 5 },
  { kind: 'spruce', x: 20, z: -61, h: 13, r: 4 },
  // south neighbor
  { kind: 'ash', x: -20, z: 66, h: 12, r: 5 },
  { kind: 'spruce', x: -45, z: 58, h: 10, r: 3.2 },
];
// The grove along the lane down the bluff to the northwest.
export const GROVE_LINE = [[-88, -46], [-66, -70], [-48, -88], [-31, -112], [-9, -127], [8, -138], [30, -146]];

// Fences. Each run is a polyline; type picks the build.
export const FENCES = [
  // west pasture, board fence
  { type: 'board', pts: [[-45, -18], [-92, -18], [-92, 50], [-45, 50], [-45, 45.1]], gate: null },
  { type: 'board', pts: [[-45, 22.9], [-45, 9], ], gate: null },
  { type: 'board', pts: [[-45, 4.5], [-45, -18]], gate: null },
  // north pasture: its east side runs into the horse shed, which opens onto it
  { type: 'board', pts: [[-35, -18], [-45, -18]] },
  { type: 'board', pts: [[-35, -18], [-35, -28.5]] },
  { type: 'board', pts: [[-35, -35], [-35, -42], [-92, -42], [-92, -18]] },
  // arena, pipe rail
  { type: 'pipe', pts: [[-43.7, 22.9], [-14.5, 22.9]] },
  { type: 'pipe', pts: [[-10.5, 22.9], [9.6, 22.9], [9.6, 45.1], [-43.7, 45.1], [-43.7, 22.9]] },
  // white rail along the south drive entrance, with the lamp post at its end
  { type: 'white', pts: [[16.6, 21.2], [11.4, 22.6], [6.4, 23.0]] },
  // far boundaries: wire on wood posts
  { type: 'wire', pts: [[15, 50], [-45, 50]] },
  { type: 'wire', pts: [[-92, 50], [-92, 140], [-210, 140], [-210, -40], [-150, -40], [-120, -42], [-92, -42]] },
  { type: 'wire', pts: [[-92, 50], [-210, 50]] },
  { type: 'wire', pts: [[-150, 50], [-150, -40]] },
  // field across the road
  { type: 'wire', pts: [[31.5, -60], [28.6, -2]] },
];

// The big irrigation canal across the road: down the road's east side, then off to the
// northeast alongside the dirt farm road.
export const CANAL = [
  [12.8, 120], [20.9, 80], [27.0, 50], [29.2, 36], [32.6, 22], [36.0, 11], [38.6, 4.5],
  [75.7, -47.9], [115.7, -103.9], [173.7, -200], [283.7, -350],
];
export const CANAL_SHAPE = { top: 7.2, bottom: 2.6, depth: 1.75, water: 0.85 };

export const LAMP_POST = [16.9, 20.6];
export const MAILBOX = [19.6, 23.4];

// Impact sprinklers on the lawn: position, throw radius, arc start/end (radians from +x, counterclockwise seen from above)
export const SPRINKLERS = [
  { x: 10.8, z: 6.0, radius: 9.5, from: -1.9, to: 1.6, bib: [0.0, 7.4] },
  { x: -8.4, z: 18.2, radius: 8.0, from: -3.1, to: 0.4, bib: [-7.0, 13.7] },
];

// Wheel line irrigation in the field across the road.
export const WHEEL_LINE = { x: 78, z0: -36, z1: 150, spacing: 12.2 };

// Horses graze the west pasture.
export const PASTURE_WEST = [-91, -17, -46, 49];
export const PASTURE_NW = [-91, -41, -36, -19];

// Where you can walk.
export const WALK_BOUNDS = [-205, -120, 64, 135];
export const SPAWN = { x: 17.5, z: 8.5, yaw: Math.PI * 0.5 + 0.12 };

// Power line poles run up the west side of the road.
export function polePositions() {
  const out = [];
  for (let z = -430; z <= 330; z += 91) out.push([roadX(z) - 5.6, z]);
  return out;
}

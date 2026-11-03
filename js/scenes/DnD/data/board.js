// Board size, table placement, and ground types.

export const N = 8;
export const TILE = 0.07;
export const HALF = N * TILE / 2;
export const TABLE_Y = 0.74;
export const BOARD_Z = -0.24;
export const ADV = 42;
export const MP_MAX = 3;

export const GROUNDS = ['stone', 'grass', 'floor', 'dirt', 'water', 'sand'];
export const GROUND = {
   stone: { label: 'Stone', color: [.55, .58, .62], night: [.28, .30, .36], block: false, h: 1 },
   grass: { label: 'Grass', color: [.34, .62, .28], night: [.14, .28, .14], block: false, h: 1 },
   floor: { label: 'Ledge', color: [.55, .36, .18], night: [.26, .16, .10], block: false, h: 1 },
   dirt:  { label: 'Dirt',  color: [.52, .34, .18], night: [.26, .16, .10], block: false, h: 1 },
   water: { label: 'Water', color: [.20, .48, .82], night: [.08, .18, .36], block: true,  h: 0.55 },
   sand:  { label: 'Sand',  color: [.86, .62, .28], night: [.42, .30, .14], block: false, h: 1 },
};

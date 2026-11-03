// Builds every card. Each panel lives in ui/.

import { bindArt } from './models.js';
import { makeHud } from './ui/hud.js';
import { makeGodSheet } from './ui/god.js';
import { makeTileSheet } from './ui/tiles.js';
import { makeChestTray } from './ui/chest.js';
import { makeBackpack } from './ui/pack.js';
import { makeInspect } from './ui/inspect.js';
import { makeFightTray } from './ui/fight.js';

export const createUI = (model, stage, hooks) => {
   bindArt(model);
   const god = makeGodSheet(stage);
   const tiles = makeTileSheet(stage);
   const chest = makeChestTray(model);
   const pack = makeBackpack(model);
   const inspect = makeInspect(model);
   const fight = makeFightTray(model);
   const hud = makeHud(model, hooks);
   tiles.hide();
   chest.hide();
   pack.hide();
   inspect.hide();
   fight.hide();
   return { god, tiles, chest, pack, inspect, fight, hud };
};

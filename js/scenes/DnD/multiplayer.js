import * as CG from '../../render/core/cg.js';
import * as Data from './data.js';

const { startHero, MP_MAX, N, KIND, GROUND } = Data;

const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const startPlayers = () => ({
   0: { hero: startHero(), mp: MP_MAX, mode: 'god' },
   1: { hero: { ...startHero(), c: 3, r: 1, face: Math.PI }, mp: MP_MAX, mode: 'adv' },
});

const boardState = S => ({
   players: {
      ...copy(S.players),
      ...(S.playerSlot != null ? {
         [S.playerSlot]: { hero: copy(S.hero), mp: S.mp, mode: S.mode },
      } : {}),
   },
   turn: S.turn, night: S.night,
   nextPid: S.nextPid,
   ground: Object.fromEntries(S.ground.flatMap((row, r) => row.map((id, c) => [r + ',' + c, id]))),
   pieces: Object.fromEntries(S.pieces.map(p => [p.id, copy(p)])),
});

const changes = (before, after, path = []) => {
   const result = [];
   for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const p = path.concat(key), a = before[key], b = after[key];
      if (same(a, b)) continue;
      if (b === undefined) result.push({ path: p, remove: true });
      else if (a && b && !Array.isArray(a) && !Array.isArray(b)
         && typeof a === 'object' && typeof b === 'object') result.push(...changes(a, b, p));
      else result.push({ path: p, value: copy(b) });
   }
   return result;
};

const applyChanges = (board, delta) => {
   for (const change of delta) {
      let target = board;
      for (const key of change.path.slice(0, -1)) {
         target = target[key];
         if (!target) break;
      }
      if (!target) continue;
      const key = change.path[change.path.length - 1];
      if (change.remove) delete target[key];
      else target[key] = copy(change.value);
   }
};

const reconcile = (target, source) => {
   for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
   for (const key of Object.keys(source)) {
      const a = target[key], b = source[key];
      if (a && b && typeof a === 'object' && typeof b === 'object'
         && !Array.isArray(a) && !Array.isArray(b)) reconcile(a, b);
      else if (!same(a, b)) target[key] = copy(b);
   }
};

const installBoard = (g, board, slot) => {
   const { S } = g;
   reconcile(S.players, board.players);
   if (slot >= 0) {
      if (S.playerSlot !== slot) S.mode = S.players[slot].mode;
      S.playerSlot = slot;
      S.hero = S.players[slot].hero;
      S.mp = S.players[slot].mp;
   }
   for (const key of ['turn', 'night', 'nextPid']) S[key] = board[key];
   for (let r = 0; r < S.ground.length; r++)
      for (let c = 0; c < S.ground[r].length; c++) S.ground[r][c] = board.ground[r + ',' + c];
   for (const piece of [...S.pieces]) if (!board.pieces[piece.id]) g.removePiece(piece);
   for (const data of Object.values(board.pieces)) {
      const piece = S.pieces.find(p => p.id === data.id);
      if (piece) reconcile(piece, data);
      else g.restorePiece(copy(data));
   }
   if (S.drag && S.drag.piece && !board.pieces[S.drag.piece.id]) S.drag = null;
   if (S.combat && !board.pieces[S.combat.piece.id]) {
      S.combat = null;
      S.roll = null;
      g.ui.fight.hide();
      g.say('The encounter was removed from the board.');
   }
};

const occupied = (board, c, r, exceptSlot) => Object.entries(board.players)
   .some(([slot, p]) => Number(slot) !== exceptSlot && p.hero.c === c && p.hero.r === r);
const blocked = (board, c, r) => !Number.isInteger(c) || !Number.isInteger(r)
   || c < 0 || c >= N || r < 0 || r >= N || GROUND[board.ground[r + ',' + c]].block
   || Object.values(board.pieces).some(p => p.c === c && p.r === r && KIND[p.kind].block);

const processAction = (shared, slot, session, action) => {
   const { board, claims } = shared;
   const player = board.players[slot];
   if (action.type === 'claim') {
      for (const resource of action.resources) {
         if (!board.pieces[resource.slice(6)] && resource.startsWith('piece:'))
            return 'That object is no longer on the board.';
         if (claims[resource] && claims[resource] !== session)
            return 'The other player is using that object.';
      }
      for (const resource of action.resources) claims[resource] = session;
   } else if (action.type === 'release') {
      if (claims[action.resource] === session) delete claims[action.resource];
   } else if (action.type === 'releaseAll') {
      for (const resource of Object.keys(claims)) if (claims[resource] === session) delete claims[resource];
   } else if (action.type === 'move') {
      const { c, r } = action;
      if (occupied(board, c, r, slot)) return 'The other pawn occupies that square.';
      if (blocked(board, c, r)) return 'That square is blocked.';
      if (!action.teleport && (player.mode !== 'adv' || player.mp <= 0
         || Math.abs(player.hero.c - c) + Math.abs(player.hero.r - r) !== 1))
         return 'That step is no longer available.';
      if (action.teleport && player.mode !== 'god') return 'Only god can reposition a pawn.';
      player.hero.face = Math.atan2(c - player.hero.c, r - player.hero.r);
      player.hero.c = c; player.hero.r = r;
      if (!action.teleport) player.mp--;
   } else if (action.type === 'turn') {
      if (player.mode !== 'adv') return 'Only a pawn can end a turn.';
      board.turn++;
      player.mp = MP_MAX;
      if (board.turn % 4 === 0) {
         board.night = !board.night;
         if (!board.night) for (const p of Object.values(board.players)) p.hero.insp = 1;
      }
   }
   return null;
};

const applyPlayerChanges = (shared, slot, session, delta) => {
   let error = null;
   const moving = new Map();
   for (const change of delta) if (change.path[0] === 'pieces' && ['c', 'r'].includes(change.path[2])) {
      const id = change.path[1];
      if (!moving.has(id)) moving.set(id, copy(shared.board.pieces[id] || {}));
      moving.get(id)[change.path[2]] = change.value;
   }
   for (const change of delta) {
      const [section, key, field] = change.path;
      if (section === 'nextPid') {
         shared.board.nextPid = Math.max(shared.board.nextPid, change.value);
         continue;
      }
      if (section === 'turn' || section === 'night') continue;
      if (section === 'players' && (Number(key) !== slot
         || (field === 'hero' && ['c', 'r', 'face'].includes(change.path[3])))) continue;
      if (section === 'pieces') {
         const existing = shared.board.pieces[key];
         if (existing && shared.claims['piece:' + key] !== session) {
            error = 'The other player is using that object.';
            continue;
         }
         const target = moving.get(key);
         if (target && ['c', 'r'].includes(field)
            && (occupied(shared.board, target.c, target.r)
               || Object.values(shared.board.pieces).some(p => String(p.id) !== key && p.c === target.c && p.r === target.r))) {
            error = 'That tile is taken.';
            continue;
         }
         if (!existing && change.path.length === 2 && !change.remove) {
            const piece = change.value;
            if (occupied(shared.board, piece.c, piece.r)
               || Object.values(shared.board.pieces).some(p => p.c === piece.c && p.r === piece.r)) {
               error = 'That tile is taken.';
               continue;
            }
         }
         if (section === 'ground' && shared.claims['tile:' + key] !== session) {
            error = 'The other player is using that tile.';
            continue;
         }
      }
      applyChanges(shared.board, [change]);
   }
   return error;
};

const installMultiplayer = g => {
   server.neverLoadOrSave();
   server.init('dndClients', {});
   server.init('dndBoard', null);
   const session = Date.now() + ':' + Math.random();
   const joined = Date.now();
   let id, slot = null, baseline = boardState(g.S), sequence = 0;
   let pending = [], lastSend = 0, lastBoardSend = 0;
   let own = null, accepted = null;
   let epoch = 0;
   const callbacks = new Map();
   const waiting = new Set();
   const heartbeats = new Map();
   const queue = (action, after, key) => {
      capture();
      const seq = ++sequence;
      pending.push({ seq, action });
      if (after) callbacks.set(seq, { after, epoch, key });
      send(true);
   };

   const capture = () => {
      const current = boardState(g.S);
      const delta = changes(baseline, current);
      if (slot != null && slot >= 0 && delta.length) pending.push({ seq: ++sequence, delta });
      baseline = current;
   };

   const send = force => {
      if (id === undefined || !own) return;
      const now = Date.now();
      if (!force && now - lastSend < 60) return;
      own.ops = pending;
      own.seen = now;
      own.active = g.active();
      own.stage = g.stage.getMatrix().slice();
      own.head = g.localHead ? g.localHead() : null;
      own.preview = g.dragPreview ? g.dragPreview() : null;
      own.mode = g.S.mode;
      window.dndClients[id] = own;
      server.broadcastGlobalElement('dndClients', id);
      lastSend = now;
   };

   const activeClients = () => (window.clients || []).map(String).filter(key => {
      const entry = window.dndClients[key];
      if (!entry || !entry.active) return false;
      const previous = heartbeats.get(key);
      if (!previous || previous.session !== entry.session || previous.seen !== entry.seen)
         heartbeats.set(key, { session: entry.session, seen: entry.seen, received: Date.now() });
      return Date.now() - heartbeats.get(key).received < 5000;
   });

   g.net = {
      role: () => slot == null ? null : slot < 0 ? 'spectator' : g.S.mode === 'adv' ? 'pawn' : 'god',
      slot: () => slot,
      ready: () => slot !== null,
      canPlay: () => slot != null && slot >= 0,
      clients: () => window.dndClients,
      roster: () => window.dndBoard ? window.dndBoard.roster : [],
      owns: resource => !!accepted && accepted.claims[resource] === session,
      busy: resource => !!accepted && !!accepted.claims[resource] && accepted.claims[resource] !== session,
      claim(resource, after) {
         if (!g.net.canPlay()) return false;
         const resources = Array.isArray(resource) ? resource : [resource];
         const key = resources.join('|');
         if (resources.every(g.net.owns)) { after(); return true; }
         if (waiting.has(key)) return false;
         waiting.add(key);
         queue({ type: 'claim', resources }, () => {
            if (resources.every(g.net.owns)) after();
            else g.say('That object is no longer available.');
         }, key);
         return true;
      },
      release(resource) { queue({ type: 'release', resource }); },
      releaseAll() {
         epoch++;
         waiting.clear();
         queue({ type: 'releaseAll' });
      },
      move(c, r, teleport, after) {
         if (waiting.has('move')) return false;
         waiting.add('move');
         queue({ type: 'move', c, r, teleport }, after, 'move');
         return true;
      },
      turnPending: () => waiting.has('turn'),
      endTurn(after) {
         if (waiting.has('turn')) return false;
         waiting.add('turn');
         queue({ type: 'turn' }, after, 'turn');
         return true;
      },
      begin() {
         capture();
         window.dndClients = server.synchronize('dndClients');
         window.dndBoard = server.synchronize('dndBoard');
         if (window.clientID === undefined || !server.socket || server.socket.readyState !== 1) {
            slot = null;
            g.say('Waiting for the multiplayer connection.');
            return;
         }
         id = String(window.clientID);
         if (!own) {
            own = { session, joined, ops: [], active: true, seen: Date.now() };
            send(true);
         } else {
            own.ops = pending;
            own.active = g.active();
            own.seen = Date.now();
            window.dndClients[id] = own;
            if (!own.active) send(false);
         }
         const active = activeClients();
         if (!active.length) return;
         let shared = window.dndBoard;
         const connected = (window.clients || []).map(String);
         const connectionOrder = key => {
            const index = connected.indexOf(key);
            return index < 0 ? Infinity : index;
         };
         if (accepted && (!shared
            || (accepted.origin !== shared.origin && connectionOrder(accepted.origin) < connectionOrder(shared.origin))
            || (accepted.origin === shared.origin && accepted.started < shared.started)
            || (accepted.origin === shared.origin && accepted.started === shared.started
               && accepted.revision > shared.revision))) shared = accepted;
         const owner = shared && active.includes(shared.owner) ? shared.owner
            : active[0];
         if (owner === id) {
            if (!shared) shared = {
               owner, origin: id, started: joined, roster: [id, null],
               board: copy(baseline), ack: {}, replies: {}, claims: {}, revision: 0,
            };
            shared.owner = owner;
            shared.roster = shared.roster.map(key => connected.includes(key)
               && window.dndClients[key]?.active !== false ? key : null);
            for (const key of active) if (!shared.roster.includes(key)) {
               const slot = shared.roster.indexOf(null);
               if (slot >= 0) shared.roster[slot] = key;
            }
            const sessions = shared.roster.filter(key => key != null).map(key => window.dndClients[key].session);
            for (const resource of Object.keys(shared.claims))
               if (!sessions.includes(shared.claims[resource])) delete shared.claims[resource];
            for (const [playerSlot, key] of shared.roster.entries()) {
               const entry = window.dndClients[key];
               if (!entry) continue;
               const ack = shared.ack[entry.session] || 0;
               for (const op of entry.ops) if (op.seq > ack) {
                  const error = op.action ? processAction(shared, playerSlot, entry.session, op.action)
                     : applyPlayerChanges(shared, playerSlot, entry.session, op.delta);
                  if (!shared.replies[entry.session]) shared.replies[entry.session] = {};
                  shared.replies[entry.session][op.seq] = error;
                  shared.ack[entry.session] = op.seq;
                  shared.revision++;
               }
               for (const seq of Object.keys(shared.replies[entry.session] || {}))
                  if (Number(seq) <= (entry.received || 0)) delete shared.replies[entry.session][seq];
            }
            window.dndBoard = shared;
            if (Date.now() - lastBoardSend >= 60) {
               server.broadcastGlobal('dndBoard');
               lastBoardSend = Date.now();
            }
         }
         if (!shared || shared.owner !== owner) { slot = null; return; }
         accepted = shared;
         window.dndBoard = shared;
         const nextSlot = shared.roster.indexOf(id);
         const ack = shared.ack[session] || 0;
         const resolved = pending.filter(op => op.seq <= ack);
         pending = pending.filter(op => op.seq > (shared.ack[session] || 0));
         const board = copy(shared.board);
         for (const op of pending) if (op.delta) applyChanges(board, op.delta);
         installBoard(g, board, nextSlot);
         if (slot !== nextSlot) {
            slot = nextSlot;
            g.assignRole(slot < 0 ? 'spectator' : board.players[slot].mode === 'adv' ? 'pawn' : 'god');
         }
         baseline = boardState(g.S);
         for (const op of resolved) {
            const callback = callbacks.get(op.seq);
            callbacks.delete(op.seq);
            if (callback && ![...callbacks.values()].some(other => other.key === callback.key))
               waiting.delete(callback.key);
            const error = shared.replies[session] && shared.replies[session][op.seq];
            if (error) {
               console.warn('DnD: shared action rejected:', error);
               g.say(error);
            }
            else if (callback && callback.epoch === epoch) callback.after();
         }
         own.received = ack;
      },
      end() { capture(); send(false); },
   };
};

const cg = CG;
const { ADV } = Data;

const makePawn = parent => {
   const root = parent.add().color(.025, .025, .03);
   root.add('tubeY').move(0, .009, 0).scale(.027, .006, .027);
   root.add('sphere').move(0, .017, 0).scale(.027, .009, .027);
   root.add('coneY').move(0, .038, 0).scale(.021, .026, .021);
   root.add('tubeY').move(0, .057, 0).scale(.015, .004, .015);
   const head = root.add();
   head.add('sphere').scale(.022);
   for (const x of [-.008, .008])
      head.add('sphere').move(x, .003, -.020).scale(.005).color(1, 1, 1).dull();
   const hands = {};
   for (const hand of ['left', 'right']) {
      hands[hand] = root.add();
      hands[hand].add('sphere').scale(.010);
   }
   return { root, head, hands };
};

const makeGod = parent => {
   const root = parent.add();
   const head = root.add();
   head.add('sphere').scale(.14).color(1, 1, 1).dull();
   for (const x of [-.045, .045]) {
      head.add('sphere').move(x, .018, -.13).scale(.024).color(3, 3, 3).dull();
      head.add('sphere').move(x, .018, -.13).scale(.035).color(2, 2, 2).opacity(.18).dull();
   }
   const hands = {};
   for (const hand of ['left', 'right']) {
      hands[hand] = root.add();
      hands[hand].add('sphere').scale(.05).color(1, 1, 1).dull();
   }
   return { root, head, hands };
};

const matrix = m => Array.isArray(m) && m.length === 16 && m.every(Number.isFinite);

const installAvatars = (g, { tileX, tileZ }) => {
   g.gods = [makeGod(g.stage), makeGod(g.stage)];
   g.posePlayers = () => {
      for (const god of g.gods) god.root.identity().scale(0);
      const roster = g.net.roster();
      for (let slot = 0; slot < 2; slot++) {
         const pawn = g.pawns[slot], god = g.gods[slot];
         const player = g.S.players[slot], id = roster[slot];
         const local = slot === g.net.slot();
         if (!g.net.ready() || (local && g.S.mode === 'adv')) {
            pawn.root.identity().scale(0);
         } else {
            const preview = local && g.S.drag && g.S.drag.kind === 'avatar' ? g.dragPreview() : g.remotePreview();
            const pos = preview && preview.kind === 'avatar' && preview.slot === slot
               ? preview.pos : [tileX(player.hero.c), 0, tileZ(player.hero.r)];
            pawn.root.identity().move(pos).turnY(player.hero.face || 0);
            pawn.head.identity().move(0, .083, 0);
            pawn.hands.left.identity().move(-.035, .055, 0);
            pawn.hands.right.identity().move(.035, .055, 0);
         }
         if (id == null || local || !window.clientState) continue;
         const entry = g.net.clients()[id];
         if (!entry || !entry.active || !matrix(entry.stage)) continue;
         const tracked = clientState.head(id);
         const H = matrix(tracked) ? tracked : entry.head;
         const inverse = cg.mInverse(entry.stage);
         if (!matrix(inverse) || !matrix(H)) continue;
         if (entry.mode !== 'adv') {
            god.root.setMatrix(inverse);
            god.head.setMatrix(H);
            for (const hand of ['left', 'right']) {
               const M = clientState.hand(id, hand);
               if (matrix(M)) god.hands[hand].setMatrix(M);
               else god.hands[hand].setMatrix(H).move(hand === 'left' ? -.22 : .22, -.28, -.12);
            }
            continue;
         }
         const localMatrix = cg.mInverse(pawn.root.getMatrix());
         const rotation = H.slice();
         rotation[12] = rotation[13] = rotation[14] = 0;
         const boardHead = cg.mTransform(inverse, H.slice(12, 15));
         const pos = pawn.root.getMatrix().slice(12, 15);
         const offset = cg.subtract(boardHead, [tileX(player.hero.c), 0, tileZ(player.hero.r)]);
         const headPos = cg.mTransform(localMatrix, cg.add(pos, cg.add(offset, [0, .045, 0])));
         pawn.head.setMatrix(cg.mMultiply(cg.mTranslate(headPos),
            cg.mMultiply(cg.mRotateY(-(player.hero.face || 0)), rotation)));
         for (const hand of ['left', 'right']) {
            const M = clientState.hand(id, hand);
            if (!matrix(M)) continue;
            const offset = cg.scale(cg.subtract(M.slice(12, 15), H.slice(12, 15)), 1 / ADV);
            const worldHead = cg.mTransform(pawn.root.getMatrix(), headPos);
            pawn.hands[hand].identity().move(cg.mTransform(localMatrix, cg.add(worldHead, offset)));
         }
      }
   };
};

export { startPlayers, installMultiplayer, makePawn, installAvatars };

// Deck builder engine: works out which cards you own, scores them for an investigator
// and role, and builds a deck automatically or suggests cards one step at a time.
import { cardRoles, deckOptions, placeCard, analyze, ROLES } from './analyze.js';
import { adjustTargets } from './campaign.js';
import { viableEngines, seeded } from './engines.js';

// Cards most players reach for at level 0. A light nudge, not a must-include list.
const STAPLES = new Set([
  // Neutral
  'Emergency Cache', 'Unexpected Courage', 'Perception', 'Overpower', 'Guts', 'Manual Dexterity', 'Knife', 'Flashlight',
  'Leather Coat', 'Track Shoes', 'Calling in Favors', 'Bandolier', 'Grete Wagner',
  // Guardian
  'Machete', 'Vicious Blow', 'Physical Training', 'Evidence!', 'Dodge', 'Beat Cop', 'Enchanted Blade', 'Prepared for the Worst',
  'Hallowed Mirror', 'Emergency Aid', 'Stand Together', 'Guard Dog', 'Solemn Vow', 'Safeguard', 'On the Hunt', 'Stick to the Plan',
  // Seeker
  'Deduction', 'Working a Hunch', 'Hyperawareness', 'Dr. Milan Christopher', 'Magnifying Glass', 'Fingerprint Kit',
  'Practice Makes Perfect', 'Research Librarian', 'Shortcut', 'Inquiring Mind', 'Strange Solution', 'Mr. "Rook"', 'Medical Texts',
  'Lab Coat', 'Laboratory Assistant', 'Old Book of Lore', 'Occult Lexicon',
  // Rogue
  'Leo De Luca', 'Lucky!', 'Opportunist', 'Lone Wolf', 'Hot Streak', 'Sneak Attack', 'Pickpocketing', 'Burglary', 'Lockpicks',
  'Elusive', 'Quick Thinking', 'Hard Knocks', 'Cunning Distraction', 'Switchblade', 'Stylish Coat', 'Easy Mark', 'Sleight of Hand',
  // Mystic
  'Shrivelling', 'Arcane Studies', 'Ward of Protection', 'Holy Rosary', 'Rite of Seeking', 'Drawn to the Flame', 'Fearless',
  'Arcane Initiate', 'Blinding Light', 'Mists of R\'lyeh', 'Prescient', 'Familiar Spirit', 'Sixth Sense', 'Read the Signs',
  'Astronomical Atlas', 'Clarity of Mind',
  // Survivor
  'Dig Deep', 'Scavenging', 'Baseball Bat', 'Look what I found!', 'Peter Sylvestre', 'Drawing Thin', 'A Chance Encounter',
  'Fire Axe', 'Improvised Weapon', 'Resourceful', 'Take Heart', 'Lucky Cigarette Case', 'Short Supply', 'Gumption', 'Granny Orne',
]);

export const BUCKETS = {
  clue: { label: 'Finding clues', roles: ['clue'] },
  enemy: { label: 'Handling enemies', roles: ['fight', 'evade'] },
  econ: { label: 'Money', roles: ['econ'] },
  draw: { label: 'Card draw', roles: ['draw'] },
  protect: { label: 'Treachery protection', roles: ['boost_w', 'cancel'] },
  alive: { label: 'Staying alive', roles: ['heal', 'soak'] },
};
const STAT_NAME = { w: 'Willpower', i: 'Intellect', c: 'Combat', a: 'Agility' };
const ICON_KEY = { willpower: 'w', intellect: 'i', combat: 'c', agility: 'a' };

// --- Collection ------------------------------------------------------------
// The repackaged investigator expansions hold every player card from their cycle's
// original deluxe box and mythos packs, so owning one counts as owning those.
export const REPRINTS = { dwlp: 'dwl', ptcp: 'ptc', tfap: 'tfa', tcup: 'tcu', tdep: 'tde', ticp: 'tic' };
export function effectiveOwned(db, owned) {
  const out = { ...owned };
  for (const [pack, cycle] of Object.entries(REPRINTS)) {
    if (!owned[pack]) continue;
    for (const p of db.packList) if (p.cycle === cycle && p.players && !REPRINTS[p.code]) out[p.code] = Math.max(out[p.code] || 0, owned[pack]);
  }
  return out;
}
export function playerCardCount(db, pack) {
  if (REPRINTS[pack]) return db.packList.filter(p => p.cycle === REPRINTS[pack] && !REPRINTS[p.code]).reduce((s, p) => s + p.players, 0);
  return db.packList.find(p => p.code === pack)?.players || 0;
}

// owned: { packCode: copies }
export function ownedCards(db, ownedRaw) {
  const owned = effectiveOwned(db, ownedRaw);
  const avail = new Map(); // identity -> { card, copies }
  for (const c of db.cards) {
    const copies = owned[c.pack] || 0;
    if (!copies) continue;
    const id = identity(c);
    const prev = avail.get(id);
    const n = (c.qty || 1) * copies;
    if (prev) prev.copies += n; else avail.set(id, { card: c.dup ? (db.byCode.get(c.dup) || c) : c, copies: n, print: c });
  }
  return avail;
}
export const identity = c => c.dup || c.code;

export function ownedInvestigators(db, ownedRaw) {
  const owned = effectiveOwned(db, ownedRaw);
  const seen = new Map();
  for (const c of db.cards) {
    if (c.type !== 'investigator' || !owned[c.pack]) continue;
    const base = c.dup ? db.byCode.get(c.dup) || c : c;
    const key = base.code;
    if (/[a-z]$/.test(c.code) || !base.options) continue;
    if (!seen.has(key)) seen.set(key, { ...base, packName: db.packs[base.pack], cycle: db.packList.find(p => p.code === base.pack)?.cycle });
  }
  const list = [...seen.values()];
  const dupes = new Set(list.map(i => i.name).filter((n, i, a) => a.indexOf(n) !== i));
  for (const i of list) {
    i.label = !dupes.has(i.name) ? i.name
      : i.cycle === 'parallel' ? `${i.name} (parallel)`
      : i.cycle === 'promotional' ? `${i.name} (novella version)`
      : i.packName === i.name ? `${i.name} (2026 Investigator Deck)` : `${i.name} (${i.packName})`;
  }
  return list.sort((a, b) => a.label.localeCompare(b.label));
}

// --- Investigator & role ----------------------------------------------------
export function roleFit(inv, role) {
  const s = k => inv[k] || 0;
  if (role === 'clues') return s('i') * 2 + (inv.fac === 'seeker' ? 2 : 0) + s('w') * 0.3;
  if (role === 'fighter') return s('c') * 2 + (inv.fac === 'guardian' ? 2 : 0) + (inv.health || 0) * 0.2;
  return Math.min(s('i'), s('c')) * 2 + (s('i') + s('c') + s('a')) * 0.4 + (['rogue', 'survivor'].includes(inv.fac) ? 1 : 0);
}
export function autoRole(inv) {
  if ((inv.i || 0) >= (inv.c || 0) + 1 || inv.fac === 'seeker') return 'clues';
  if ((inv.c || 0) >= (inv.i || 0) + 1 || inv.fac === 'guardian') return 'fighter';
  return 'flex';
}

export function deckSizeFor(inv, choices = {}) {
  const sel = inv.options?.find(o => o.deck_size_select);
  if (sel) return +(choices[sel.id || sel.name || 'choice'] || sel.deck_size_select[0]);
  const m = (inv.req || '').match(/size:(\d+)/);
  return m ? +m[1] : 30;
}

export function requiredCards(db, inv) {
  const out = [];
  for (const part of (inv.req || '').split(',').map(s => s.trim()).filter(p => p.startsWith('card:'))) {
    const alts = part.slice(5).split(':');
    const card = alts.map(c => db.byCode.get(c)).find(Boolean);
    if (card) out.push(card);
  }
  return out;
}

// How many cards of each kind the deck should aim for (for a 30-card deck; scaled to size).
export function targetsFor(role, players, size, inv) {
  const solo = players === 1;
  const base = {
    clues: { clue: 9, enemy: solo ? 6 : 3, econ: 5, draw: 4, protect: 3, alive: 3 },
    fighter: { clue: solo ? 6 : 2, enemy: 9, econ: 5, draw: 4, protect: 3, alive: 3 },
    flex: { clue: 6, enemy: 6, econ: 5, draw: 4, protect: 3, alive: 3 },
  }[role];
  if ((inv.w || 0) >= 4) base.protect = 1;
  if ((inv.w || 0) <= 2) base.protect = 5;
  if (Math.min(inv.health || 7, inv.sanity || 7) <= 6) base.alive = 4;
  const scale = size / 30;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.max(1, Math.round(v * scale))]));
}

// --- Card scoring ------------------------------------------------------------
const plain = t => (t || '').replace(/<[^>]+>/g, '').toLowerCase();
function statFor(card, kind) {
  const t = plain(card.text);
  const word = { fight: 'fight', clue: 'investigate', evade: 'evade' }[kind];
  let m = t.match(new RegExp(`${word}[^.]{0,4}\\(\\[(\\w+)\\]\\)`));
  if (!m) m = t.match(new RegExp(`${word}[^]{0,80}?uses? \\[(\\w+)\\]`));
  if (!m) m = t.match(new RegExp(`(attack|investigation|evasion|test)[^.]{0,30}uses? \\[(\\w+)\\] instead`));
  const icon = m ? (m[2] || m[1]) : { fight: 'combat', clue: 'intellect', evade: 'agility' }[kind];
  return ICON_KEY[icon] || { fight: 'c', clue: 'i', evade: 'a' }[kind];
}
const bucketsOf = roles => Object.entries(BUCKETS).filter(([, b]) => b.roles.some(r => roles.has(r))).map(([k]) => k);
export function invTraits(inv) {
  return new Set([...(inv.text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].toLowerCase()));
}

// ctx: { inv, role, targets, counts (per bucket), slotUse, synergy }
export function scoreCard(card, ctx) {
  const reasons = [];
  const roles = cardRoles(card);
  const buckets = bucketsOf(roles);
  let s = 0.5;
  const spice = ctx.spice ?? 0;
  if (STAPLES.has(card.name)) {
    const bonus = [2.2, 0.8, -0.9][spice];
    s += bonus;
    if (bonus > 0) reasons.push('A popular pick');
  }
  if (ctx.engine && ctx.engine.match(card)) { s += 3; reasons.push(`Fits the ${ctx.engine.name} plan`); }
  if (ctx.keyTraits?.size && (card.traits || '').toLowerCase().split('.').some(t => ctx.keyTraits.has(t.trim()))) s += 0.8;
  if (ctx.jitter) s += (ctx.jitter.get(identity(card)) || 0) * (0.3 + spice * 1.1);
  // What you're playing is the biggest factor: score how well the card answers this scenario.
  const pr = ctx.pr;
  if (pr && pr.shares) {
    const t0 = plain(card.text);
    const fit = [];
    const add = (v, why) => { if (v > 0.05) fit.push([v, why]); };
    const sh = pr.shares;
    if (roles.has('boost_w') || roles.has('cancel')) add(2.4 * sh.willpower / 0.5, `answers its willpower tests (${Math.round(sh.willpower * 100)}% of tests)`);
    if (roles.has('boost_a')) add(1.8 * sh.agility / 0.26, `helps its agility tests (${Math.round(sh.agility * 100)}% of tests)`);
    if (roles.has('boost_i') && roles.has('clue')) add(1.0 + Math.max(0, pr.shroud) * 2, 'boosts intellect against its shroud');
    const bigHit = roles.has('fight') && /\+\d damage|deals \+\d|deal (2|3|4|x) damage|\+1 damage/.test(t0);
    if (bigHit) add(1.0 + Math.max(0, pr.tough) * 2.5 + (pr.elite ? 1 : 0), pr.elite ? 'extra damage for its big, Elite enemies' : 'extra damage for its enemies');
    if (roles.has('evade')) add(0.6 + Math.max(0, pr.tough) * 1.5 + Math.max(0, pr.hunters) * 5 - (pr.slippery > 0.3 ? 1 : 0) + (pr.elite ? 0.5 : 0), pr.hunters > 0.08 ? 'shakes off its hunters' : 'avoids its tough fights');
    if (roles.has('clue') && /without (making a|testing)|discover \d+ clues? at (your|a|any|its) location\.|automatically succeed/.test(t0)) add(0.8 + Math.max(0, pr.shroud) * 3, 'finds clues despite its shroud');
    const horrorHelp = card.sanity > 0 || /hh/.test(card.tags || ''), damageHelp = card.health > 0 || /hd/.test(card.tags || '');
    if (horrorHelp && pr.horror > 0.03) add(pr.horror * 14, 'soaks or heals its horror');
    else if (damageHelp && pr.horror < -0.03) add(-pr.horror * 14, 'soaks or heals its damage');
    if (pr.curse && /\[bless\]/.test(t0)) add(1.8, 'counters its curse tokens');
    if (pr.doom > 0.03 && (/additional action|take an additional action/.test(t0) || card.type === 'event' && /^fast\./.test(t0))) add(1.2, 'saves actions against its doom clock');
    if (pr.flood && /\bmove\b/.test(t0)) add(1.0, 'gets you around its flooded map');
    if (pr.frost && /\bseal\b|chaos token|reveal (an|another) (additional )?token/.test(t0)) add(1.0, 'manipulates the chaos bag against frost');
    const total = fit.reduce((x, [v]) => x + v, 0);
    s += total * 1.6;
    if (fit.length) {
      fit.sort((a, b) => b[0] - a[0]);
      reasons.unshift(`For ${ctx.playingName || 'this scenario'}: ${fit.slice(0, 2).map(f => f[1]).join(' and ')}`);
    }
  }

  const primary = ctx.role === 'clues' ? 'clue' : ctx.role === 'fighter' ? 'enemy' : null;
  const sorted = buckets.map(b => {
    const left = ctx.targets[b] - (ctx.counts[b] || 0);
    const w = left > 0 ? 1 + 3 * Math.min(1, left / ctx.targets[b]) : 0.25;
    return [b, w * (b === primary ? 1.3 : 1)];
  }).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([b, w], i) => { s += w * (i === 0 ? 1 : 0.6); });
  if (sorted.length) reasons.push(sorted.map(([b]) => BUCKETS[b].label.toLowerCase()).join(' + ').replace(/^./, c => c.toUpperCase()));

  const inv = ctx.inv;
  for (const [kind, role] of [['fight', 'fight'], ['clue', 'clue'], ['evade', 'evade']]) {
    if (!roles.has(role) || card.type === 'skill') continue;
    const st = statFor(card, kind);
    const val = inv[st] || 0;
    s += (val - 3) * 0.9;
    if (val >= 4) reasons.push(`Tests your ${STAT_NAME[st].toLowerCase()} (${val})`);
    else if (val <= 2) reasons.push(`Tests your weak ${STAT_NAME[st].toLowerCase()} (${val})`);
  }
  // Commit icons
  let iconScore = 0;
  for (const k of ['w', 'i', 'c', 'a']) iconScore += (card[k] || 0) * ((inv[k] || 0) >= 4 ? 0.45 : (inv[k] || 0) === 3 ? 0.25 : 0.1);
  iconScore += (card.x || 0) * 0.45;
  s += card.type === 'skill' ? iconScore * 1.6 : iconScore * 0.5;
  if (card.type === 'skill') {
    const icons = ['w', 'i', 'c', 'a', 'x'].filter(k => card[k]).map(k => k === 'x' ? 'wild' : STAT_NAME[k].toLowerCase());
    if (icons.length) reasons.push(`Commit for ${icons.join('/')}`);
  }
  // Trait synergy with the investigator's ability
  const tr = (card.traits || '').toLowerCase().split('.').map(x => x.trim()).filter(Boolean);
  const syn = tr.find(t => ctx.synergy.has(t));
  if (syn) { s += 1.6; reasons.push(`Works with ${inv.name.split(' ')[0]}'s ${syn[0].toUpperCase() + syn.slice(1)} ability`); }
  // Cost
  if (typeof card.cost === 'number' && card.cost >= 4) s -= (card.cost - 3) * 0.6;
  if (typeof card.cost === 'number' && card.cost <= 1 && card.type !== 'skill' && buckets.length) { s += 0.3; reasons.push('Cheap'); }
  // Slot pressure
  if (card.type === 'asset' && card.slot) {
    for (const part of card.slot.split('.').map(x => x.trim()).filter(Boolean)) {
      const [name, mult] = part.split(' x');
      const cap = { Hand: 2, Arcane: 2, Ally: 1, Accessory: 1, Body: 1, Tarot: 1, Head: 1 }[name] || 1;
      const used = ctx.slotUse[name] || 0;
      if (used + (mult ? +mult : 1) > cap * 2.5) { s -= 2; reasons.push(`Your ${name.toLowerCase()} slots are getting crowded`); }
    }
  }
  if (!buckets.length && card.type !== 'skill' && !STAPLES.has(card.name)) s -= 0.6;
  if (card.type === 'asset' && (ctx.assets || 0) >= ctx.assetCap) s -= 2 + (ctx.assets - ctx.assetCap) * 0.6;
  if (card.type === 'skill' && (ctx.skills || 0) >= ctx.skillCap) s -= 2.5 + (ctx.skills - ctx.skillCap) * 0.5;
  return { score: s, reasons: [...new Set(reasons)].slice(0, 3), buckets };
}

// --- Building ---------------------------------------------------------------
export class Builder {
  constructor(db, { inv, owned, role, players, choices = {}, xp = 0, pr = null, playingName = '', engine = null, spice = 0, seed = 1, keyNames = [], avoidNames = [] }) {
    this.db = db; this.inv = inv; this.players = players; this.choices = choices;
    this.pr = pr; this.playingName = playingName; this.engine = engine; this.spice = spice;
    this.role = role === 'auto' || !role ? autoRole(inv) : role;
    this.size = deckSizeFor(inv, choices);
    this.targets = adjustTargets(targetsFor(this.role, players, this.size, inv), pr);
    this.synergy = invTraits(inv);
    this.opts = deckOptions(inv, choices);
    this.required = requiredCards(db, inv);
    const reqIds = new Set(this.required.map(identity));
    // Pool of cards you own that this investigator may take
    this.pool = [];
    for (const { card, copies, print } of ownedCards(db, owned).values()) {
      if (!['asset', 'event', 'skill'].includes(card.type)) continue;
      if (card.subtype || card.permanent || card.bonded || card.restrictions || reqIds.has(identity(card))) continue;
      if ((card.xp ?? 0) > xp) continue;
      const test = placeCard(this.opts, card, new Map(), 1);
      if (!test.ok) continue;
      const max = Math.min(copies, card.limit ?? 2, card.myriad ? 3 : 2);
      this.pool.push({ card, max, print });
    }
    // Avoid list and per-card randomness for variety
    const norm = n => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const avoid = new Set(avoidNames.map(norm));
    this.pool = this.pool.filter(p => !avoid.has(norm(p.card.name)));
    const rand = seeded(seed);
    this.jitter = new Map(this.pool.map(p => [identity(p.card), rand() - 0.5]));
    this.picks = new Map(); // identity -> { card, count }
    // Key cards (from an approach or from Claude) go in first
    this.missingKeys = [];
    this.keyTraits = new Set();
    for (const name of keyNames) {
      const p = this.pool.find(x => norm(x.card.name) === norm(name)) || this.pool.find(x => norm(x.card.name).startsWith(norm(name)));
      if (!p) { this.missingKeys.push(name); continue; }
      if (this.counted < this.size) { let n = Math.min(p.max, 2); while (n > 0 && !this.set(p.card, n)) n--; }
      for (const t of (p.card.traits || '').toLowerCase().split('.').map(x => x.trim()).filter(Boolean)) if (!['item', 'ally', 'talent', 'insight'].includes(t)) this.keyTraits.add(t);
    }
  }

  get counted() { let n = 0; for (const p of this.picks.values()) n += p.count; return n; }

  state() {
    const counts = {}, slotUse = {};
    let skills = 0, assets = 0;
    for (const { card, count } of this.picks.values()) {
      if (card.type === 'skill') skills += count;
      if (card.type === 'asset') assets += count;
      for (const b of bucketsOf(cardRoles(card))) counts[b] = (counts[b] || 0) + count;
      if (card.type === 'asset' && card.slot) for (const part of card.slot.split('.').map(x => x.trim()).filter(Boolean)) {
        const [name, mult] = part.split(' x');
        slotUse[name] = (slotUse[name] || 0) + count * (mult ? +mult : 1);
      }
    }
    return { inv: this.inv, role: this.role, targets: this.targets, counts, slotUse, synergy: this.synergy, skills, skillCap: Math.round(this.size * 0.2), assets, assetCap: Math.round(this.size * 0.55), engine: this.engine, spice: this.spice, jitter: this.jitter, pr: this.pr, playingName: this.playingName, keyTraits: this.keyTraits };
  }

  // Can `count` more copies of card go in without breaking a limited rule?
  fits(card, count) {
    const limits = new Map();
    for (const { card: c, count: n } of this.picks.values()) placeCard(this.opts, c, limits, n);
    return placeCard(this.opts, card, limits, count).ok;
  }

  ranked(filter = () => true) {
    const ctx = this.state();
    return this.pool.filter(p => filter(p.card)).map(p => {
      const have = this.picks.get(identity(p.card))?.count || 0;
      return { ...p, have, ...scoreCard(p.card, ctx) };
    }).sort((a, b) => b.score - a.score);
  }

  set(card, count) {
    const id = identity(card);
    const pool = this.pool.find(p => identity(p.card) === id);
    const max = pool ? pool.max : 2;
    const prev = this.picks.get(id)?.count || 0;
    count = Math.max(0, Math.min(max, count));
    if (count > prev && !this.fits(card, count - prev)) return false;
    if (count > prev && this.counted + (count - prev) > this.size) return false;
    if (count === 0) this.picks.delete(id); else this.picks.set(id, { card, count });
    return true;
  }

  // Fill the remaining slots with the best-scoring cards.
  fill() {
    let guard = 200;
    while (this.counted < this.size && guard--) {
      const room = this.size - this.counted;
      const next = this.ranked(c => (this.picks.get(identity(c))?.count || 0) === 0).find(p => this.fits(p.card, 1));
      if (!next) break;
      let n = Math.min(next.max, room);
      while (n > 1 && !this.fits(next.card, n)) n--;
      this.set(next.card, n);
    }
    return this.counted;
  }

  deck() {
    const entries = [...this.required.map(card => ({ card, count: 1 })), ...this.picks.values()];
    return { investigator: this.inv, entries, unknown: [], randomWeakness: true, choices: this.choices, lookup: c => this.db.byCode.get(c) };
  }

  report() { return analyze(this.deck(), { role: this.role, players: this.players }); }

  text() {
    const printOf = new Map(this.pool.map(p => [identity(p.card), p.print]));
    const pack = c => this.db.packs[(printOf.get(identity(c)) || c).pack];
    const line = e => `${e.count}x ${e.card.name}${e.card.xp ? ` (${e.card.xp})` : ''} (${pack(e.card)})`;
    const groups = [['Assets', 'asset'], ['Events', 'event'], ['Skills', 'skill']].map(([t, type]) => {
      const list = [...this.picks.values()].filter(e => e.card.type === type).sort((a, b) => a.card.name.localeCompare(b.card.name));
      return list.length ? `${t}\n${list.map(line).join('\n')}` : '';
    }).filter(Boolean);
    const sigs = this.required.filter(c => !c.subtype).map(card => line({ card, count: 1 }));
    const weak = this.required.filter(c => c.subtype).map(card => line({ card, count: 1 }));
    return [`${this.inv.name} (${this.db.packs[this.inv.pack]})`, ...groups,
      sigs.length ? `Signature cards\n${sigs.join('\n')}` : '',
      `Weaknesses\n${[...weak, '1x Random Basic Weakness'].join('\n')}`].filter(Boolean).join('\n\n');
  }
}

// Several different decks for the same investigator and scenario.
export function buildApproaches(db, opts, { count = 4, seed = 1 } = {}) {
  const rand = seeded(seed * 7919);
  const base = new Builder(db, { ...opts, seed });
  const engines = viableEngines(base.pool, opts.inv, opts.pr || {}, rand, opts.spice ?? 0);
  const out = [];
  const overlap = (a, b) => {
    const ids = new Set([...a.picks.keys()]);
    let same = 0; for (const [id, e] of b.picks) if (ids.has(id)) same += e.count;
    return same / Math.max(1, b.counted);
  };
  if ((opts.spice ?? 0) < 2) {
    base.fill();
    out.push({ key: 'solid', name: 'Solid all-rounder', plan: 'No single theme: the strongest cards you own for this role and scenario.', builder: base });
  }
  for (const e of engines) {
    if (out.length >= count) break;
    const b = new Builder(db, { ...opts, engine: e, seed: seed + out.length });
    b.fill();
    const themed = [...b.picks.values()].filter(x => e.match(x.card)).reduce((s, x) => s + x.count, 0);
    if (themed < 6) continue;
    if (out.some(o => overlap(o.builder, b) > 0.75)) continue;
    out.push({ key: e.key, name: e.name, plan: e.plan, builder: b, themed });
  }
  for (const o of out) o.report = o.builder.report();
  return out;
}

// Steps for the walk-through.
export const STEPS = [
  { key: 'key', title: 'Your key cards', blurb: role => role === 'clues' ? 'Start with the assets your deck is built around, like clue tools and allies that help you investigate.' : role === 'fighter' ? 'Start with your weapons and the allies that keep you fighting. The rest of the deck supports these.' : 'Start with a couple of flexible assets that let you both fight and find clues.', filter: (c, role) => c.type === 'asset' && (role === 'clues' ? cardRoles(c).has('clue') : role === 'fighter' ? cardRoles(c).has('fight') : cardRoles(c).has('clue') || cardRoles(c).has('fight')), bucket: null, aim: 4 },
  { key: 'clue', title: 'Finding clues', blurb: () => 'Cards that discover clues or make investigating easier.', bucket: 'clue' },
  { key: 'enemy', title: 'Handling enemies', blurb: () => 'Cards that fight, evade or cancel enemy attacks.', bucket: 'enemy' },
  { key: 'econ', title: 'Money', blurb: () => 'Resources pay for everything else. Most decks want 4–6 of these.', bucket: 'econ' },
  { key: 'draw', title: 'Card draw', blurb: () => 'Extra draws help you find your key cards sooner.', bucket: 'draw' },
  { key: 'protect', title: 'Protection and staying alive', blurb: () => 'Willpower boosts, treachery cancels, healing and allies that soak damage and horror.', bucket: ['protect', 'alive'] },
  { key: 'skill', title: 'Skill cards', blurb: () => 'Cards you commit to tests. Pick ones whose icons match your best skills.', filter: c => c.type === 'skill', bucket: null, aim: 6 },
  { key: 'finish', title: 'Last few slots', blurb: () => 'The best remaining cards for your deck. Fill the last slots by hand, or let the builder finish it.', bucket: null },
];

export { ROLES };

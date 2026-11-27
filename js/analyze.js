// Deck analysis: turns a parsed deck into grades, notes and legality checks.
// Kept separate from the UI so the guided builder and upgrade planner can reuse it later.

export const STATS = [
  { key: 'w', name: 'Willpower', icon: 'willpower' },
  { key: 'i', name: 'Intellect', icon: 'intellect' },
  { key: 'c', name: 'Combat', icon: 'combat' },
  { key: 'a', name: 'Agility', icon: 'agility' },
];

export const ROLES = {
  clues: 'Clue finder',
  fighter: 'Enemy handler',
  flex: 'Flex',
  solo: 'True solo',
};

const plain = t => (t || '').replace(/<[^>]+>/g, '').toLowerCase();

// --- What each card does, read from its text -------------------------------
const N = '(\\d+|x|an?|one|two|three|that many|1 additional|an additional|additional)';
const RX = {
  clue: new RegExp(`discover ${N}( additional)? clues?|discover .{0,20}clues?|\\binvestigate( \\(\\[intellect\\]\\))?\\.|\\binvestigate \\(|clues? (from|at) (your|a|that|any)? ?location`),
  fight: /\bfight( \(\[combat\]\))?\.|\bfight \(|deal (\d+|x|that much|1 additional) damage to (an?|that|the|each|any) (engaged |attacked |non-elite )?enem|attack deals \+\d|automatically defeat/,
  evade: /\bevade( \(\[agility\]\))?\.|\bevade \(|automatically evade|evade (that|an?|the) enemy|cancel that attack|enemy (is|becomes) exhausted|exhaust (that|an?|the) enemy/,
  econ: new RegExp(`gain ${N} resources?|gain resources|costs? (\\d+|x) (fewer|less)|cost (\\d+|x) (fewer|less)|reduce (its|the) cost|less to play|place ${N} resources? on|take ${N} resources?`),
  draw: new RegExp(`draw ${N}( additional)? cards?|draw cards? equal|draw the top|search(es)? the top \\d+ cards|add (it|that card|them) to your hand`),
  heal: /\bheal (\d+|x|all|that much|1 additional)|\bheals?\b/,
  cancel: /cancel (that|its|the|a|those)|ignore (its|that card's|the) revelation|treachery/,
};
const statBoost = key => new RegExp(`\\+(\\d+|x) \\[${STATS.find(s => s.key === key).icon}\\]`);

export function cardRoles(card) {
  const t = plain(card.text);
  const traits = (card.traits || '').toLowerCase();
  const roles = new Set();
  if (card.type === 'investigator' || card.subtype) return roles;
  if (RX.clue.test(t) || traits.includes('tool') && /investigat/.test(t)) roles.add('clue');
  if (RX.fight.test(t) || traits.includes('weapon')) roles.add('fight');
  if (RX.evade.test(t)) roles.add('evade');
  if (RX.econ.test(t)) roles.add('econ');
  if (RX.draw.test(t)) roles.add('draw');
  if ((card.tags || '').match(/h[dh]/) || RX.heal.test(t)) roles.add('heal');
  if (card.type === 'asset' && ((card.health || 0) + (card.sanity || 0) > 0)) roles.add('soak');
  if (/cancel (that card's|its|the) revelation|cancel .{0,40}treacher|ignore (its|that card's|the) revelation|(when|after) a treachery|treachery card'?s? (would|revelation)/.test(t)) roles.add('cancel');
  for (const s of STATS) if (card.type === 'asset' && statBoost(s.key).test(t)) roles.add('boost_' + s.key);
  return roles;
}

// --- Probability helpers ----------------------------------------------------
function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  let r = 0;
  for (let i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
  return r;
}
// Chance of drawing at least one of `hits` cards in `draws` cards from a deck of `size`.
export function chanceAtLeastOne(size, hits, draws) {
  if (hits <= 0) return 0;
  if (draws >= size || hits > size - draws) return 1;
  return 1 - Math.exp(logChoose(size - hits, draws) - logChoose(size, draws));
}

// --- Deckbuilding rules -----------------------------------------------------
export function optionMatches(o, card) {
  const facs = [card.fac, card.fac2, card.fac3].filter(Boolean);
  const xp = card.xp ?? 0;
  const lvl = o.level || o.base_level;
  if (lvl && (xp < lvl.min || xp > lvl.max)) return false;
  let factionList = o.faction;
  if (o.faction_select) factionList = o.faction_select;
  if (factionList && factionList.length && !facs.some(f => factionList.includes(f))) return false;
  if (o.type && !o.type.includes(card.type)) return false;
  if (o.trait) {
    const tr = (card.traits || '').toLowerCase().split('.').map(s => s.trim());
    if (!o.trait.some(x => tr.includes(x))) return false;
  }
  if (o.tag && !o.text && !o.tag.some(x => (card.tags || '').includes(x))) return false;
  if (o.text) {
    const tagOk = o.tag && o.tag.some(x => (card.tags || '').includes(x));
    if (!tagOk && !o.text.some(r => new RegExp(r).test(card.text || ''))) return false;
  }
  if (o.uses && !o.uses.some(u => new RegExp(`Uses \\(\\d+ ${u}\\)`, 'i').test(card.text || ''))) return false;
  if (o.slot && !o.slot.some(s => (card.slot || '').includes(s))) return false;
  if (o.permanent !== undefined && !o.text && !!card.permanent !== o.permanent) return false;
  return true;
}

// Turn an investigator's deckbuilding options into concrete rules, applying any class/trait choices.
export function choiceOptions(inv) {
  return (inv?.options || []).filter(o => o.faction_select || o.option_select || o.deck_size_select)
    .map(o => ({
      key: o.id || o.name || 'choice',
      name: o.name || (o.deck_size_select ? 'Deck size' : 'Choice'),
      values: o.deck_size_select ? o.deck_size_select.map(v => ({ value: v, label: `${v} cards` }))
        : o.faction_select ? o.faction_select.map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))
        : o.option_select.map(v => ({ value: v.id, label: v.name })),
      sizeSelect: !!o.deck_size_select,
    }));
}
export function deckOptions(inv, choices = {}) {
  return (inv?.options || []).map(o => {
    const key = o.id || o.name || 'choice';
    const pick = choices[key];
    if (o.faction_select) return pick ? { ...o, faction_select: undefined, faction: [pick] } : { ...o, _choice: true };
    if (o.option_select) {
      const chosen = o.option_select.find(x => x.id === pick);
      return chosen ? { ...chosen, limit: o.limit ?? chosen.limit } : { ...o, option_select: undefined, _choice: true, _union: o.option_select };
    }
    return o;
  });
}
// Find which rule lets a card in. limits: Map of option index -> copies used so far.
export function placeCard(opts, card, limits, count = 1) {
  for (const [idx, o] of opts.entries()) {
    if (o.deck_size_select || o.atleast && o.ignore_match) continue;
    const candidates = o._union ? o._union : [o];
    if (!candidates.some(c => optionMatches(c, card))) continue;
    if (o.not) return { ok: false, not: true, error: o.error };
    if (o.limit) {
      const used = limits.get(idx) || 0;
      if (used + count > o.limit) continue; // overflow may fit a later option
      limits.set(idx, used + count);
    }
    return { ok: true, idx, choice: !!o._choice };
  }
  return { ok: false };
}

function checkLegality(inv, entries, choices, requiredCodes) {
  const issues = [];
  if (!inv) return issues;
  const opts = deckOptions(inv, choices);
  const limits = new Map();
  let usedChoice = false;
  for (const { card, count } of entries) {
    if (card.subtype || requiredCodes.has(card.code) || card.code === inv.code) continue;
    if (card.restrictions && !card.restrictions.includes(inv.code)) {
      issues.push({ level: 'error', text: `${card.name} is a signature card for a different investigator.` });
      continue;
    }
    const r = placeCard(opts, card, limits, count);
    if (r.not) issues.push({ level: 'error', text: `${card.name} isn't allowed${r.error ? ': ' + r.error.toLowerCase() : ` in ${inv.name}'s deck`}.` });
    else if (!r.ok) issues.push({ level: 'error', text: `${card.name}${card.xp ? ` (${card.xp})` : ''} isn't in ${inv.name}'s deckbuilding options.` });
    else if (r.choice) usedChoice = true;
  }
  for (const o of opts) {
    if (!o.atleast) continue;
    const byFac = {};
    for (const { card, count } of entries) {
      if (card.subtype || requiredCodes.has(card.code)) continue;
      for (const f of (o.faction || [])) if ([card.fac, card.fac2, card.fac3].includes(f)) byFac[f] = (byFac[f] || 0) + count;
    }
    const met = Object.values(byFac).filter(n => n >= o.atleast.min).length;
    if (met < o.atleast.factions) issues.push({ level: 'error', text: o.error || `Needs at least ${o.atleast.min} cards from ${o.atleast.factions} classes.` });
  }
  if (usedChoice) issues.push({ level: 'info', text: `${inv.name} picks a class or trait when building. I assumed your choice allows the off-class cards here.` });
  return issues;
}

// --- Main analysis ----------------------------------------------------------
export function analyze(deck, { role = 'auto', players = 2 } = {}) {
  const inv = deck.investigator;
  const entries = deck.entries;
  const reqCodes = new Set();
  let sizeReq = 30;
  if (inv?.req) {
    for (const part of inv.req.split(',').map(s => s.trim())) {
      if (part.startsWith('size:')) sizeReq = +part.slice(5);
      if (part.startsWith('card:')) part.slice(5).split(':').forEach(c => reqCodes.add(c));
    }
  }
  const sizeSelect = inv?.options?.find(o => o.deck_size_select);
  const sizeChoice = sizeSelect && deck.choices?.[sizeSelect.id || sizeSelect.name || 'choice'];
  const isRequired = card => reqCodes.has(card.code) || (card.dup && reqCodes.has(card.dup)) || (inv && card.restrictions?.includes(inv.code));
  const counted = entries.filter(e => !e.card.subtype && !e.card.permanent && !isRequired(e.card) && e.card.type !== 'investigator');
  const deckSize = counted.reduce((s, e) => s + e.count, 0);
  const drawSize = entries.filter(e => !e.card.permanent && e.card.type !== 'investigator').reduce((s, e) => s + e.count, 0) || 1;

  // Role
  let autoRole = 'flex';
  if (inv) {
    if ((inv.i || 0) >= (inv.c || 0) + 1 || inv.fac === 'seeker') autoRole = 'clues';
    else if ((inv.c || 0) >= (inv.i || 0) + 1 || inv.fac === 'guardian') autoRole = 'fighter';
  }
  const useRole = role === 'auto' ? autoRole : role;
  const solo = players === 1 || useRole === 'solo';

  // Count cards per role
  const tally = {};
  const add = (k, e) => { (tally[k] ||= { count: 0, cards: [] }); tally[k].count += e.count; tally[k].cards.push(e.card.code); };
  const playable = entries.filter(e => !e.card.subtype && e.card.type !== 'investigator');
  for (const e of playable) {
    e.roles = cardRoles(e.card);
    for (const r of e.roles) add(r, e);
  }
  const get = k => tally[k] || { count: 0, cards: [] };
  const merge = (...ks) => {
    const cards = [...new Set(ks.flatMap(k => get(k).cards))];
    const count = playable.filter(e => cards.includes(e.card.code)).reduce((s, e) => s + e.count, 0);
    return { count, cards };
  };
  const scale = Math.max(deckSize, 1) / sizeReq;
  const odds = n => ({ opening: chanceAtLeastOne(drawSize, n, 5), round3: chanceAtLeastOne(drawSize, n, 7) });
  const grade = (n, strong, ok, thin) => n >= strong * scale ? 'strong' : n >= ok * scale ? 'ok' : n >= thin * scale && n > 0 ? 'thin' : 'missing';

  const pillars = [];
  const stat = k => inv ? (inv[k] || 0) : 3;

  // Clues
  {
    const t = get('clue');
    const primary = useRole === 'clues' || solo;
    const need = useRole === 'solo' ? [8, 6, 3] : useRole === 'clues' ? [9, 6, 3] : useRole === 'flex' || solo ? [6, 4, 2] : [3, 1, 1];
    if (stat('i') >= 5) need.forEach((v, i) => need[i] = Math.max(1, v - 1));
    let g = grade(t.count, ...need);
    if (!primary && useRole === 'fighter' && g === 'missing') g = 'ok';
    const notes = {
      strong: 'Plenty of ways to find clues.',
      ok: primary ? 'Enough to find clues most games, but a bad draw could stall you.' : 'Fine for someone whose teammates handle most of the clues.',
      thin: `Only ${t.count} cards help you find clues${stat('i') <= 2 ? ` and your intellect is ${stat('i')}` : ''}. ${solo ? 'Solo, you have to find every clue yourself.' : 'Make sure a teammate is the main clue finder.'}`,
      missing: solo ? 'Nothing here helps you find clues, and solo you have to find every one yourself.' : 'No clue help at all. That only works if your teammates are strong clue finders.',
    };
    pillars.push({ key: 'clue', label: 'Finding clues', count: t.count, target: Math.ceil(need[1] * scale), grade: g, note: notes[g], cards: t.cards, odds: odds(t.count) });
  }
  // Enemies
  {
    const t = merge('fight', 'evade');
    const f = get('fight').count;
    const primary = useRole === 'fighter' || solo;
    const need = useRole === 'solo' ? [8, 6, 3] : useRole === 'fighter' ? [9, 6, 3] : solo || useRole === 'flex' ? [6, 4, 2] : [4, 2, 1];
    if (stat('c') >= 5 && useRole === 'fighter') need.forEach((v, i) => need[i] = Math.max(1, v - 1));
    const g = grade(t.count, ...need);
    const notes = {
      strong: 'You have plenty of answers when enemies show up.',
      ok: primary ? 'Enough answers to enemies, though a few big ones in a row will hurt.' : 'Enough to get away from an enemy while your fighter catches up.',
      thin: `Only ${t.count} cards fight or evade${f === 0 ? ', and nothing deals damage' : ''}. A hunter enemy could pin you down.`,
      missing: 'No way to fight or evade beyond basic actions. Enemies will chew through your health and actions.',
    };
    pillars.push({ key: 'enemy', label: 'Handling enemies', count: t.count, target: Math.ceil(need[1] * scale), grade: g, note: notes[g], cards: t.cards, odds: odds(t.count), sub: `${f} fight · ${get('evade').count} evade` });
  }
  // Economy
  const paid = playable.filter(e => ['asset', 'event'].includes(e.card.type) && !e.card.permanent && typeof e.card.cost === 'number');
  const totalCost = paid.reduce((s, e) => s + e.card.cost * e.count, 0);
  const paidCount = paid.reduce((s, e) => s + e.count, 0);
  const avgCost = paidCount ? totalCost / paidCount : 0;
  {
    const t = get('econ');
    const base = avgCost >= 2.8 ? [7, 5, 2] : avgCost >= 2.2 ? [5, 3, 1] : [4, 2, 1];
    const g = grade(t.count, ...base);
    const notes = {
      strong: `Good money for a deck whose cards average ${avgCost.toFixed(1)} resources.`,
      ok: `Probably enough money for cards that average ${avgCost.toFixed(1)} resources.`,
      thin: `Your cards average ${avgCost.toFixed(1)} resources but only ${t.count} help pay for them. Expect to spend turns taking the resource action.`,
      missing: `Nothing helps you pay for cards that average ${avgCost.toFixed(1)} resources. You'll lean hard on the resource action.`,
    };
    pillars.push({ key: 'econ', label: 'Money', count: t.count, target: Math.ceil(base[1] * scale), grade: g, note: notes[g], cards: t.cards, odds: odds(t.count) });
  }
  // Draw
  {
    const t = get('draw');
    const g = grade(t.count, 6, 3, 1);
    const notes = {
      strong: 'Lots of card draw, so you will find your key pieces quickly.',
      ok: 'Some card draw. You will usually find what you need by mid-game.',
      thin: `Only ${t.count} cards draw more cards, so your key assets may show up late.`,
      missing: 'No extra card draw. You only see one new card a round, so key assets can show up very late.',
    };
    pillars.push({ key: 'draw', label: 'Card draw', count: t.count, target: Math.ceil(3 * scale), grade: g, note: notes[g], cards: t.cards, odds: odds(t.count) });
  }
  // Treachery protection (willpower)
  const iconTotals = Object.fromEntries([...STATS.map(s => [s.key, 0]), ['x', 0]]);
  for (const e of playable) for (const k of Object.keys(iconTotals)) iconTotals[k] += (e.card[k] || 0) * e.count;
  {
    const t = merge('boost_w', 'cancel');
    const w = stat('w');
    const need = w >= 4 ? [2, 0, 0] : w === 3 ? [4, 2, 1] : [6, 4, 2];
    let g = w >= 4 && t.count === 0 ? 'ok' : grade(t.count, ...need);
    if (w >= 4 && t.count > 0) g = 'strong';
    const notes = {
      strong: w >= 4 ? `Willpower ${w} plus some help handles most treacheries.` : 'Good backup for treacheries that test your willpower.',
      ok: w >= 4 ? `Willpower ${w} handles most treacheries on its own.` : 'Some protection against treacheries. Willpower tests will still sting now and then.',
      thin: `Willpower ${w} with only ${t.count} cards to help. Treacheries that test willpower will often land.`,
      missing: `Willpower ${w} and nothing that boosts it or cancels treacheries. Expect to take a lot of horror from failed willpower tests.`,
    };
    pillars.push({ key: 'will', label: 'Treachery protection', count: t.count, target: need[1], grade: g, note: notes[g], cards: t.cards, odds: odds(t.count), sub: `${iconTotals.w} willpower icons to commit` });
  }
  // Staying alive
  {
    const soak = playable.filter(e => e.roles.has('soak')).reduce((s, e) => s + ((e.card.health || 0) + (e.card.sanity || 0)) * e.count, 0);
    const t = merge('heal', 'soak');
    const hp = inv ? (inv.health || 0) : 7, sp = inv ? (inv.sanity || 0) : 7;
    const frail = Math.min(hp, sp) <= 6;
    const need = frail ? [6, 3, 1] : [4, 2, 1];
    const g = grade(t.count, ...need);
    const low = hp <= sp ? 'health' : 'sanity';
    const notes = {
      strong: `Plenty of healing and allies to soak damage and horror (${soak} total soak).`,
      ok: `Some healing and soak (${soak} total). You can take a few hits.`,
      thin: `Only ${t.count} cards heal or soak. ${frail ? `With ${Math.min(hp, sp)} ${low}, a couple of bad turns could knock you out.` : 'Watch out in long scenarios.'}`,
      missing: `Nothing heals or soaks. ${frail ? `With ${Math.min(hp, sp)} ${low}, you are fragile.` : 'Every hit sticks for the whole scenario.'}`,
    };
    pillars.push({ key: 'alive', label: 'Staying alive', count: t.count, target: need[1], grade: g, note: notes[g], cards: t.cards, odds: odds(t.count), sub: `${soak} soak on assets · investigator ${hp} health / ${sp} sanity` });
  }

  // Skills
  const skills = STATS.map(s => ({
    ...s, base: stat(s.key), icons: iconTotals[s.key], boosts: get('boost_' + s.key).count,
  }));
  skills.wild = iconTotals.x;

  // Curve
  const curve = Array(7).fill(0); // 0..5, 6+
  for (const e of paid) curve[Math.min(e.card.cost, 6)] += e.count;
  const xCost = playable.filter(e => e.card.cost === -2 || e.card.cost === null && ['asset', 'event'].includes(e.card.type)).reduce((s, e) => s + e.count, 0);

  // Slots
  const SLOTS = { Hand: 2, Arcane: 2, Ally: 1, Accessory: 1, Body: 1, Tarot: 1, Head: 1 };
  const slots = Object.fromEntries(Object.keys(SLOTS).map(k => [k, { cap: SLOTS[k], cards: 0, names: [] }]));
  for (const e of playable) {
    if (e.card.type !== 'asset' || !e.card.slot || e.card.permanent) continue;
    for (const part of e.card.slot.split('.').map(s => s.trim()).filter(Boolean)) {
      const [name, mult] = part.split(' x');
      if (!slots[name]) continue;
      slots[name].cards += e.count * (mult ? +mult : 1);
      slots[name].names.push(e.card.name);
    }
  }
  const slotWarn = { Hand: 7, Arcane: 6, Ally: 5, Accessory: 4, Body: 3, Tarot: 2, Head: 3 };

  // Legality
  const legality = [];
  const allowedSizes = sizeChoice ? [+sizeChoice] : sizeSelect ? sizeSelect.deck_size_select.map(Number) : [sizeReq];
  if (inv && !allowedSizes.includes(deckSize)) legality.push({ level: 'error', text: `Deck has ${deckSize} cards, but ${inv.name} needs ${allowedSizes.join(' or ')}.` });
  if (inv) for (const code of new Set([...reqCodes])) { /* handled below by name */ }
  if (inv?.req) {
    for (const part of inv.req.split(',').map(s => s.trim()).filter(p => p.startsWith('card:'))) {
      const alts = part.slice(5).split(':');
      if (!entries.some(e => alts.includes(e.card.code) || alts.includes(e.card.dup))) {
        const nm = deck.lookup(alts[0])?.name || 'a signature card';
        legality.push({ level: 'error', text: `Missing required card: ${nm}.` });
      }
    }
  }
  const byName = new Map();
  for (const e of entries) {
    if (e.card.type === 'investigator') continue;
    const k = e.card.name + '|' + (e.card.xp ?? 0);
    const v = byName.get(k) || { n: 0, limit: e.card.limit ?? 2, card: e.card };
    v.n += e.count; byName.set(k, v);
  }
  for (const v of byName.values()) if (!v.card.subtype && v.n > v.limit) legality.push({ level: 'error', text: `${v.n} copies of ${v.card.name}; the limit is ${v.limit}.` });
  legality.push(...checkLegality(inv, entries, deck.choices || {}, new Set([...reqCodes].concat(entries.filter(e => isRequired(e.card)).map(e => e.card.code)))));
  if (!entries.some(e => e.card.subtype === 'basicweakness') && !deck.randomWeakness && inv) legality.push({ level: 'warn', text: 'No basic weakness listed. Remember to add one before you play.' });

  const xp = entries.reduce((s, e) => s + (e.card.xp || 0) * e.count * (e.card.exceptional ? 2 : 1), 0);

  // Summary
  const order = { missing: 0, thin: 1, ok: 2, strong: 3 };
  const fixFirst = [...pillars].filter(p => p.grade === 'missing' || p.grade === 'thin').sort((a, b) => order[a.grade] - order[b.grade]);
  for (const [name, s] of Object.entries(slots)) if (s.cards >= slotWarn[name]) fixFirst.push({ label: `${name} slots`, grade: 'thin', note: `${s.cards} ${name.toLowerCase()} cards competing for ${s.cap} slot${s.cap > 1 ? 's' : ''}. Some will sit in your hand or get discarded.` });
  const score = pillars.reduce((s, p) => s + order[p.grade], 0) / (pillars.length * 3);
  const headline = legality.some(l => l.level === 'error') ? 'Fix the deck rules first'
    : score >= 0.8 ? 'Ready for the Mythos' : score >= 0.6 ? 'Solid, with a weak spot or two' : score >= 0.4 ? 'Playable, but it has real gaps' : 'This deck needs work';

  return { inv, role: useRole, autoRole, players: useRole === 'solo' ? 1 : players, deckSize, sizeReq: allowedSizes.join('/'), drawSize, pillars, skills, curve, xCost, avgCost, slots, legality, xp, fixFirst, score, headline, entries: playable };
}

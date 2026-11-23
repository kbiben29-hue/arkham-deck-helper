// Builds data/cards.json from a checkout of https://github.com/Kamalisk/arkhamdb-json-data
// Usage: node scripts/build-cards.mjs ../arkhamdb-json-data
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/build-cards.mjs <path to arkhamdb-json-data>'); process.exit(1); }

const packs = JSON.parse(fs.readFileSync(path.join(src, 'packs.json'), 'utf8'));
const cycles = JSON.parse(fs.readFileSync(path.join(src, 'cycles.json'), 'utf8'));
const packOrder = Object.fromEntries(packs.map((p, i) => [p.code, i]));

const raw = [];
for (const dir of fs.readdirSync(path.join(src, 'pack'))) {
  for (const f of fs.readdirSync(path.join(src, 'pack', dir))) {
    if (!f.endsWith('.json')) continue;
    raw.push(...JSON.parse(fs.readFileSync(path.join(src, 'pack', dir, f), 'utf8')));
  }
}
const byCode = Object.fromEntries(raw.map(c => [c.code, c]));
// Reprints only list their differences; fill in from the original.
const full = raw.map(c => c.duplicate_of && byCode[c.duplicate_of] ? { ...byCode[c.duplicate_of], ...c } : c);

// Use the newest wording for cards that were reprinted with updated text (e.g. Core Set 2026).
const packDate = Object.fromEntries(packs.map(p => [p.code, p.date_release || '']));
const newest = new Map();
for (const c of full) {
  const id = c.duplicate_of || c.code;
  const prev = newest.get(id);
  if (!prev || (packDate[c.pack_code] || '') > (packDate[prev.pack_code] || '')) newest.set(id, c);
}
for (const c of full) {
  const n = newest.get(c.duplicate_of || c.code);
  if (n && n !== c && n.text) c.text = n.text;
}

const PLAYER_TYPES = new Set(['asset', 'event', 'skill', 'investigator']);
const keep = full.filter(c => !c.hidden || c.type_code === 'investigator')
  .filter(c => !c.encounter_code)
  .filter(c => PLAYER_TYPES.has(c.type_code) || c.subtype_code === 'weakness' || c.subtype_code === 'basicweakness')
  .filter(c => c.code !== '01000');

const out = keep.map(c => {
  const o = {
    code: c.code, name: c.name, type: c.type_code, fac: c.faction_code,
    pack: c.pack_code, xp: c.xp ?? null, qty: c.quantity ?? 1,
  };
  const opt = {
    sub: c.subname, fac2: c.faction2_code, fac3: c.faction3_code, subtype: c.subtype_code,
    cost: c.cost, slot: c.slot, traits: c.traits, text: c.text, health: c.health, sanity: c.sanity,
    limit: c.deck_limit, unique: c.is_unique, permanent: c.permanent, exceptional: c.exceptional,
    myriad: c.myriad, bonded: c.bonded_to ? true : undefined, tags: c.tags, restrictions: c.restrictions, dup: c.duplicate_of,
    options: c.deck_options || undefined, req: c.deck_requirements, bonded: c.bonded_to,
    w: c.skill_willpower, i: c.skill_intellect, c: c.skill_combat, a: c.skill_agility, x: c.skill_wild,
  };
  for (const [k, v] of Object.entries(opt)) if (v !== undefined && v !== null && v !== '' && v !== false) o[k] = v;
  return o;
}).sort((a, b) => (packOrder[a.pack] ?? 999) - (packOrder[b.pack] ?? 999) || a.code.localeCompare(b.code));

const playerCount = {};
for (const c of out) if (['asset', 'event', 'skill', 'investigator'].includes(c.type)) playerCount[c.pack] = (playerCount[c.pack] || 0) + 1;
const packList = packs.map(p => ({
  code: p.code, name: p.name, cycle: p.cycle_code, date: p.date_release || null,
  chapter: p.chapter || 1, players: playerCount[p.code] || 0,
}));
const cycleList = cycles.map(c => ({ code: c.code, name: c.name }));
fs.writeFileSync('data/cards.json', JSON.stringify({ packs: packList, cycles: cycleList, cards: out }));

// ---------------------------------------------------------------------------
// Campaign and scenario profiles, built from the encounter cards.
const enc = full.filter(c => c.encounter_code && c.faction_code === 'mythos' || c.encounter_code && ['enemy', 'treachery', 'location', 'scenario'].includes(c.type_code));
const plain = t => (t || '').replace(/<[^>]+>/g, '').toLowerCase();
const KEYWORDS = ['hunter', 'retaliate', 'alert', 'aloof', 'elusive', 'massive', 'patrol', 'swarming', 'prey'];
// Chaos token effects from a scenario reference card, keeping the original capitalisation.
function tokenLines(t) {
  const out = {};
  const txt = (t || '').replace(/<[^>]+>/g, '');
  for (const m of txt.matchAll(/\[(skull|cultist|tablet|elder_thing)\]:?\s*([^\n]*)/g)) out[m[1]] = m[2].trim();
  return Object.keys(out).length ? out : null;
}
function profile(cards) {
  const p = { tests: { willpower: 0, agility: 0, intellect: 0, combat: 0 }, treacheries: 0, enemies: 0, fight: [], evade: [], hp: [],
    dmg: 0, hor: 0, kw: Object.fromEntries(KEYWORDS.map(k => [k, 0])), shroud: [], locations: 0, doom: 0, curse: 0, bless: 0, frost: 0, flood: 0, poison: 0, surge: 0 };
  for (const c of cards) {
    const q = c.quantity || 1;
    const t = plain(c.text) + ' ' + plain(c.back_text);
    const w = c.type_code === 'treachery' ? 1 : 0.4;
    const seen = new Set();
    for (const m of t.matchAll(/test \[(willpower|agility|intellect|combat)\]|\[(willpower|agility|intellect|combat)\] test/g)) seen.add(m[1] || m[2]);
    for (const k of seen) p.tests[k] += q * w;
    if (c.type_code === 'treachery') {
      p.treacheries += q;
      for (const m of t.matchAll(/(\d+) (direct )?damage/g)) p.dmg += q * +m[1];
      for (const m of t.matchAll(/(\d+) (direct )?horror/g)) p.hor += q * +m[1];
    }
    if (c.type_code === 'enemy') {
      p.enemies += q;
      if (typeof c.enemy_fight === 'number') p.fight.push(...Array(q).fill(c.enemy_fight));
      if (typeof c.enemy_evade === 'number') p.evade.push(...Array(q).fill(c.enemy_evade));
      if (typeof c.health === 'number') p.hp.push(...Array(q).fill(c.health + (c.health_per_investigator ? c.health : 0)));
      p.dmg += q * (c.enemy_damage || 0) * 0.5; p.hor += q * (c.enemy_horror || 0) * 0.5;
      for (const k of KEYWORDS) if (new RegExp(`\\b${k}\\b`).test(t.split('\n')[0] + ' ' + t)) p.kw[k] += q;
    }
    if (c.type_code === 'location') {
      p.locations += q;
      if (typeof c.shroud === 'number') p.shroud.push(c.shroud);
    }
    if (/\bdoom\b/.test(t)) p.doom += q;
    if (/\[curse\]/.test(t)) p.curse += q;
    if (/\[bless\]/.test(t)) p.bless += q;
    if (/\[frost\]|frost token/.test(t)) p.frost += q;
    if (/\bflood/.test(t)) p.flood += q;
    if (/poison/.test(t)) p.poison += q;
    if (/\bsurge\b/.test(t)) p.surge += q;
  }
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  // Named threats and the most common treacheries, for the page and for the AI brief
  const seenT = new Set();
  const threats = cards.filter(c => c.type_code === 'enemy' && typeof c.enemy_fight === 'number')
    .map(c => ({ name: c.name, fight: c.enemy_fight, evade: c.enemy_evade, health: c.health ?? null, perInv: !!c.health_per_investigator,
      dmg: c.enemy_damage || 0, hor: c.enemy_horror || 0, kw: KEYWORDS.filter(k => new RegExp(`\\b${k}\\b`).test(plain(c.text))),
      elite: /elite/i.test(c.traits || ''), score: (c.enemy_fight || 0) + (c.health || 0) * (c.health_per_investigator ? 2 : 1) + (/elite/i.test(c.traits || '') ? 3 : 0) }))
    .sort((a, b) => b.score - a.score).filter(t => !seenT.has(t.name) && seenT.add(t.name)).slice(0, 4).map(({ score, ...t }) => t);
  const tre = cards.filter(c => c.type_code === 'treachery').sort((a, b) => (b.quantity || 1) - (a.quantity || 1))
    .filter(c => !seenT.has(c.name) && seenT.add(c.name)).slice(0, 5)
    .map(c => ({ name: c.name, copies: c.quantity || 1, test: (plain(c.text).match(/test \[(\w+)\] \((\d|x)\)/) || []).slice(1).join(' ') || null, text: plain(c.text).slice(0, 160) }));
  const scenCard = cards.find(c => c.type_code === 'scenario');
  const totalTests = Object.values(p.tests).reduce((a, b) => a + b, 0) || 1;
  const n = Math.max(1, p.enemies);
  return {
    cards: cards.length,
    tests: Object.fromEntries(Object.entries(p.tests).map(([k, v]) => [k, +(v / totalTests).toFixed(2)])),
    enemies: p.enemies, enemyFight: avg(p.fight), enemyEvade: avg(p.evade), enemyHealth: avg(p.hp),
    hunters: +(p.kw.hunter / n).toFixed(2), retaliate: +(p.kw.retaliate / n).toFixed(2), alert: +(p.kw.alert / n).toFixed(2),
    elusive: +(p.kw.elusive / n).toFixed(2), massive: +(p.kw.massive / n).toFixed(2),
    shroud: avg(p.shroud),
    damageShare: +(p.dmg / Math.max(1, p.dmg + p.hor)).toFixed(2),
    perCard: +((p.dmg + p.hor) / Math.max(1, p.treacheries + p.enemies)).toFixed(2),
    doom: +(p.doom / Math.max(1, cards.length)).toFixed(2), curse: p.curse, bless: p.bless, frost: p.frost, flood: p.flood, poison: p.poison,
    surge: +(p.surge / Math.max(1, p.treacheries)).toFixed(2),
    threats, treacheries: tre,
    tokens: scenCard ? plain(scenCard.text).replace(/^easy \/ standard\s*/, '').slice(0, 420) : null,
    tokenText: scenCard ? { standard: tokenLines(scenCard.text), hard: tokenLines(scenCard.back_text) } : null,
  };
}

const NOTES = {
  core: 'The introductory campaign. Ghouls and cultists, with a doom clock that punishes slow play.',
  dwl: 'Lots of enemies and a few huge, hard-to-damage monsters late on. Plenty of actions and ways to avoid fights pay off.',
  ptc: 'Heavy on horror and willpower. Sanity tends to run out before health does.',
  tfa: 'Jungle exploration with poison, supplies and vengeance. Healing is scarce, so soak and avoiding damage matter.',
  tcu: 'Spectral and haunted threats with lots of willpower tests. Weak-willed decks struggle.',
  tde: 'A split campaign: two groups play different scenarios. Expect some very large enemies in the Dreamlands.',
  tic: 'Flooded locations, Deep Ones and key tokens. Mobility and agility come in handy.',
  eoe: 'Frost tokens in the chaos bag and expedition partners you can bring along as allies.',
  tsk: 'A globe-trotting campaign where you choose where to travel; scenarios are varied and often short.',
  fhv: 'A day-and-night campaign around a village, with residents you build relationships with.',
};

const scenCards = full.filter(c => c.type_code === 'scenario' && c.encounter_code);
const campaignsOut = [];
const seenScen = new Set();
function addCampaign({ code, name, packsIn, group, chapter, note }) {
  const cards = enc.filter(c => packsIn.includes(c.pack_code) && c.type_code !== 'scenario');
  if (cards.length < 10) return;
  const scen = scenCards.filter(c => packsIn.includes(c.pack_code)).sort((a, b) => a.code.localeCompare(b.code))
    .filter(c => { const k = code + '|' + c.name; if (seenScen.has(k)) return false; seenScen.add(k); return true; })
    .map(c => ({ code: c.code, name: c.name, profile: profile(cards.filter(x => x.encounter_code === c.encounter_code).concat([c])) }))
    .filter(s => s.profile.cards >= 6);
  campaignsOut.push({ code, name, group, chapter, note: note || '', profile: profile(cards), scenarios: scen });
}
const byCycle = cyc => packs.filter(p => p.cycle_code === cyc).map(p => p.code);
addCampaign({ code: 'core_2026', name: 'Core Set (2026) campaign', packsIn: ['core_2026'], group: 'campaign', chapter: 2 });
addCampaign({ code: 'cob', name: 'Children of Blood', packsIn: ['cob'], group: 'campaign', chapter: 2 });
for (const p of packs.filter(p => p.cycle_code === 'scenario_packs_ch2')) addCampaign({ code: p.code, name: p.name, packsIn: [p.code], group: 'standalone', chapter: 2 });
addCampaign({ code: 'core', name: 'Night of the Zealot', packsIn: ['core', 'rcore'], group: 'campaign', chapter: 1, note: NOTES.core });
for (const cyc of ['dwl', 'ptc', 'tfa', 'tcu', 'tde', 'tic', 'eoe', 'tsk', 'fhv', 'tdc']) {
  addCampaign({ code: cyc, name: cycles.find(c => c.code === cyc).name, packsIn: byCycle(cyc), group: 'campaign', chapter: 1, note: NOTES[cyc] });
}
const RETURN = { rtnotz: 'core', rtdwl: 'dwl', rtptc: 'ptc', rttfa: 'tfa', rttcu: 'tcu' };
for (const [rp, base] of Object.entries(RETURN)) {
  addCampaign({ code: rp, name: packs.find(p => p.code === rp).name, packsIn: [...(base === 'core' ? ['core', 'rcore'] : byCycle(base)), rp], group: 'return', chapter: 1, note: NOTES[base] });
}
for (const p of packs.filter(p => p.cycle_code === 'side_stories')) addCampaign({ code: p.code, name: p.name, packsIn: [p.code], group: 'standalone', chapter: 1 });

// Averages across everything, so the page can say what's unusual about a campaign.
const all = profile(enc.filter(c => c.type_code !== 'scenario'));
fs.writeFileSync('data/campaigns.json', JSON.stringify({ average: all, campaigns: campaignsOut }));
console.log(`Wrote ${campaignsOut.length} campaigns, ${campaignsOut.reduce((s, c) => s + c.scenarios.length, 0)} scenarios`);
console.log(`Wrote ${out.length} cards, ${(fs.statSync('data/cards.json').size / 1024).toFixed(0)} KB`);

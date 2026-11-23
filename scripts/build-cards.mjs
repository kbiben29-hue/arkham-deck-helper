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
    if (!f.endsWith('.json') || f.includes('encounter')) continue;
    raw.push(...JSON.parse(fs.readFileSync(path.join(src, 'pack', dir, f), 'utf8')));
  }
}
const byCode = Object.fromEntries(raw.map(c => [c.code, c]));
// Reprints only list their differences; fill in from the original.
const full = raw.map(c => c.duplicate_of && byCode[c.duplicate_of] ? { ...byCode[c.duplicate_of], ...c } : c);

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
console.log(`Wrote ${out.length} cards, ${(fs.statSync('data/cards.json').size / 1024).toFixed(0)} KB`);

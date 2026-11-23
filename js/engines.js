// Deck "engines": themes a deck can be built around. The builder checks which ones your
// collection and investigator can actually support, then scores them against the scenario.

const plain = t => (t || '').replace(/<[^>]+>/g, '').toLowerCase();
const traits = c => (c.traits || '').toLowerCase().split('.').map(s => s.trim()).filter(Boolean);
const has = (c, t) => traits(c).includes(t);
const txt = c => plain(c.text);

export const ENGINES = [
  { key: 'tome', name: 'Tome scholar', plan: 'Get Tomes onto the table early and use them every turn for clues, cards and tricks.',
    match: c => has(c, 'tome'), stat: 'i' },
  { key: 'spell', name: 'Spell-slinger', plan: 'Fight and investigate with Spells that test willpower, backed by charges and arcane slots.',
    match: c => has(c, 'spell') || has(c, 'ritual') || /uses \(\d+ charges?\)/.test(txt(c)), stat: 'w', fits: pr => pr.willpower > 0 ? 1 : 0 },
  { key: 'firearm', name: 'Gunslinger', plan: 'Ammo-hungry firearms for big, reliable damage, with ways to reload.',
    match: c => has(c, 'firearm') || /\bammo\b/.test(txt(c)), stat: 'c', fits: pr => pr.tough > 0.2 ? 1.2 : 0 },
  { key: 'melee', name: 'Brawler', plan: 'Melee weapons and combat boosts. Simple, steady and never out of ammo.',
    match: c => has(c, 'melee') || /\+\d \[combat\]/.test(txt(c)) && c.type !== 'skill', stat: 'c', fits: pr => pr.tough < 0 ? 0.8 : 0 },
  { key: 'evade', name: 'Ghost', plan: 'Never fight. Evade, slip past and grab clues while enemies flail at shadows.',
    match: c => /\bevade\b|after you evade|automatically evade/.test(txt(c)), stat: 'a', fits: pr => (pr.hunters > 0.05 ? 1 : 0) + (pr.tough > 0.3 ? 1 : 0) - (pr.slippery > 0.3 ? 1 : 0) },
  { key: 'ally', name: 'Friends in high places', plan: 'Allies do the heavy lifting, soak hits and get replaced when they fall.',
    match: c => c.slot?.includes('Ally') || has(c, 'ally') || /\bally\b/.test(txt(c)) && c.type !== 'asset', fits: pr => Math.abs(pr.horror) > 0.05 ? 0.8 : 0.3 },
  { key: 'bless', name: 'Blessed', plan: 'Fill the chaos bag with bless tokens and cash them in for big effects.',
    match: c => /\[bless\]/.test(txt(c)), fits: pr => pr.curse ? 2 : 0 },
  { key: 'curse', name: 'Dark bargains', plan: 'Add curse tokens for power now, and turn the bad pulls into payoffs.',
    match: c => /\[curse\]/.test(txt(c)) },
  { key: 'seal', name: 'Sealbearer', plan: 'Seal chaos tokens to control what comes out of the bag.',
    match: c => (c.tags || '').includes('se') || /\bseal\b/.test(txt(c)) },
  { key: 'trick', name: 'Trickster', plan: 'Succeed by a lot and get paid for it: Tricks and "succeed by 2 or more" effects.',
    match: c => has(c, 'trick') || /succeed by (2|3|\d) or more|succeed by at least/.test(txt(c)) },
  { key: 'money', name: 'Big money', plan: 'Build a huge resource pool, then pay for the expensive, game-swinging cards.',
    match: c => /gain (\d|x|that many) resources?|resources? (to|onto) your resource pool/.test(txt(c)) || (c.cost >= 4 && c.type === 'asset') },
  { key: 'skills', name: 'Skill commit', plan: 'Lean on skill cards: commit big icons and stack effects that reward committing.',
    match: c => c.type === 'skill' || has(c, 'practiced') || has(c, 'innate') || /commit/.test(txt(c)) && c.type !== 'skill' },
  { key: 'fortune', name: 'Lucky streak', plan: 'Fortune cards and second chances to turn failed tests into wins.',
    match: c => has(c, 'fortune') || /after you fail a skill test|when you would fail/.test(txt(c)) },
  { key: 'recursion', name: 'Second helpings', plan: 'Play your best cards twice by pulling them back from the discard pile.',
    match: c => /from your discard pile|in your discard pile/.test(txt(c)) },
  { key: 'parley', name: 'Silver tongue', plan: 'Talk your way through: parley with enemies and bypass fights entirely.',
    match: c => (c.tags || '').includes('pa') || /\bparley\b/.test(txt(c)) },
  { key: 'medic', name: 'Field medic', plan: 'Keep the whole team standing with healing and protection.',
    match: c => (c.tags || '').match(/h[dh]/) || /\bheal\b/.test(txt(c)), fits: pr => Math.abs(pr.horror) > 0.05 ? 1 : 0.2 },
  { key: 'mobile', name: 'Fast mover', plan: 'Move further and faster than anyone: be where the clues are before doom catches up.',
    match: c => /move (to|up to|once)|additional move|move action/.test(txt(c)), fits: pr => pr.flood ? 1.2 : 0 },
];

// Which engines this investigator can run with the cards you own, best first.
export function viableEngines(pool, inv, pr = {}, rand = Math.random, spice = 1) {
  const invText = plain(inv.text);
  const out = [];
  for (const e of ENGINES) {
    const cards = pool.filter(p => e.match(p.card));
    const copies = cards.reduce((s, p) => s + p.max, 0);
    if (cards.length < 4 || copies < 7) continue;
    let score = Math.min(copies, 16) / 4;
    if (e.stat) score += ((inv[e.stat] || 0) - 3) * 0.9;
    if (e.fits) score += e.fits(pr);
    // Investigator ability mentions this theme
    if (invText.includes(e.key) || (e.key === 'tome' && invText.includes('tome')) || (e.key === 'spell' && invText.includes('spell'))) score += 2;
    score += (rand() - 0.5) * (0.5 + spice * 1.5);
    out.push({ ...e, cards: cards.length, copies, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// A tiny seeded random number generator so "reroll" gives new ideas but a seed is repeatable.
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

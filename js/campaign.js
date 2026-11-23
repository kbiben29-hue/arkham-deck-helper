// Reads a campaign or scenario profile (built from its encounter cards) and turns it into
// plain-language findings and adjustments for the deck builder.

const pct = x => `${Math.round(x * 100)}%`;

// Blend a scenario's own cards with its campaign so small scenario sets don't swing wildly.
export function blendProfile(campaign, scenario) {
  if (!scenario) return campaign.profile;
  const a = campaign.profile, b = scenario.profile;
  const mix = (x, y, w = 0.6) => x == null ? y : y == null ? x : +(y * w + x * (1 - w)).toFixed(2);
  return {
    ...a,
    tests: Object.fromEntries(Object.keys(a.tests).map(k => [k, mix(a.tests[k], b.tests[k], b.cards > 15 ? 0.6 : 0.35)])),
    enemyFight: mix(a.enemyFight, b.enemyFight), enemyEvade: mix(a.enemyEvade, b.enemyEvade), enemyHealth: mix(a.enemyHealth, b.enemyHealth),
    hunters: mix(a.hunters, b.hunters), shroud: mix(a.shroud, b.shroud), damageShare: mix(a.damageShare, b.damageShare),
  };
}

// Flags describing what stands out compared with the average across every campaign.
export function pressures(p, avg) {
  if (!p) return {};
  return {
    willpower: p.tests.willpower - avg.tests.willpower,      // + means more willpower tests than usual
    agility: p.tests.agility - avg.tests.agility,
    intellect: p.tests.intellect - avg.tests.intellect,
    tough: (p.enemyFight ?? avg.enemyFight) - avg.enemyFight + ((p.enemyHealth ?? avg.enemyHealth) - avg.enemyHealth) * 0.4,
    slippery: (p.enemyEvade ?? avg.enemyEvade) - avg.enemyEvade,
    hunters: (p.hunters ?? avg.hunters) - avg.hunters,
    shroud: (p.shroud ?? avg.shroud) - avg.shroud,
    horror: avg.damageShare - (p.damageShare ?? avg.damageShare),   // + means more horror than usual
    curse: p.curse > 3,
    frost: p.frost > 5,
    flood: p.flood > 5,
  };
}

export function findings(p, avg) {
  if (!p) return [];
  const pr = pressures(p, avg);
  const out = [];
  const top = Object.entries(p.tests).sort((a, b) => b[1] - a[1])[0];
  out.push({ w: 3, text: `Most skill tests are ${top[0]} (${pct(top[1])} of them; ${pct(avg.tests[top[0]])} is typical).` });
  if (pr.agility > 0.06) out.push({ w: pr.agility, text: `More agility tests than usual (${pct(p.tests.agility)}). Agility help or ways to ignore treacheries pay off.` });
  if (pr.willpower > 0.08 && top[0] !== 'willpower') out.push({ w: pr.willpower, text: 'Willpower is tested a lot. Low-willpower investigators will want boosts or cancels.' });
  if (pr.tough > 0.3) out.push({ w: pr.tough, text: `Enemies hit back hard: fight ${p.enemyFight} and health ${p.enemyHealth} on average. Bring weapons that deal extra damage, or plan to evade.` });
  else if (pr.tough < -0.3) out.push({ w: -pr.tough, text: `Enemies are on the weaker side (fight ${p.enemyFight}). Light weapons and basic attacks go further here.` });
  if (pr.slippery > 0.3) out.push({ w: pr.slippery, text: `Enemies are hard to evade (evade ${p.enemyEvade}). Fighting is often the cleaner answer.` });
  if (pr.hunters > 0.1) out.push({ w: pr.hunters * 4, text: `Lots of hunters (${pct(p.hunters)} of enemies). Enemies will come to you, so have an answer ready.` });
  if (pr.shroud > 0.25) out.push({ w: pr.shroud, text: `Locations are hard to investigate (shroud ${p.shroud} on average). Clue finders need intellect boosts or ways to discover clues without testing.` });
  else if (pr.shroud < -0.25) out.push({ w: -pr.shroud, text: `Locations are easy to investigate (shroud ${p.shroud}). Almost anyone can pick up clues here.` });
  if (pr.horror > 0.05) out.push({ w: pr.horror * 3, text: 'More horror than damage. Watch your sanity: horror soak and healing are worth more here.' });
  else if (pr.horror < -0.06) out.push({ w: -pr.horror * 3, text: 'More damage than horror. Health soak and healing are worth more here.' });
  if (pr.curse) out.push({ w: 0.5, text: 'Curse tokens show up in the encounter deck, so bless cards can offset them.' });
  if (pr.frost) out.push({ w: 0.5, text: 'Frost tokens go into the chaos bag, so tests get harder over time.' });
  if (pr.flood) out.push({ w: 0.5, text: 'Locations flood, so moving efficiently matters.' });
  return out.sort((a, b) => b.w - a.w).slice(0, 5).map(f => f.text);
}

// Adjust per-category targets for the deck based on what the campaign throws at you.
export function adjustTargets(targets, pr) {
  const t = { ...targets };
  if (!pr || pr.willpower === undefined) return t;
  if (pr.willpower > 0.1) t.protect += 1;
  if (pr.willpower > 0.2) t.protect += 1;
  if (pr.tough > 0.3 || pr.hunters > 0.1) t.enemy += 1;
  if (pr.shroud > 0.25) t.clue += 1;
  if (Math.abs(pr.horror) > 0.05) t.alive += 1;
  return t;
}

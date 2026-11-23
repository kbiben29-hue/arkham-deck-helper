// Builds data/bags.json (chaos bag contents for every campaign and scenario) from
// a checkout of https://github.com/zzorba/arkham-cards-data (the Arkham Cards app's campaign guide data).
// Usage: node scripts/build-bags.mjs ../arkham-cards-data
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/build-bags.mjs <path to arkham-cards-data>'); process.exit(1); }
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const DIFFS = ['easy', 'standard', 'hard', 'expert'];
const clean = t => (t || '').replace(/<[^>]+>/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[(\w+)\]/g, (m, w) => ({ skull: 'Skull', cultist: 'Cultist', tablet: 'Tablet', elder_thing: 'Elder Thing', auto_fail: 'Auto-fail', elder_sign: 'Elder Sign', bless: 'Bless', curse: 'Curse', frost: 'Frost' }[w] || w)).trim();

// Find difficulty choices ({id: 'standard', tokens: [...]}) anywhere inside a value.
function diffBags(o, out = {}) {
  if (Array.isArray(o)) { o.forEach(x => diffBags(x, out)); return out; }
  if (o && typeof o === 'object') {
    if (DIFFS.includes(o.id) && Array.isArray(o.tokens) && !out[o.id]) out[o.id] = o.tokens;
    Object.values(o).forEach(v => diffBags(v, out));
  }
  return out;
}
const tokenEffects = (step, type) => (step?.effects || []).filter(e => e.type === type).flatMap(e => e.tokens || []);

function scenarioBags(file) {
  const d = read(file);
  if (!d.scenario_name && !d.full_name) return null;
  const steps = Object.fromEntries((d.steps || []).map(s => [s.id, s]));
  const name = clean(d.scenario_name || d.full_name);
  let standalone = null, standaloneNotes = [];
  if (d.standalone_setup) {
    const ids = d.standalone_setup.filter(id => steps[id]);
    const fromChoices = diffBags(ids.map(id => steps[id]));
    if (Object.keys(fromChoices).length) standalone = fromChoices;
    else {
      const flat = ids.flatMap(id => tokenEffects(steps[id], 'add_chaos_token'));
      const diffStep = ids.map(id => steps[id]).find(s => (s.effects || []).some(e => e.type === 'campaign_data' && e.setting === 'difficulty'));
      const diff = diffStep?.effects.find(e => e.setting === 'difficulty')?.value || 'standard';
      if (flat.length >= 8) standalone = { [diff]: flat };
    }
    for (const id of ids) {
      const s = steps[id];
      if (Object.keys(diffBags(s)).length) continue;
      if (s.input?.type === 'choose_one' && s.input.choices?.some(c => (c.effects || []).some(e => /chaos_token/.test(e.type)))) standaloneNotes.push(clean(s.text));
      else if (/chaos bag|chaos token/i.test(s.text || '') && !/^Assemble the chaos bag using/i.test(s.text || '')) standaloneNotes.push(clean(s.text));
    }
  }
  // Side stories put their bag in the normal setup
  if (!standalone) {
    const setupSteps = (d.setup || []).map(id => steps[id]).filter(Boolean);
    const b = diffBags(setupSteps);
    if (Object.keys(b).length) standalone = b;
  }
  // Campaign-mode changes made during this scenario's setup
  const campaignNotes = [];
  for (const id of d.setup || []) {
    const s = steps[id];
    if (!s || !s.text) continue;
    const touches = (s.effects || []).some(e => /chaos_token/.test(e.type)) || /^(add|remove)\b.*chaos (bag|token)/i.test(s.text);
    if (touches && !DIFFS.some(x => diffBags(s)[x])) campaignNotes.push(clean(s.text));
  }
  return { id: d.id, name, standalone, standaloneNotes: standaloneNotes.slice(0, 4), campaignNotes: campaignNotes.slice(0, 5) };
}

const campaignsDir = path.join(src, 'campaigns');
const out = [];
for (const dir of fs.readdirSync(campaignsDir).sort()) {
  if (dir.startsWith('z')) continue; // fan-made campaigns
  const camp = read(path.join(campaignsDir, dir, 'campaign.json'));
  const files = fs.readdirSync(path.join(campaignsDir, dir)).filter(f => f.endsWith('.json') && f !== 'campaign.json');
  const byId = Object.fromEntries(files.map(f => [f.replace('.json', ''), path.join(campaignsDir, dir, f)]));
  const order = [...(camp.scenarios || []), ...Object.keys(byId).filter(k => !(camp.scenarios || []).includes(k))];
  const scenarios = order.map(id => byId[id] && scenarioBags(byId[id])).filter(Boolean);
  const bags = diffBags(camp.setup ? (camp.steps || []).filter(s => camp.setup.includes(s.id)) : camp.steps || []);
  if (dir === 'side') {
    for (const sc of scenarios) if (sc.standalone) out.push({ id: `side:${sc.id}`, name: sc.name, kind: 'side', bags: sc.standalone, scenarios: [sc] });
    continue;
  }
  out.push({ id: dir, name: clean(camp.name), kind: camp.campaign_type === 'standalone' ? 'side' : 'campaign', bags, scenarios });
}
// Return to… campaigns use their original campaign's bags
const retDir = path.join(src, 'return_campaigns');
const idMap = { core: 'notz' };
for (const dir of fs.existsSync(retDir) ? fs.readdirSync(retDir).sort() : []) {
  const camp = read(path.join(retDir, dir, 'campaign.json'));
  const orig = out.find(c => c.id === (idMap[camp.original_id] || camp.original_id));
  if (!orig || /unofficial/i.test(camp.name)) continue;
  const files = fs.readdirSync(path.join(retDir, dir)).filter(f => f.endsWith('.json') && f !== 'campaign.json');
  const scenarios = files.map(f => scenarioBags(path.join(retDir, dir, f))).filter(Boolean);
  out.push({ id: dir, name: clean(camp.name), kind: 'return', bags: orig.bags, scenarios: scenarios.length ? scenarios : orig.scenarios });
}
fs.writeFileSync('data/bags.json', JSON.stringify(out));
console.log(`Wrote ${out.length} campaigns/standalones, ${out.reduce((s, c) => s + c.scenarios.filter(x => x.standalone).length, 0)} with standalone bags`);
for (const c of out) console.log(c.kind.padEnd(8), c.name.padEnd(42), Object.keys(c.bags).join('/').padEnd(26), c.scenarios.length, 'scen,', c.scenarios.filter(s => s.standalone).length, 'standalone');

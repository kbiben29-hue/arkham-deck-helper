// "Chaos bag" tab: build the bag, draw tokens, and see the odds of passing a test.

const NUMS = ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8'];
const SYMBOLS = ['skull', 'cultist', 'tablet', 'elder_thing'];
const SPECIAL = ['auto_fail', 'elder_sign', 'bless', 'curse', 'frost'];
const ALL = [...NUMS, ...SYMBOLS, ...SPECIAL];
const LABEL = { skull: 'Skull', cultist: 'Cultist', tablet: 'Tablet', elder_thing: 'Elder Thing', auto_fail: 'Auto-fail', elder_sign: 'Elder Sign', bless: 'Bless', curse: 'Curse', frost: 'Frost' };
const SHORT = { skull: 'Sk', cultist: 'Cu', tablet: 'Ta', elder_thing: 'ET', auto_fail: '✕', elder_sign: '★', bless: 'B', curse: 'C', frost: 'Fr' };

// Night of the Zealot bags from the Core Set campaign guide.
const PRESETS = {
  'notz-easy': { name: 'Night of the Zealot: Easy', bag: { '+1': 2, '0': 3, '-1': 3, '-2': 2, skull: 2, cultist: 1, tablet: 1, auto_fail: 1, elder_sign: 1 } },
  'notz-standard': { name: 'Night of the Zealot: Standard', bag: { '+1': 1, '0': 2, '-1': 3, '-2': 2, '-3': 1, '-4': 1, skull: 2, cultist: 1, tablet: 1, auto_fail: 1, elder_sign: 1 } },
  'notz-hard': { name: 'Night of the Zealot: Hard', bag: { '0': 3, '-1': 2, '-2': 2, '-3': 2, '-4': 1, '-5': 1, skull: 2, cultist: 1, tablet: 1, auto_fail: 1, elder_sign: 1 } },
  'notz-expert': { name: 'Night of the Zealot: Expert', bag: { '0': 1, '-1': 2, '-2': 2, '-3': 2, '-4': 2, '-5': 1, '-6': 1, '-8': 1, skull: 2, cultist: 1, tablet: 1, auto_fail: 1, elder_sign: 1 } },
};

// Read a symbol's effect text: "-2. If you fail…" → { value: -2 }, "-X. X is…" → X, "Reveal another token…" → redraw.
function parseEffect(text) {
  if (!text) return null;
  const t = text.trim();
  if (/^reveal another (chaos )?token/i.test(t)) return { value: 0, redraw: true, x: false };
  if (/^automatically fail/i.test(t)) return { value: 0, fail: true };
  const m = t.match(/^([+-−]?)(\d+|x)\b/i);
  if (!m) return null;
  if (/x/i.test(m[2])) return { value: -2, x: true, redraw: /reveal another/i.test(t) };
  const n = +m[2] * (m[1] === '+' ? 1 : -1);
  return { value: n, redraw: /reveal another/i.test(t), x: false };
}

export function initChaos(camps, ui) {
  const { esc, store } = ui;
  const root = document.querySelector('#view-bag');
  const saved = (() => { try { return JSON.parse(store.get('bag') || 'null'); } catch { return null; } })();
  const S = saved || {
    bag: { ...PRESETS['notz-standard'].bag }, preset: 'notz-standard',
    values: { skull: -1, cultist: -2, tablet: -2, elder_thing: -3, elder_sign: 1, frost: -1 },
    redraw: { skull: false, cultist: false, tablet: false, elder_thing: false },
    campaign: '', scenario: '', hard: false,
    skill: 3, difficulty: 2,
  };
  S.history = []; S.last = null;
  const save = () => { const { history, last, ...keep } = S; store.set('bag', JSON.stringify(keep)); };
  const campaignBy = Object.fromEntries(camps.campaigns.map(c => [c.code, c]));

  function effects() {
    const c = campaignBy[S.campaign];
    const sc = c?.scenarios.find(x => x.code === S.scenario);
    const tt = sc?.profile.tokenText;
    return tt ? (S.hard ? tt.hard : tt.standard) || tt.standard : null;
  }
  function applyScenarioValues() {
    const fx = effects();
    if (!fx) return;
    for (const k of SYMBOLS) {
      const p = parseEffect(fx[k]);
      if (!p) continue;
      S.values[k] = p.fail ? -99 : p.value;
      S.redraw[k] = !!p.redraw;
    }
  }

  // --- Maths ----------------------------------------------------------------
  const valueOf = k => {
    if (k === 'auto_fail') return { fail: true };
    if (k === 'elder_sign') return { mod: +S.values.elder_sign || 0 };
    if (k === 'bless') return { mod: 2, redraw: true };
    if (k === 'curse') return { mod: -2, redraw: true };
    if (k === 'frost') return { mod: +S.values.frost || 0 };
    if (SYMBOLS.includes(k)) return S.values[k] <= -99 ? { fail: true } : { mod: +S.values[k] || 0, redraw: !!S.redraw[k] };
    return { mod: +k };
  };
  // Probability of each total modifier (and of automatic failure) for one test.
  function distribution(bag = S.bag, depth = 0) {
    const out = { fail: 0, mods: new Map() };
    const total = Object.values(bag).reduce((a, b) => a + b, 0);
    if (!total) return out;
    for (const [k, n] of Object.entries(bag)) {
      if (!n) continue;
      const p = n / total, v = valueOf(k);
      if (v.fail) { out.fail += p; continue; }
      if (v.redraw && depth < 4) {
        const rest = { ...bag, [k]: n - 1 };
        const sub = distribution(rest, depth + 1);
        out.fail += p * sub.fail;
        for (const [m, q] of sub.mods) out.mods.set(m + v.mod, (out.mods.get(m + v.mod) || 0) + p * q);
        if (!Object.values(rest).some(Boolean)) out.mods.set(v.mod, (out.mods.get(v.mod) || 0) + p);
      } else out.mods.set(v.mod, (out.mods.get(v.mod) || 0) + p);
    }
    return out;
  }
  const chance = (dist, margin) => { let s = 0; for (const [m, q] of dist.mods) if (margin + m >= 0) s += q; return s; };

  // --- Drawing ----------------------------------------------------------------
  function draw() {
    const pool = { ...S.bag };
    const chain = [];
    let mod = 0, fail = false;
    for (let i = 0; i < 6; i++) {
      const list = Object.entries(pool).flatMap(([k, n]) => Array(n).fill(k));
      if (!list.length) break;
      const k = list[Math.floor(Math.random() * list.length)];
      pool[k]--;
      chain.push(k);
      const v = valueOf(k);
      if (v.fail) { fail = true; break; }
      mod += v.mod;
      if (!v.redraw) break;
    }
    // Bless and curse tokens leave the bag once revealed
    for (const k of chain) if ((k === 'bless' || k === 'curse') && S.bag[k] > 0) S.bag[k]--;
    S.last = { chain, mod, fail };
    S.history.unshift(S.last);
    S.history = S.history.slice(0, 12);
  }

  // --- Rendering --------------------------------------------------------------
  const tokenBadge = (k, big = false) => {
    const sym = !NUMS.includes(k);
    return `<span class="tok ${sym ? `tok-${k}` : 'tok-num'} ${big ? 'big' : ''}" title="${esc(LABEL[k] || k)}">${sym ? SHORT[k] : k}</span>`;
  };
  const fmt = n => n > 0 ? `+${n}` : String(n);
  const pctTxt = x => `${Math.round(x * 100)}%`;

  function render() {
    const fx = effects();
    const c = campaignBy[S.campaign];
    const total = Object.values(S.bag).reduce((a, b) => a + b, 0);
    const dist = distribution();
    const margins = [-2, -1, 0, 1, 2, 3, 4, 5];
    const yourChance = chance(dist, (+S.skill || 0) - (+S.difficulty || 0));
    const row = k => `<div class="bag-row">${tokenBadge(k)}<span class="bag-name">${esc(LABEL[k] || k)}</span>
      <span class="stepper"><button data-dec="${k}" ${S.bag[k] ? '' : 'disabled'} aria-label="Remove a ${esc(LABEL[k] || k)} token">−</button><span>${S.bag[k] || 0}</span><button data-inc="${k}" aria-label="Add a ${esc(LABEL[k] || k)} token">+</button></span></div>`;
    const symRow = k => `<div class="sym-row">
      <div class="sym-head">${tokenBadge(k)}<b>${LABEL[k]}</b>
        <label class="inline">Value <input type="number" inputmode="numeric" data-val="${k}" value="${S.values[k] <= -99 ? '' : S.values[k]}" ${S.values[k] <= -99 ? 'placeholder="fail"' : ''}></label>
        <label class="inline chk"><input type="checkbox" data-redraw="${k}" ${S.redraw[k] ? 'checked' : ''}> Reveal another</label></div>
      ${fx?.[k] ? `<p class="sub fx">${esc(fx[k].replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[(\w+)\]/g, (m, w) => LABEL[w] || w))}</p>` : ''}
    </div>`;
    const lastHtml = S.last ? `<div class="drawn">
        <div class="chain">${S.last.chain.map(k => tokenBadge(k, true)).join('<span class="plus">then</span>')}</div>
        <p class="result ${S.last.fail ? 'bad' : ''}">${S.last.fail ? 'Automatic failure' : `Total modifier ${fmt(S.last.mod)}`}</p>
        ${S.last.chain.some(k => SYMBOLS.includes(k)) && fx ? `<p class="sub">${S.last.chain.filter(k => SYMBOLS.includes(k)).map(k => `<b>${LABEL[k]}:</b> ${esc((fx[k] || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[(\w+)\]/g, (m, w) => LABEL[w] || w))}`).join('<br>')}</p>` : ''}
      </div>` : `<p class="sub">Draw a token to resolve a test. Tokens go back in the bag after each draw, except bless and curse, which leave it.</p>`;

    root.innerHTML = `
      <section class="panel b-step">
        <h2>Your chaos bag <span class="sub" style="font-family:inherit;font-size:16px">${total} tokens</span></h2>
        <div class="who-row" style="margin-top:10px">
          <label>Start from<select data-preset>
            <option value="">Keep my bag</option>
            ${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}" ${S.preset === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select></label>
          <label>Scenario (for token effects)<select data-camp><option value="">None</option>
            ${camps.campaigns.filter(x => x.scenarios.some(s => s.profile.tokenText)).map(x => `<option value="${x.code}" ${x.code === S.campaign ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          ${c ? `<label>&nbsp;<select data-scen>${c.scenarios.filter(s => s.profile.tokenText).map(s => `<option value="${s.code}" ${s.code === S.scenario ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
          ${c ? `<div class="seg" role="group" aria-label="Difficulty"><button data-hard="0" aria-pressed="${!S.hard}">Easy / Standard</button><button data-hard="1" aria-pressed="${S.hard}">Hard / Expert</button></div>` : ''}
        </div>
        <p class="sub" style="margin:8px 0 0">Your campaign log says which tokens are in the bag. Presets cover Night of the Zealot; for other campaigns, set the counts below once and they're remembered on this device.</p>
        <div class="bag-grid">
          <div><h3 class="mini-h">Numbers</h3>${NUMS.map(row).join('')}</div>
          <div><h3 class="mini-h">Symbols and specials</h3>${[...SYMBOLS, ...SPECIAL].map(row).join('')}</div>
        </div>
      </section>

      <div class="two-col">
        <section class="panel b-step">
          <h2>Draw</h2>
          <div class="result-actions"><button class="primary big-btn" data-act="draw" ${total ? '' : 'disabled'}>Draw a token</button></div>
          ${lastHtml}
          ${S.history.length > 1 ? `<p class="sub" style="margin:12px 0 4px">Earlier draws</p><div class="hist">${S.history.slice(1).map(h => `<span class="hchip ${h.fail ? 'bad' : ''}">${h.chain.map(k => tokenBadge(k)).join('')}<small>${h.fail ? 'fail' : fmt(h.mod)}</small></span>`).join('')}</div>` : ''}
        </section>
        <section class="panel b-step">
          <h2>Odds</h2>
          <div class="who-row">
            <label>Your skill<input type="number" inputmode="numeric" data-skill value="${S.skill}"></label>
            <label>Test difficulty<input type="number" inputmode="numeric" data-diff value="${S.difficulty}"></label>
          </div>
          <p class="odds-big"><b>${pctTxt(yourChance)}</b> chance to pass</p>
          <p class="sub" style="margin:2px 0 10px">Includes the symbol values and "reveal another" settings below, bless and curse, and a ${pctTxt(dist.fail)} chance of automatic failure.</p>
          <div class="odds-table">${margins.map(m => { const p = chance(dist, m); return `<div class="odds-row ${m === (+S.skill || 0) - (+S.difficulty || 0) ? 'now' : ''}"><span>${m === 0 ? 'Skill = difficulty' : `${fmt(m)} over`}</span><span class="meter"><i style="width:${p * 100}%;background:var(--accent)"></i></span><b>${pctTxt(p)}</b></div>`; }).join('')}</div>
        </section>
      </div>

      <section class="panel b-step">
        <h2>Symbol tokens</h2>
        <p class="sub" style="margin:4px 0 10px">${fx ? `Values filled in from ${esc(c.scenarios.find(s => s.code === S.scenario)?.name || '')} (${S.hard ? 'Hard / Expert' : 'Easy / Standard'}). Where the card says -X, set X for the current situation.` : 'Pick a scenario above to fill these in from its reference card, or set them yourself.'}</p>
        <div class="sym-grid">${SYMBOLS.map(symRow).join('')}
          <div class="sym-row"><div class="sym-head">${tokenBadge('elder_sign')}<b>Elder Sign</b><label class="inline">Value <input type="number" inputmode="numeric" data-val="elder_sign" value="${S.values.elder_sign}"></label></div><p class="sub fx">Set this to your investigator's Elder Sign bonus.</p></div>
          <div class="sym-row"><div class="sym-head">${tokenBadge('frost')}<b>Frost</b><label class="inline">Value <input type="number" inputmode="numeric" data-val="frost" value="${S.values.frost}"></label></div><p class="sub fx">Only used in some campaigns. Set it as your rules say.</p></div>
        </div>
      </section>`;
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.inc) { S.bag[d.inc] = (S.bag[d.inc] || 0) + 1; S.preset = ''; }
    else if (d.dec) { S.bag[d.dec] = Math.max(0, (S.bag[d.dec] || 0) - 1); S.preset = ''; }
    else if (d.act === 'draw') draw();
    else if (d.hard !== undefined) { S.hard = d.hard === '1'; applyScenarioValues(); }
    else return;
    save(); render();
  });
  root.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (d.preset !== undefined) { if (t.value) { S.bag = { ...PRESETS[t.value].bag }; S.preset = t.value; } }
    else if (d.camp !== undefined) { S.campaign = t.value; const c = campaignBy[t.value]; S.scenario = c?.scenarios.find(s => s.profile.tokenText)?.code || ''; applyScenarioValues(); }
    else if (d.scen !== undefined) { S.scenario = t.value; applyScenarioValues(); }
    else if (d.val) { S.values[d.val] = t.value === '' ? 0 : +t.value; }
    else if (d.redraw) { S.redraw[d.redraw] = t.checked; }
    else if (d.skill !== undefined) S.skill = +t.value;
    else if (d.diff !== undefined) S.difficulty = +t.value;
    else return;
    save(); render();
  });
  render();
}

export { parseEffect };

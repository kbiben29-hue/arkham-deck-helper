// "Chaos bag" tab: build the bag, draw tokens, and see the odds of passing a test.

const NUMS = ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8'];
const SYMBOLS = ['skull', 'cultist', 'tablet', 'elder_thing'];
const SPECIAL = ['auto_fail', 'elder_sign', 'bless', 'curse', 'frost'];
const ALL = [...NUMS, ...SYMBOLS, ...SPECIAL];
const LABEL = { skull: 'Skull', cultist: 'Cultist', tablet: 'Tablet', elder_thing: 'Elder Thing', auto_fail: 'Auto-fail', elder_sign: 'Elder Sign', bless: 'Bless', curse: 'Curse', frost: 'Frost' };
const SHORT = { skull: 'Sk', cultist: 'Cu', tablet: 'Ta', elder_thing: 'ET', auto_fail: '✕', elder_sign: '★', bless: 'B', curse: 'C', frost: 'Fr' };

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

export function initChaos(camps, bags, ui) {
  const { esc, store } = ui;
  const root = document.querySelector('#view-bag');
  const saved = (() => { try { return JSON.parse(store.get('bag2') || 'null'); } catch { return null; } })();
  const S = saved || {
    mode: 'campaign', source: 'notz', scenario: '', diff: 'standard',
    custom: {},   // edited bags, keyed by mode|campaign|scenario|difficulty
    values: { skull: -1, cultist: -2, tablet: -2, elder_thing: -3, elder_sign: 1, frost: -1 },
    redraw: { skull: false, cultist: false, tablet: false, elder_thing: false },
    skill: 3, difficulty: 2,
  };
  S.history = []; S.last = null;
  const save = () => { const { history, last, ...keep } = S; store.set('bag2', JSON.stringify(keep)); };

  const bagBy = Object.fromEntries(bags.map(b => [b.id, b]));
  const norm = n => (n || '').toLowerCase().replace(/^return to /, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const effectsByName = new Map();
  for (const c of camps.campaigns) for (const sc of c.scenarios) if (sc.profile.tokenText && !effectsByName.has(norm(sc.name))) effectsByName.set(norm(sc.name), sc.profile.tokenText);

  const source = () => bagBy[S.source] || bags[0];
  const scen = () => { const src = source(); return src.scenarios.find(x => x.id === S.scenario) || (src.kind === 'side' ? src.scenarios[0] : null); };
  const counts = list => list.reduce((o, t) => { const k = t === 'elder_thing' || NUMS.includes(t) || SYMBOLS.includes(t) || SPECIAL.includes(t) ? t : t; o[k] = (o[k] || 0) + 1; return o; }, {});
  // Which bag the guide says to use for the current choices, and why.
  function guideBag() {
    const src = source(), sc = scen();
    const standalone = S.mode === 'standalone' || src.kind === 'side';
    if (standalone && sc?.standalone) {
      const d = sc.standalone[S.diff] ? S.diff : Object.keys(sc.standalone)[0];
      return { list: sc.standalone[d], diff: d, why: `Standalone bag for ${sc.name} (${cap(d)}), from its setup.` };
    }
    const d = src.bags[S.diff] ? S.diff : Object.keys(src.bags)[0];
    if (!d) return { list: [], diff: S.diff, why: 'No bag listed for this one. Set the tokens yourself.' };
    return { list: src.bags[d], diff: d, why: standalone
      ? `${sc ? `${sc.name} has no separate standalone bag listed, so this` : 'This'} is ${src.name}'s starting bag (${cap(d)}). Check the scenario's standalone setup for extra tokens.`
      : `${src.name} starting bag (${cap(d)}). As the campaign goes on, add and remove tokens as your campaign log says; your changes are saved for this campaign.` };
  }
  const key = () => S.mode === 'standalone' || source().kind === 'side' ? `s|${S.source}|${scen()?.id || ''}|${S.diff}` : `c|${S.source}|${S.diff}`;
  const bagNow = () => S.custom[key()] || counts(guideBag().list);
  const editBag = fn => { const b = { ...bagNow() }; fn(b); S.custom[key()] = b; };
  Object.defineProperty(S, 'bag', { get: bagNow, enumerable: false, configurable: true });
  const cap = w => w ? w[0].toUpperCase() + w.slice(1) : '';

  function effects() {
    const sc = scen();
    const tt = sc ? effectsByName.get(norm(sc.name)) : null;
    if (!tt) return null;
    const hard = S.diff === 'hard' || S.diff === 'expert';
    return (hard ? tt.hard : tt.standard) || tt.standard;
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
    if (chain.some(k => k === 'bless' || k === 'curse')) editBag(b => { for (const k of chain) if ((k === 'bless' || k === 'curse') && b[k] > 0) b[k]--; });
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
    const total = Object.values(bagNow()).reduce((a, b) => a + b, 0);
    const dist = distribution();
    const margins = [-2, -1, 0, 1, 2, 3, 4, 5];
    const yourChance = chance(dist, (+S.skill || 0) - (+S.difficulty || 0));
    const bagC = bagNow();
    const row = k => `<div class="bag-row">${tokenBadge(k)}<span class="bag-name">${esc(LABEL[k] || k)}</span>
      <span class="stepper"><button data-dec="${k}" ${bagC[k] ? '' : 'disabled'} aria-label="Remove a ${esc(LABEL[k] || k)} token">−</button><span>${bagC[k] || 0}</span><button data-inc="${k}" aria-label="Add a ${esc(LABEL[k] || k)} token">+</button></span></div>`;
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

    const src = source(), sc = scen(), gb = guideBag();
    const edited = !!S.custom[key()];
    const groups = [
      ['Campaigns', bags.filter(b => b.kind === 'campaign')],
      ['Return to…', bags.filter(b => b.kind === 'return')],
      ['Standalone scenarios and side stories', bags.filter(b => b.kind === 'side')],
    ];
    const diffs = ['easy', 'standard', 'hard', 'expert'].filter(d => (sc?.standalone && (S.mode === 'standalone' || src.kind === 'side') ? sc.standalone[d] : src.bags[d]));
    const campScens = src.scenarios.filter(x => src.kind !== 'side');
    const notes = [
      ...(S.mode === 'standalone' || src.kind === 'side' ? sc?.standaloneNotes || [] : []),
      ...(S.mode === 'campaign' && src.kind !== 'side' ? (sc?.campaignNotes || []).map(n => `During ${sc.name} setup: ${n}`) : []),
    ];
    root.innerHTML = `
      <section class="panel b-step">
        <h2>Your chaos bag <span class="sub" style="font-family:inherit;font-size:16px">${total} tokens</span></h2>
        ${src.kind !== 'side' ? `<div class="seg" role="group" aria-label="How you're playing" style="margin-top:10px"><button data-mode="campaign" aria-pressed="${S.mode === 'campaign'}">Whole campaign</button><button data-mode="standalone" aria-pressed="${S.mode === 'standalone'}">Standalone scenario</button></div>` : ''}
        <div class="who-row" style="margin-top:10px">
          <label>What you're playing<select data-src>
            ${groups.map(([g, l]) => `<optgroup label="${g}">${l.map(b => `<option value="${b.id}" ${b.id === S.source ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</optgroup>`).join('')}
          </select></label>
          ${campScens.length ? `<label>Scenario<select data-scen>${S.mode === 'campaign' ? '<option value="">(any)</option>' : ''}${campScens.map(x => `<option value="${x.id}" ${x.id === (sc?.id || '') ? 'selected' : ''}>${esc(x.name)}${S.mode === 'standalone' && x.standalone ? ' ★' : ''}</option>`).join('')}</select></label>` : ''}
          <div class="seg" role="group" aria-label="Difficulty">${diffs.map(d => `<button data-diff="${d}" aria-pressed="${gb.diff === d}">${cap(d)}</button>`).join('')}</div>
        </div>
        <p class="sub" style="margin:8px 0 0">${esc(gb.why)}${edited ? ' <b>You\'ve changed this bag.</b> <button class="linkish small" data-act="reset-bag">Reset to the guide\'s bag</button>' : ''}</p>
        ${S.mode === 'standalone' && src.kind !== 'side' ? '<p class="sub" style="margin:4px 0 0">★ = has its own standalone bag in the guide.</p>' : ''}
        ${notes.length ? `<ul class="bag-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
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
            <label>Test difficulty<input type="number" inputmode="numeric" data-tdiff value="${S.difficulty}"></label>
          </div>
          <p class="odds-big"><b>${pctTxt(yourChance)}</b> chance to pass</p>
          <p class="sub" style="margin:2px 0 10px">Includes the symbol values and "reveal another" settings below, bless and curse, and a ${pctTxt(dist.fail)} chance of automatic failure.</p>
          <div class="odds-table">${margins.map(m => { const p = chance(dist, m); return `<div class="odds-row ${m === (+S.skill || 0) - (+S.difficulty || 0) ? 'now' : ''}"><span>${m === 0 ? 'Skill = difficulty' : `${fmt(m)} over`}</span><span class="meter"><i style="width:${p * 100}%;background:var(--accent)"></i></span><b>${pctTxt(p)}</b></div>`; }).join('')}</div>
        </section>
      </div>

      <section class="panel b-step">
        <h2>Symbol tokens</h2>
        <p class="sub" style="margin:4px 0 10px">${fx ? `Values filled in from ${esc(scen()?.name || '')} (${S.diff === 'hard' || S.diff === 'expert' ? 'Hard / Expert' : 'Easy / Standard'}). Where the card says -X, set X for the current situation.` : 'Pick a scenario above to fill these in from its reference card, or set them yourself.'}</p>
        <div class="sym-grid">${SYMBOLS.map(symRow).join('')}
          <div class="sym-row"><div class="sym-head">${tokenBadge('elder_sign')}<b>Elder Sign</b><label class="inline">Value <input type="number" inputmode="numeric" data-val="elder_sign" value="${S.values.elder_sign}"></label></div><p class="sub fx">Set this to your investigator's Elder Sign bonus.</p></div>
          <div class="sym-row"><div class="sym-head">${tokenBadge('frost')}<b>Frost</b><label class="inline">Value <input type="number" inputmode="numeric" data-val="frost" value="${S.values.frost}"></label></div><p class="sub fx">Only used in some campaigns. Set it as your rules say.</p></div>
        </div>
      </section>`;
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.inc) editBag(x => { x[d.inc] = (x[d.inc] || 0) + 1; });
    else if (d.dec) editBag(x => { x[d.dec] = Math.max(0, (x[d.dec] || 0) - 1); });
    else if (d.act === 'draw') draw();
    else if (d.act === 'reset-bag') delete S.custom[key()];
    else if (d.mode) { S.mode = d.mode; if (S.mode === 'standalone' && !S.scenario) S.scenario = source().scenarios.find(x => x.standalone)?.id || source().scenarios[0]?.id || ''; applyScenarioValues(); }
    else if (d.diff) { S.diff = d.diff; applyScenarioValues(); }
    else return;
    save(); render();
  });
  root.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (d.src !== undefined) { S.source = t.value; S.scenario = source().kind === 'side' ? source().scenarios[0]?.id : (S.mode === 'standalone' ? source().scenarios[0]?.id || '' : ''); if (!source().bags[S.diff] && !(scen()?.standalone?.[S.diff])) S.diff = Object.keys(scen()?.standalone || source().bags)[0] || 'standard'; applyScenarioValues(); }
    else if (d.scen !== undefined) { S.scenario = t.value; applyScenarioValues(); }
    else if (d.val) { S.values[d.val] = t.value === '' ? 0 : +t.value; }
    else if (d.redraw) { S.redraw[d.redraw] = t.checked; }
    else if (d.skill !== undefined) S.skill = +t.value;
    else if (d.tdiff !== undefined) S.difficulty = +t.value;
    else return;
    save(); render();
  });
  render();
}

export { parseEffect };

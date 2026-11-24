// "Chaos bag" tab: build the bag, draw tokens, and see the odds of passing a test.

const NUMS = ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8'];
const SYMBOLS = ['skull', 'cultist', 'tablet', 'elder_thing'];
const SPECIAL = ['auto_fail', 'elder_sign', 'bless', 'curse', 'frost'];
const ALL = [...NUMS, ...SYMBOLS, ...SPECIAL];
const LABEL = { skull: 'Skull', cultist: 'Cultist', tablet: 'Tablet', elder_thing: 'Elder Thing', auto_fail: 'Auto-fail', elder_sign: 'Elder Sign', bless: 'Bless', curse: 'Curse', frost: 'Frost' };
// Original token glyphs (drawn for this site, 32×32, in the token's ink colour).
const GLYPH = {
  skull: '<path d="M16 4c-6.2 0-10.5 4.4-10.5 10 0 3.6 1.7 6.1 4 7.5V26c0 1 .8 1.8 1.8 1.8h9.4c1 0 1.8-.8 1.8-1.8v-4.5c2.3-1.4 4-3.9 4-7.5C26.5 8.4 22.2 4 16 4z"/><g fill="var(--tok-bg,#1d2023)"><ellipse cx="11.6" cy="14.6" rx="2.8" ry="3.2"/><ellipse cx="20.4" cy="14.6" rx="2.8" ry="3.2"/><path d="M16 18.2l-1.7 3h3.4z"/><rect x="12.6" y="24" width="1.3" height="3.8"/><rect x="15.35" y="24" width="1.3" height="3.8"/><rect x="18.1" y="24" width="1.3" height="3.8"/></g>',
  cultist: '<path d="M16 3.5c-5 0-8.5 5.2-8.8 11.4L5.5 28.5h21L24.8 14.9C24.5 8.7 21 3.5 16 3.5z"/><path fill="var(--tok-bg,#1d2023)" d="M16 9c-3 0-5 3.2-5 7.2 0 2.7 1.3 5 2.8 6.3h4.4c1.5-1.3 2.8-3.6 2.8-6.3C21 12.2 19 9 16 9z"/><circle cx="14.2" cy="16.5" r="1" /><circle cx="17.8" cy="16.5" r="1"/>',
  tablet: '<path d="M9 4h14a2 2 0 0 1 2 2v20.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><g fill="none" stroke="var(--tok-bg,#1d2023)" stroke-width="1.6" stroke-linecap="round"><path d="M11 9.5h4M17.5 9.5H21M11 13.5h10M11 17.5h3.5M16.5 17.5H21M11 21.5h6"/><path d="M19 21l2 2.5" /></g>',
  elder_thing: '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 16c0-4 1-8 0-12"/><path d="M16 16c3.6-1.5 7.5-3 11-2"/><path d="M16 16c2.5 3 4.6 6.5 5 11"/><path d="M16 16c-2.5 3-4.6 6.5-5 11"/><path d="M16 16c-3.6-1.5-7.5-3-11-2"/></g><circle cx="16" cy="16" r="4.6"/><circle cx="16" cy="16" r="1.6" fill="var(--tok-bg,#1d2023)"/>',
  auto_fail: '<path d="M7.5 6.5l4 0 4.5 6 4.5-6h4l-6.4 9 6.9 10h-4.1L16 19.2l-4.9 6.3H7l6.9-10z"/><path fill="none" stroke="var(--tok-bg,#5a120c)" stroke-width="1" d="M16 3v4M16 25v4"/>',
  elder_sign: '<path d="M16 3.5l3 8.6 9 .2-7.2 5.5 2.6 8.7L16 21.3l-7.4 5.2 2.6-8.7L4 12.3l9-.2z"/><circle cx="16" cy="15.8" r="3" fill="var(--tok-bg,#0e4a3f)"/><circle cx="16" cy="15.8" r="1.2"/>',
  bless: '<circle cx="16" cy="16" r="5.5"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4M7.2 7.2l2.8 2.8M22 22l2.8 2.8M7.2 24.8l2.8-2.8M22 10l2.8-2.8"/></g>',
  curse: '<path d="M21.5 5.5A11 11 0 1 0 26.5 22 9 9 0 1 1 21.5 5.5z"/><path d="M12 25.5c0 1.6-1 2.8-1 2.8s-1-1.2-1-2.8a1 1 0 0 1 2 0z"/>',
  frost: '<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M16 3.5v25M5.2 9.8l21.6 12.4M5.2 22.2l21.6-12.4"/><path d="M12.8 5.8L16 8.6l3.2-2.8M12.8 26.2L16 23.4l3.2 2.8M5.4 14.3l3.9-.9-1.3-3.9M26.6 17.7l-3.9.9 1.3 3.9M8 22.4l1.3-3.9-3.9-.9M24 9.6l-1.3 3.9 3.9.9"/></g>',
};
// Token images as hosted on Steam's CDN by the SCED Tabletop Simulator mod (github.com/argonui/SCED).
// Loaded straight from there, like the card images from ArkhamDB; nothing is copied into this repo.
const STEAM = 'https://steamusercontent-a.akamaihd.net/ugc/';
const TOKEN_IMG = {
  '+1': '10065518989680601262/55C6E20197F82A335B9B949CC01FCF6E9DC9B2B6/',
  '0': '10467636488768711896/65D31C09954BC6DD95A3EDB44AFF7B5CAC5DDFBC/',
  '-1': '18141677772083355157/B6921FE2FF0BAD3A29117FFF917F1B214A0A1737/',
  '-2': '16300603643773411041/2639335E189779A56EBB1DBD5770B879A72549C5/',
  '-3': '12389435929210412458/FBA601FAAD79D9B70E4EB3E6F45A08E86DE1C09A/',
  '-4': '11693498521773237474/7ECFB6071A5FC5D9B2530631C1C9BB913450AD69/',
  '-5': '16829517245644419133/55CF59E1295D6CE0A2AAF69784BCE164D1D0F807/',
  '-6': '16991160142031023290/288C4B755FC36B49C0FC5E5DB5929D9720932601/',
  '-7': '18160465441183960058/EBE2A6876F2190F52BE318830A6A145AC6108D14/',
  '-8': '17945201728310792736/3B17446B285B165E095F899C97CAB0DBD9D22C4A/',
  skull: '15828862155539708736/BDAB049A331E3528626DA3B7CBA621F1846E472E/',
  cultist: '10819121326050938896/43990FCC095A8AE2C3398C7D67A6C068DA6A6749/',
  tablet: '17952552005967267216/05C897C573865E2513D8B08CD68D5ED5CC7E689C/',
  elder_thing: '12269151051478770224/9D3E87A4406D441F8BACEAAE05A4215D57D4A36C/',
  auto_fail: '15030955895089669191/BC72E714C4DF998F1D0F5ED56AF267EBF949C215/',
  elder_sign: '14299675228001607884/DC8691C239014FE7DDABB886BB1D383C05DC490F/',
  bless: '17626656568141106343/AF58317B4B90FDBB2859D667717956A24F838F9E/',
  curse: '16368291675628055072/CA7EF7D227D3BD3001A52D6D1EC40F631752270C/',
  frost: '17407496234279022797/27E998B2DCB82BF6F2B544FF7C1A831048BE68F8/',
};
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
  const norm = n => (n || '').toLowerCase().replace(/^return to /, '').replace(/,? part [ivx]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
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
  // Structured values (from the Arkham Cards data) for the current scenario and difficulty.
  S.inputs ||= {};
  function structured() {
    const sc = scen();
    if (!sc?.tokens) return null;
    const hard = S.diff === 'hard' || S.diff === 'expert';
    return (hard ? sc.tokens.hard : sc.tokens.standard) || null;
  }
  const inKey = k => `${scen()?.id}|${S.diff === 'hard' || S.diff === 'expert' ? 'h' : 's'}|${k}`;
  function computeStructured() {
    const list = structured();
    if (!list) return false;
    for (const t of list) {
      let v;
      if (t.type === 'counter') {
        const c = t.counter, x = S.inputs[inKey(t.token)] ?? c.min ?? 0;
        v = { modifier: (x + (c.adjustment || 0)) * (c.scale || 1) * (t.token === 'elder_sign' ? 1 : -1), reveal_another: c.reveal_another };
      } else if (t.type === 'condition') {
        const on = S.inputs[inKey(t.token)] || [];
        const i = t.condition.options.findIndex((o, j) => on[j]);
        v = i >= 0 ? t.condition.options[i].modified_value : t.condition.default_value;
      } else v = t.value;
      if (!v) continue;
      if (t.token === 'elder_sign') { S.values.elder_sign = v.modifier ?? S.values.elder_sign; continue; }
      if (!SYMBOLS.includes(t.token)) continue;
      S.values[t.token] = v.modifier ?? 0;
      S.redraw[t.token] = !!v.reveal_another;
    }
    return true;
  }
  function applyScenarioValues() {
    if (computeStructured()) return;
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
    const inner = sym ? `<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">${GLYPH[k]}</svg>` : `<b>${k.replace('-', '−')}</b>`;
    const img = TOKEN_IMG[k] ? `<img class="tok-img" src="${STEAM}${TOKEN_IMG[k]}" alt="" loading="lazy" decoding="async" onload="this.parentNode.classList.add('img-ok')" onerror="this.remove()">` : '';
    return `<span class="tok ${sym ? `tok-${k}` : 'tok-num'} ${big ? 'big' : ''}" role="img" aria-label="${esc(LABEL[k] || k)}" title="${esc(LABEL[k] || k)}">${inner}${img}</span>`;
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
      ${ask(k)}
    </div>`;
    const clean = t => esc((t || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[(\w+)\]/g, (m, w) => LABEL[w] || w));
    function ask(k) {
      const t = (structured() || []).find(x => x.token === k);
      if (!t) return '';
      if (t.type === 'counter') {
        const c = t.counter, x = S.inputs[inKey(k)] ?? c.min ?? 0;
        return `<label class="askx">${clean(c.prompt)}<span class="stepper"><button data-xdec="${k}" ${x <= (c.min ?? 0) ? 'disabled' : ''} aria-label="Less">−</button><span>${x}</span><button data-xinc="${k}" ${c.max != null && x >= c.max ? 'disabled' : ''} aria-label="More">+</button></span></label>`;
      }
      if (t.type === 'condition') {
        const on = S.inputs[inKey(k)] || [];
        return t.condition.options.map((o, j) => `<label class="inline chk askc"><input type="checkbox" data-cond="${k}|${j}" ${on[j] ? 'checked' : ''}> ${clean(o.prompt)}</label>`).join('');
      }
      return '';
    }
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
    const campScens = src.kind === 'side' ? [] : src.scenarios.filter(x => x.tokens || x.standalone || x.campaignNotes.length || effectsByName.has(norm(x.name)));
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
        <p class="sub" style="margin:4px 0 10px">${fx ? `${structured() ? 'Values worked out for' : 'Values filled in from'} ${esc(scen()?.name || '')} (${S.diff === 'hard' || S.diff === 'expert' ? 'Hard / Expert' : 'Easy / Standard'}). ${structured() ? 'Answer the questions under each token and the value updates.' : 'Where the card says -X, set X for the current situation.'}` : 'Pick a scenario above to fill these in from its reference card, or set them yourself.'}</p>
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
    else if (d.xinc || d.xdec) {
      const k = d.xinc || d.xdec, t = (structured() || []).find(x => x.token === k);
      const cur = S.inputs[inKey(k)] ?? t?.counter.min ?? 0;
      S.inputs[inKey(k)] = Math.max(t?.counter.min ?? 0, cur + (d.xinc ? 1 : -1));
      computeStructured();
    }
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
    else if (d.cond) { const [k, j] = d.cond.split('|'); const arr = [...(S.inputs[inKey(k)] || [])]; arr[+j] = t.checked; S.inputs[inKey(k)] = arr; computeStructured(); }
    else if (d.skill !== undefined) S.skill = +t.value;
    else if (d.tdiff !== undefined) S.difficulty = +t.value;
    else return;
    save(); render();
  });
  render();
}

export { parseEffect };

// "Build a deck": collection picker, investigator or role, then auto-build or a step-by-step walk-through.
import { Builder, STEPS, BUCKETS, REPRINTS, ownedInvestigators, roleFit, autoRole, playerCardCount, identity, buildApproaches } from './build.js';
import { choiceOptions, cardRoles, ROLES } from './analyze.js';
import { blendProfile, pressures, findings } from './campaign.js';
import { buildBrief, parseReply } from './claude.js';
import { askGemini } from './gemini.js';

const GRADE_TEXT = { strong: 'Strong', ok: 'OK', thin: 'Thin', missing: 'Missing' };
const FACTIONS = ['guardian', 'seeker', 'rogue', 'mystic', 'survivor', 'neutral'];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

const SPICE = [
  ['Proven', 'Strong, well-known cards'],
  ['Mixed', 'Some staples, some fresh ideas'],
  ['Off the beaten path', 'Skip the usual picks; find unusual combos'],
];

export function initBuilder(db, camps, ui) {
  const { cardImg, esc, openInCheckup, store } = ui;
  const root = document.querySelector('#view-build');
  const S = {
    owned: JSON.parse(store.get('owned') || '{}'),
    editing: false,
    who: store.get('who') || 'inv',
    invCode: store.get('inv') || '',
    role: store.get('brole') || 'clues',
    players: +(store.get('bplayers') || 2),
    choices: {},
    builder: null,
    step: 0,
    showAll: false,
    view: '',            // '', 'approaches', 'guide', 'result'
    campaign: store.get('campaign') || '',
    scenario: store.get('scenario') || '',
    spice: +(store.get('spice') || 1),
    seed: 1,
    approaches: [],
    sel: 0,
    claudeText: '',
    claudeMsg: '',
    geminiKey: store.get('geminiKey') || '',
    keyEdit: false,
    busy: false,
  };
  if (!Object.keys(S.owned).length) S.editing = true;
  const save = () => {
    store.set('owned', JSON.stringify(S.owned)); store.set('who', S.who); store.set('inv', S.invCode);
    store.set('brole', S.role); store.set('bplayers', String(S.players));
    store.set('campaign', S.campaign); store.set('scenario', S.scenario); store.set('spice', String(S.spice));
  };

  // ---------- What are you playing? ----------
  const campaignBy = Object.fromEntries(camps.campaigns.map(c => [c.code, c]));
  function playing() {
    const c = campaignBy[S.campaign];
    const sc = c?.scenarios.find(x => x.code === S.scenario) || null;
    const prof = c ? blendProfile(c, sc) : null;
    return { c, sc, prof, pr: prof ? pressures(prof, camps.average) : null, notes: prof ? findings(prof, camps.average) : [] };
  }
  function playingHtml() {
    const { c, notes } = playing();
    const groupsC = [
      ['Chapter Two', camps.campaigns.filter(x => x.chapter === 2 && x.group === 'campaign')],
      ['Chapter Two standalone scenarios', camps.campaigns.filter(x => x.chapter === 2 && x.group === 'standalone')],
      ['Campaigns', camps.campaigns.filter(x => x.chapter === 1 && x.group === 'campaign')],
      ['Return to…', camps.campaigns.filter(x => x.group === 'return')],
      ['Standalone scenarios', camps.campaigns.filter(x => x.chapter === 1 && x.group === 'standalone')],
    ].filter(([, l]) => l.length);
    return `<div class="who-row">
        <label>Campaign or scenario<select data-campaign>
          <option value="">Nothing specific (general deck)</option>
          ${groupsC.map(([g, l]) => `<optgroup label="${g}">${l.map(x => `<option value="${x.code}" ${x.code === S.campaign ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>
        ${c && c.scenarios.length > 1 ? `<label>Scenario<select data-scenario><option value="">Whole campaign</option>${c.scenarios.map(x => `<option value="${x.code}" ${x.code === S.scenario ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      ${c ? `<div class="findings"><p class="sub" style="margin:10px 0 4px">What this ${S.scenario ? 'scenario' : 'campaign'} throws at you, worked out from its encounter cards:</p>
        <ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}${c.note ? `<li>${esc(c.note)}</li>` : ''}</ul></div>` : '<p class="sub" style="margin:10px 0 0">Pick what you\'re playing and decks will be tuned to it. Leave it blank for an all-purpose deck.</p>'}`;
  }

  // ---------- Collection ----------
  const packs = db.packList;
  const packBy = Object.fromEntries(packs.map(p => [p.code, p]));
  const cycleName = Object.fromEntries(db.cycles.map(c => [c.code, c.name]));
  const CH1 = ['dwl', 'ptc', 'tfa', 'tcu', 'tde', 'tic', 'eoe', 'tsk', 'fhv', 'tdc'];
  const groups = [
    { chapter: 'Chapter Two (2026 onward)', items: [
      { title: 'Core Set (2026)', packs: ['core_2026'], copies: true },
      { title: 'Investigator Decks', cycle: 'investigator_decks_ch2' },
      { title: 'Small Campaign Expansions', cycle: 'small_campaign_expansions' },
      { title: 'Scenario Packs', cycle: 'scenario_packs_ch2' },
    ] },
    { chapter: 'Chapter One (2016–2025)', items: [
      { title: 'Core Sets', packs: ['core', 'rcore'], copies: true },
      ...CH1.map(c => ({ title: cycleName[c], cycle: c, split: true })),
      { title: 'Return to… boxes', cycle: 'return' },
      { title: 'Investigator Starter Decks', cycle: 'investigator' },
      { title: 'Standalone Scenarios', cycle: 'side_stories' },
      { title: 'Parallel Investigators', cycle: 'parallel' },
      { title: 'Novellas and Promos', cycle: 'promotional' },
    ] },
  ];
  const covered = new Set(groups.flatMap(g => g.items.flatMap(i => i.packs || packs.filter(p => p.cycle === i.cycle).map(p => p.code))));
  const extra = packs.filter(p => !covered.has(p.code)).map(p => p.code);
  if (extra.length) groups[0].items.push({ title: 'Newer releases', packs: extra });

  const isNewFormat = p => /(p|c)$/.test(p.code) && (REPRINTS[p.code] || /Expansion$/.test(p.name));
  const shortName = (p, item) => item.split && p.name.startsWith(item.title) ? p.name.slice(item.title.length).trim() || p.name : p.name;
  const packNote = code => {
    const n = playerCardCount(db, code);
    return n ? `${n} player cards` : 'scenarios only';
  };
  const packRow = (p, item) => `
    <label class="pk"><input type="checkbox" data-pack="${p.code}" ${S.owned[p.code] ? 'checked' : ''}>
      <span>${esc(shortName(p, item))}</span>
      ${item.copies && S.owned[p.code] ? `<select data-copies="${p.code}" aria-label="Copies of ${esc(p.name)}">${[1, 2, 3].map(n => `<option value="${n}" ${S.owned[p.code] === n ? 'selected' : ''}>×${n}</option>`).join('')}</select>` : ''}
      <span class="note">${packNote(p.code)}</span></label>`;

  function collectionHtml() {
    const ownedList = Object.keys(S.owned).filter(k => S.owned[k]);
    const invs = ownedInvestigators(db, S.owned);
    const summary = ownedList.length
      ? `You own ${ownedList.length} product${ownedList.length === 1 ? '' : 's'} with ${invs.length} investigator${invs.length === 1 ? '' : 's'}.`
      : 'Tick everything you own. Your picks are saved in this browser.';
    if (!S.editing) return `<div class="summary-line"><p style="margin:0">${summary}</p><button class="linkish" data-act="edit-coll">Edit collection</button></div>`;
    const body = groups.map(g => `
      <h3 class="coll-chapter">${g.chapter}</h3>
      ${g.items.map(item => {
        const list = (item.packs || packs.filter(p => p.cycle === item.cycle).map(p => p.code)).map(c => packBy[c]).filter(Boolean);
        if (!list.length) return '';
        const codes = list.map(p => p.code).join(',');
        let inner;
        if (item.split) {
          const fresh = list.filter(isNewFormat), orig = list.filter(p => !isNewFormat(p));
          inner = fresh.map(p => packRow(p, item)).join('') + (orig.length ? `
            <details class="orig" ${orig.some(p => S.owned[p.code]) ? 'open' : ''}><summary>Original release: deluxe box + ${orig.length - 1} mythos packs</summary>
              ${orig.map(p => packRow(p, item)).join('')}</details>` : '');
        } else inner = list.map(p => packRow(p, item)).join('');
        return `<div class="cycle"><h3>${esc(item.title)} <button class="ghost" data-all="${codes}">All</button></h3>${inner}</div>`;
      }).join('')}`).join('');
    return `<p style="margin:0">${summary} The 2026 Investigator Expansions count as owning their cycle's original packs.</p>
      <div class="coll-tools"><button class="ghost" data-act="all">Select everything</button><button class="ghost" data-act="none">Clear</button>
      ${ownedList.length ? '<button class="primary" data-act="done-coll">Done</button>' : ''}</div>
      <div class="coll-grid">${body}</div>`;
  }

  // ---------- Investigator / role ----------
  const fitFor = (i, role) => {
    const pr = playing().pr;
    return roleFit(i, role) + (pr ? ((i.w || 0) - 3) * pr.willpower * 4 + ((i.a || 0) - 3) * pr.agility * 4 : 0);
  };
  function currentInv(invs) {
    if (S.who === 'role') {
      const ranked = [...invs].sort((a, b) => fitFor(b, S.role) - fitFor(a, S.role)).slice(0, 8);
      if (!ranked.find(i => i.code === S.invCode)) S.invCode = ranked[0]?.code || '';
    } else if (!invs.find(i => i.code === S.invCode)) S.invCode = invs[0]?.code || '';
    return invs.find(i => i.code === S.invCode);
  }
  function whoHtml(invs) {
    if (!invs.length) return '<p class="empty">Pick your collection first. None of the products ticked include an investigator.</p>';
    const inv = currentInv(invs);
    const stats = i => `W${i.w} I${i.i} C${i.c} A${i.a}`;
    let pick;
    if (S.who === 'inv') {
      const byFac = FACTIONS.map(f => [f, invs.filter(i => i.fac === f)]).filter(([, l]) => l.length);
      pick = `<div class="who-row"><label>Investigator
        <select data-inv>${byFac.map(([f, l]) => `<optgroup label="${cap(f)}">${l.map(i => `<option value="${i.code}" ${i.code === S.invCode ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <p class="sub" style="margin:0 0 10px">${inv ? `${esc(cap(inv.fac))} · ${stats(inv)} · plays best as ${ROLES[autoRole(inv)].toLowerCase()}` : ''}</p></div>`;
    } else {
      const ranked = [...invs].sort((a, b) => fitFor(b, S.role) - fitFor(a, S.role)).slice(0, 8);
      pick = `<div class="seg" role="group" aria-label="Role">${Object.entries(ROLES).map(([k, v]) => `<button data-role="${k}" aria-pressed="${S.role === k}">${v}</button>`).join('')}</div>
        <p class="sub" style="margin:0">Best ${ROLES[S.role].toLowerCase()} investigators in your collection${S.campaign ? ' for this campaign' : ''}:</p>
        <div class="inv-pick">${ranked.map(i => `<button class="inv-opt" data-pick="${i.code}" aria-pressed="${i.code === S.invCode}">${cardImg(i)}<span><b>${esc(i.label)}</b><small>${cap(i.fac)} · ${stats(i)}</small></span></button>`).join('')}</div>`;
    }
    const choices = inv ? choiceOptions(inv) : [];
    for (const c of choices) if (!S.choices[c.key] || !c.values.some(v => v.value === S.choices[c.key])) S.choices[c.key] = c.values[0].value;
    const choiceHtml = choices.map(c => `<label>${esc(c.name)}<select data-choice="${esc(c.key)}">${c.values.map(v => `<option value="${esc(v.value)}" ${S.choices[c.key] === v.value ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>`).join('');
    return `<div class="seg" role="group" aria-label="Start from"><button data-who="inv" aria-pressed="${S.who === 'inv'}">An investigator</button><button data-who="role" aria-pressed="${S.who === 'role'}">A role</button></div>
      <div class="who">${pick}
        <div class="who-row">
          <label>Players<select data-players>${[1, 2, 3, 4].map(n => `<option value="${n}" ${S.players === n ? 'selected' : ''}>${n === 1 ? '1 (solo)' : n}</option>`).join('')}</select></label>
          ${S.who === 'inv' && inv ? `<label>Role<select data-irole><option value="auto">Auto (${ROLES[autoRole(inv)]})</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${S.irole === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
          ${choiceHtml}
        </div></div>`;
  }

  // ---------- Building ----------
  function newBuilder() {
    const invs = ownedInvestigators(db, S.owned);
    const inv = currentInv(invs);
    if (!inv) return null;
    const role = S.who === 'role' ? S.role : (S.irole || 'auto');
    return new Builder(db, baseOpts(inv, role));
  }
  function baseOpts(inv, role) {
    return { inv, owned: S.owned, role, players: S.players, choices: { ...S.choices }, pr: playing().pr, spice: S.spice, seed: S.seed };
  }
  function makeApproaches() {
    const invs = ownedInvestigators(db, S.owned);
    const inv = currentInv(invs);
    if (!inv) return;
    const role = S.who === 'role' ? S.role : (S.irole || 'auto');
    S.approaches = buildApproaches(db, baseOpts(inv, role), { count: 4, seed: S.seed });
    S.sel = 0;
    S.builder = S.approaches[0]?.builder || null;
  }
  function claudeApproaches(text) {
    const ideas = parseReply(text);
    const invs = ownedInvestigators(db, S.owned);
    const inv = currentInv(invs);
    const role = S.who === 'role' ? S.role : (S.irole || 'auto');
    const made = ideas.map((idea, i) => {
      const b = new Builder(db, { ...baseOpts(inv, role), seed: S.seed + 100 + i, keyNames: idea.key, avoidNames: idea.avoid });
      b.fill();
      return { key: 'claude' + i, name: idea.name, plan: idea.plan, why: idea.why, claude: true, missing: b.missingKeys, builder: b, report: b.report() };
    });
    S.approaches = [...S.approaches.filter(a => !a.claude), ...made];
    S.sel = S.approaches.length - made.length;
    S.builder = S.approaches[S.sel].builder;
    S.view = 'approaches';
  }

  const gradeList = r => `<div class="grades">${r.pillars.map(p => `<div><span>${esc(p.label)}</span><span class="chip ${p.grade}">${GRADE_TEXT[p.grade]}</span></div>`).join('')}</div>`;

  function stepFilter(step, b) {
    if (step.filter) return c => step.filter(c, b.role);
    if (step.bucket) {
      const keys = [].concat(step.bucket);
      return c => keys.some(k => BUCKETS[k].roles.some(r => cardRolesCache(c).has(r)));
    }
    return () => true;
  }
  const rolesMemo = new Map();
  const cardRolesCache = c => rolesMemo.get(c.code) || (rolesMemo.set(c.code, cardRoles(c)), rolesMemo.get(c.code));

  function candRow(p, b) {
    const room = b.size - b.counted;
    return `<div class="cand ${p.have ? 'in' : ''}">
      <span class="peek" data-code="${p.card.code}">${cardImg(p.card)}</span>
      <div><div class="nm">${esc(p.card.name)} <span class="sub" style="font-weight:400">· ${p.card.cost === undefined ? cap(p.card.type) : `${cap(p.card.type)}, cost ${p.card.cost === -2 ? 'X' : p.card.cost}`}</span></div>
        <div class="why">${esc(p.reasons.join(' · ') || 'Solid all-round card')}</div></div>
      <div class="stepper"><button data-dec="${identity(p.card)}" ${p.have ? '' : 'disabled'} aria-label="Remove one ${esc(p.card.name)}">−</button><span>${p.have}</span><button data-inc="${identity(p.card)}" ${p.have >= p.max || room <= 0 ? 'disabled' : ''} aria-label="Add one ${esc(p.card.name)}">+</button></div>
    </div>`;
  }

  function guideHtml(b) {
    const step = STEPS[S.step];
    const filter = stepFilter(step, b);
    const list = b.ranked(filter);
    const shown = S.showAll ? list.slice(0, 40) : list.slice(0, 12);
    const aim = step.aim ? Math.round(step.aim * b.size / 30) : step.bucket ? [].concat(step.bucket).reduce((s, k) => s + b.targets[k], 0) : b.size - b.counted;
    const inStep = [...b.picks.values()].filter(e => filter(e.card)).reduce((s, e) => s + e.count, 0);
    const r = b.report();
    const picks = [...b.picks.values()].sort((a, c) => a.card.name.localeCompare(c.card.name));
    return `<div class="guide">
      <div>
        <div class="progress">${STEPS.map((_, i) => `<i class="${i < S.step ? 'done' : i === S.step ? 'now' : ''}"></i>`).join('')}</div>
        <h3 style="font-size:26px">Step ${S.step + 1} of ${STEPS.length}: ${esc(step.title)}</h3>
        <p class="section-lede" style="margin-top:6px">${esc(step.blurb(b.role))} ${step.key !== 'finish' ? `For this deck, aim for about <b>${aim}</b>. You have <b>${inStep}</b>.` : ''}</p>
        ${S.msg ? `<p class="status err">${esc(S.msg)}</p>` : ''}
        ${shown.map(p => candRow(p, b)).join('') || '<p class="empty">Nothing in your collection fits this step. That\'s fine. Move on.</p>'}
        ${list.length > 12 ? `<button class="linkish" data-act="more">${S.showAll ? 'Show fewer' : `Show more (${Math.min(40, list.length) - 12} more)`}</button>` : ''}
        <div class="nav-row">
          ${S.step > 0 ? '<button class="ghost" data-act="back">Back</button>' : ''}
          ${S.step < STEPS.length - 1 ? '<button class="primary" data-act="next">Next step</button>' : `<button class="primary" data-act="finish" ${b.counted < b.size ? 'disabled' : ''}>Finish deck</button>`}
          <button class="ghost" data-act="autofill">Fill the rest for me</button>
        </div>
      </div>
      <aside class="panel guide-side">
        <div><span class="count-big">${b.counted}</span> / ${b.size} cards</div>
        <div class="meter"><i style="width:${Math.min(100, b.counted / b.size * 100)}%;background:var(--accent)"></i></div>
        ${gradeList(r)}
        <details ${innerWidth > 860 ? 'open' : ''}><summary class="sub">Your picks so far</summary>
          <div class="picks">${picks.map(e => `<span>${e.count}× ${esc(e.card.name)}</span>`).join('') || '<span class="empty">Nothing yet.</span>'}</div></details>
      </aside>
    </div>`;
  }

  function deckHtml(b, meta) {
    const r = meta?.report || b.report();
    const ranked = new Map(b.ranked().map(p => [identity(p.card), p]));
    const groupsOut = [['Assets', 'asset'], ['Events', 'event'], ['Skills', 'skill']].map(([t, type]) => {
      const list = [...b.picks.values()].filter(e => e.card.type === type).sort((a, c) => (a.card.cost ?? 0) - (c.card.cost ?? 0) || a.card.name.localeCompare(c.card.name));
      if (!list.length) return '';
      return `<div><h3>${t} <span class="sub">(${list.reduce((s, e) => s + e.count, 0)})</span></h3>${list.map(e => {
        const why = ranked.get(identity(e.card))?.reasons || [];
        return `<button class="row" data-code="${e.card.code}"><span class="qty">${e.count}×</span>${cardImg(e.card)}<span class="nm" style="border-left:3px solid var(--${e.card.fac || 'neutral'});padding-left:8px">${esc(e.card.name)}<br><small class="sub">${esc(why.slice(0, 2).join(' · '))}</small></span><span></span></button>`;
      }).join('')}</div>`;
    }).join('');
    const short = b.counted < b.size ? `<p class="status err">Only ${b.counted} of ${b.size} cards. Your collection doesn't have enough legal cards for ${esc(b.inv.name)}. Add more products, or fill the gap with whatever you like.</p>` : '';
    const missing = meta?.missing?.length ? `<p class="sub"><b>Not in your collection or not legal here, so left out:</b> ${esc(meta.missing.join(', '))}.</p>` : '';
    return `<div class="panel">
      <div class="summary-line"><div><h3 style="font-size:30px">${esc(meta?.name || `${b.inv.name}: ${ROLES[b.role].toLowerCase()}`)}</h3>
        ${meta?.plan ? `<p style="margin:6px 0 0">${esc(meta.plan)}</p>` : ''}
        ${meta?.why ? `<p class="sub" style="margin:4px 0 0">${esc(meta.why)}</p>` : ''}
        <p class="headline" style="margin-top:8px">${esc(r.headline)}</p></div></div>
      ${short}${missing}
      <div class="two-col" style="margin-top:10px">
        <div>${gradeList(r)}</div>
        <div><p class="sub" style="margin-top:0">${esc(b.inv.name)}, level 0 cards from your collection. Signature cards and a random basic weakness are included. Hover or tap a card to see it.</p>
          <div class="result-actions"><button class="primary" data-act="copy">Copy deck list</button><button class="ghost" data-act="checkup">Full checkup</button><button class="ghost" data-act="guided">Tweak it step by step</button></div>
          <p class="toast" id="b-toast" role="status"></p></div>
      </div>
      <div class="deck-groups" style="margin-top:14px">${groupsOut}</div>
    </div>`;
  }

  function claudeHtml() {
    const { c, sc, notes } = playing();
    const brief = S.builder ? buildBrief({ db, builder: S.builder, campaign: c, scenario: sc, findings: notes, spice: S.spice }) : '';
    const gem = S.geminiKey && !S.keyEdit
      ? `<div class="result-actions" style="margin-top:6px"><button class="primary" data-act="gemini" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Asking Gemini…' : 'Ask Gemini for 3 approaches'}</button><button class="ghost" data-act="key-edit">Change key</button></div>`
      : `<p style="margin:6px 0">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (sign in with Google, then <b>Create API key</b>) and paste it here. It's saved only in this browser and sent only to Google.</p>
        <div class="who-row"><label>Gemini API key<input id="gemini-key" type="password" autocomplete="off" placeholder="AIza…" value="${esc(S.geminiKey)}"></label>
        <button class="primary" data-act="key-save" style="min-height:44px">Save key</button>${S.geminiKey ? '<button class="ghost" data-act="key-forget" style="min-height:44px">Remove key</button>' : ''}</div>
        <p class="sub">Free keys have daily limits, and Google may use what you send on the free tier to improve its products. It's only deck info, but worth knowing.</p>`;
    return `<div class="panel claude">
      <h3 style="font-size:26px">Ask AI for more ideas</h3>
      <h4 class="ai-h">Gemini (free key, works on any device)</h4>
      ${gem}
      <h4 class="ai-h">Claude in Chrome (uses your Claude plan)</h4>
      <p style="margin:6px 0">On your Mac in Chrome, open the <b>Claude side panel</b> on this page and say: <i>“Read the brief on this page and add your approaches.”</i> Claude writes its ideas into the box below and clicks the button. The page turns each idea into a legal deck from your collection.</p>
      <details><summary class="sub">Brief for Claude (${S.builder ? S.builder.pool.length : 0} cards you own that ${esc(S.builder?.inv.name || 'this investigator')} can use)</summary>
        <pre id="claude-brief" class="brief">${esc(brief)}</pre></details>
      <div class="result-actions" style="margin-top:6px"><button class="ghost" data-act="copy-brief">Copy brief</button></div>
      <label class="field-label" for="claude-plan" style="margin-top:12px">Claude's approaches (Gemini's answer lands here too)</label>
      <textarea id="claude-plan" rows="6" placeholder='{"approaches":[{"name":"…","plan":"…","why":"…","key_cards":["…"],"avoid":[]}]}'>${esc(S.claudeText)}</textarea>
      <div class="result-actions"><button class="primary" id="claude-build" data-act="claude-build">Build Claude's approaches</button></div>
      ${S.claudeMsg ? `<p class="status ${S.claudeMsg.startsWith('Built') ? '' : 'err'}">${esc(S.claudeMsg)}</p>` : ''}
      <p class="sub">No Chrome handy? Copy the brief into the Claude app, then paste its reply into the box above.</p>
    </div>`;
  }

  function approachesHtml() {
    if (!S.approaches.length) return `<div class="panel"><p class="status err">Couldn't build any approaches from this collection. Try adding more products.</p></div>${claudeHtml()}`;
    const order = { missing: 0, thin: 1, ok: 2, strong: 3 };
    const tiles = S.approaches.map((a, i) => {
      const gs = a.report.pillars.map(p => p.grade);
      const weak = a.report.pillars.filter(p => order[p.grade] <= 1).map(p => p.label.toLowerCase());
      return `<button class="approach" data-sel="${i}" aria-pressed="${i === S.sel}">
        <span class="ap-top"><b>${esc(a.name)}</b>${a.claude ? `<span class="tag">${a.via || 'Claude'}</span>` : ''}</span>
        <span class="ap-plan">${esc(a.plan)}</span>
        <span class="ap-grades">${gs.map(g => `<i class="pip ${g}"></i>`).join('')}<small>${weak.length ? `Weak: ${esc(weak.join(', '))}` : 'No weak spots'}</small></span>
      </button>`;
    }).join('');
    const a = S.approaches[S.sel];
    return `<div class="panel"><div class="summary-line"><h3 style="font-size:26px">Approaches for ${esc(a.builder.inv.name)}</h3>
        <span class="result-actions" style="margin:0"><button class="ghost" data-act="reroll">New ideas</button><button class="ghost" data-act="restart">Start over</button></span></div>
      <p class="sub" style="margin:4px 0 12px">Different ways to play the same investigator${playing().c ? ` in ${esc(playing().c.name)}` : ''}. Each is a complete deck. Pick one to see it.</p>
      <div class="approaches">${tiles}</div></div>
      ${deckHtml(a.builder, a)}
      ${claudeHtml()}`;
  }

  // ---------- Render ----------
  function render() {
    const invs = ownedInvestigators(db, S.owned);
    const ready = Object.values(S.owned).some(Boolean) && invs.length;
    let out = '';
    if (S.view === 'approaches') out = approachesHtml();
    else if (S.view === 'result' && S.builder) out = deckHtml(S.builder) + claudeHtml();
    else if (S.view === 'guide' && S.builder) out = guideHtml(S.builder);
    root.innerHTML = `
      <section class="panel b-step"><h2><span class="num">1</span> Your collection</h2>${collectionHtml()}</section>
      ${!S.editing ? `<section class="panel b-step"><h2><span class="num">2</span> What are you playing?</h2>${playingHtml()}</section>
      <section class="panel b-step"><h2><span class="num">3</span> Who are you building for?</h2>${whoHtml(invs)}</section>
      <section class="panel b-step"><h2><span class="num">4</span> How do you want to build it?</h2>
        <p class="field-label" style="margin:0 0 6px">How far outside the box?</p>
        <div class="seg" role="group" aria-label="How far outside the box">${SPICE.map(([n, d], i) => `<button data-spice="${i}" aria-pressed="${S.spice === i}" title="${d}">${n}</button>`).join('')}</div>
        <p class="sub" style="margin:6px 0 14px">${SPICE[S.spice][1]}.</p>
        <div class="modes">
          <button class="mode" data-act="auto" ${ready ? '' : 'disabled'}><b>Show me approaches</b><span>Several complete decks, each built around a different plan, tuned to what you're playing. Ask Claude for more.</span></button>
          <button class="mode" data-act="walk" ${ready ? '' : 'disabled'}><b>Walk me through it</b><span>Pick cards step by step, from key cards to skills, with suggestions and a live checkup.</span></button>
        </div></section>` : ''}
      <section id="b-out" class="b-step" ${out ? '' : 'hidden'}>${out}</section>`;
  }

  function resetBuild() { S.builder = null; S.view = ''; S.step = 0; S.showAll = false; S.approaches = []; S.claudeMsg = ''; }
  const scrollToOut = () => document.querySelector('#b-out')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pack) { if (t.checked) S.owned[t.dataset.pack] = 1; else delete S.owned[t.dataset.pack]; }
    else if (t.dataset.copies) S.owned[t.dataset.copies] = +t.value;
    else if (t.dataset.campaign !== undefined) { S.campaign = t.value; S.scenario = ''; resetBuild(); }
    else if (t.dataset.scenario !== undefined) { S.scenario = t.value; resetBuild(); }
    else if (t.dataset.inv !== undefined) { S.invCode = t.value; S.choices = {}; resetBuild(); }
    else if (t.dataset.players !== undefined) { S.players = +t.value; resetBuild(); }
    else if (t.dataset.irole !== undefined) { S.irole = t.value === 'auto' ? '' : t.value; resetBuild(); }
    else if (t.dataset.choice) { S.choices[t.dataset.choice] = t.value; resetBuild(); }
    else return;
    save(); render();
  });
  root.addEventListener('input', e => { if (e.target.id === 'claude-plan') S.claudeText = e.target.value; });

  root.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    S.msg = '';
    if (d.all) { const codes = d.all.split(','); const allOn = codes.every(c => S.owned[c]); codes.forEach(c => { if (allOn) delete S.owned[c]; else S.owned[c] = S.owned[c] || 1; }); }
    else if (d.who) { S.who = d.who; resetBuild(); }
    else if (d.role) { S.role = d.role; S.invCode = ''; resetBuild(); }
    else if (d.pick) { S.invCode = d.pick; S.choices = {}; resetBuild(); }
    else if (d.spice) { S.spice = +d.spice; resetBuild(); }
    else if (d.sel) { S.sel = +d.sel; S.builder = S.approaches[S.sel].builder; render(); return; }
    else if (d.inc || d.dec) {
      const id = d.inc || d.dec;
      const p = S.builder.pool.find(x => identity(x.card) === id);
      const have = S.builder.picks.get(id)?.count || 0;
      if (!S.builder.set(p.card, have + (d.inc ? 1 : -1)) && d.inc) S.msg = `Can't add another ${p.card.name}: it would break one of ${S.builder.inv.name}'s deckbuilding limits.`;
    }
    else if (d.act === 'edit-coll') S.editing = true;
    else if (d.act === 'done-coll') { S.editing = false; resetBuild(); }
    else if (d.act === 'all') packs.forEach(p => S.owned[p.code] = S.owned[p.code] || 1);
    else if (d.act === 'none') S.owned = {};
    else if (d.act === 'auto' || d.act === 'reroll') {
      if (d.act === 'reroll') S.seed++;
      t.disabled = true; t.querySelector('span') && (t.querySelector('span').textContent = 'Building…');
      await new Promise(r => setTimeout(r, 30));
      makeApproaches(); S.view = 'approaches'; save(); render(); scrollToOut(); return;
    }
    else if (d.act === 'walk') { S.builder = newBuilder(); S.view = 'guide'; S.step = 0; save(); render(); scrollToOut(); return; }
    else if (d.act === 'next') { S.step++; S.showAll = false; render(); scrollToOut(); return; }
    else if (d.act === 'back') { S.step--; S.showAll = false; render(); scrollToOut(); return; }
    else if (d.act === 'more') S.showAll = !S.showAll;
    else if (d.act === 'autofill') { S.builder.fill(); S.view = 'result'; render(); scrollToOut(); return; }
    else if (d.act === 'finish') { S.view = 'result'; render(); scrollToOut(); return; }
    else if (d.act === 'guided') { S.view = 'guide'; S.step = STEPS.length - 1; render(); scrollToOut(); return; }
    else if (d.act === 'restart') { resetBuild(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    else if (d.act === 'copy' || d.act === 'copy-brief') {
      const text = d.act === 'copy' ? S.builder.text() : document.querySelector('#claude-brief').textContent;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall through */ }
      const toast = document.querySelector('#b-toast');
      const msg = ok ? (d.act === 'copy' ? 'Copied. Paste it anywhere, including the Check a deck tab.' : 'Brief copied. Paste it into Claude.') : 'Your browser blocked copying.';
      if (d.act === 'copy' && toast) toast.textContent = msg; else { S.claudeMsg = msg; render(); }
      return;
    }
    else if (d.act === 'key-save') { S.geminiKey = (document.querySelector('#gemini-key')?.value || '').trim(); S.keyEdit = false; store.set('geminiKey', S.geminiKey); S.claudeMsg = S.geminiKey ? 'Key saved in this browser.' : ''; }
    else if (d.act === 'key-edit') S.keyEdit = true;
    else if (d.act === 'key-forget') { S.geminiKey = ''; S.keyEdit = false; store.set('geminiKey', ''); }
    else if (d.act === 'gemini') {
      const { c, sc, notes } = playing();
      const brief = buildBrief({ db, builder: S.builder, campaign: c, scenario: sc, findings: notes, spice: S.spice });
      S.busy = true; S.claudeMsg = ''; render();
      try {
        const { text, model } = await askGemini(S.geminiKey, brief);
        S.claudeText = text;
        claudeApproaches(text);
        S.approaches.forEach(a => { if (a.claude && !a.via) a.via = 'Gemini'; });
        S.claudeMsg = `Built ${S.approaches.filter(a => a.claude).length} approaches from Gemini's ideas (${model}). They're marked above.`;
      } catch (err) {
        S.claudeMsg = err.code === 'bad-key' ? 'Google rejected that key. Check it was copied fully, or create a new one.'
          : err.code === 'limit' ? "You've hit the free key's limit for now. Try again in a minute, or tomorrow if it's the daily limit."
          : err.message === 'no-json' || err.message === 'no-approaches' || err instanceof SyntaxError ? "Gemini's answer wasn't in the expected format. Try again." 
          : "Couldn't reach Gemini. Check your connection and try again.";
      }
      S.busy = false; render(); if (S.claudeMsg.startsWith('Built')) scrollToOut(); return;
    }
    else if (d.act === 'claude-build') {
      try {
        if (!S.approaches.length) makeApproaches();
        claudeApproaches(S.claudeText);
        S.approaches.forEach(a => { if (a.claude && !a.via) a.via = 'Claude'; });
        S.claudeMsg = `Built ${S.approaches.filter(a => a.claude).length} approaches from the AI's ideas. They're marked above.`;
      } catch (err) {
        S.claudeMsg = "Couldn't read that. Make sure it's the JSON reply from Claude: it starts with { and contains \"approaches\".";
      }
      render(); if (S.claudeMsg.startsWith('Built')) scrollToOut(); return;
    }
    else if (d.act === 'checkup') { openInCheckup(S.builder.text(), S.builder.role, S.builder.players); return; }
    else return;
    save(); render();
  });

  render();
}

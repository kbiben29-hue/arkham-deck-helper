import { makeDb, parseAny, parseJson, parseLink, fetchArkhamDb } from './parse.js';
import { analyze, ROLES } from './analyze.js';
import { SAMPLE_DECK } from './sample.js';
import { initBuilder } from './builder-ui.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem('deckcheckup.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('deckcheckup.' + k, v); } catch { /* ignore */ } },
};

let db = null;
let lastDeck = null;

const GRADE_TEXT = { strong: 'Strong', ok: 'OK', thin: 'Thin', missing: 'Missing' };
const ROLE_TAGS = { clue: 'Clues', fight: 'Fight', evade: 'Evade', econ: 'Money', draw: 'Draw', heal: 'Heal', soak: 'Soak', cancel: 'Cancel' };
const ICON_WORDS = {
  willpower: 'Willpower', intellect: 'Intellect', combat: 'Combat', agility: 'Agility', wild: 'Wild',
  action: 'Action', reaction: 'Reaction', free: 'Free', fast: 'Fast', skull: 'Skull', cultist: 'Cultist',
  tablet: 'Tablet', elder_thing: 'Elder Thing', elder_sign: 'Elder Sign', auto_fail: 'Auto-fail', bless: 'Bless', curse: 'Curse',
  frost: 'Frost', per_investigator: 'per investigator', guardian: 'Guardian', seeker: 'Seeker', rogue: 'Rogue', mystic: 'Mystic', survivor: 'Survivor',
};

// --- Card images ----------------------------------------------------------
const imgSrc = code => `https://arkhamdb.com/bundles/cards/${code}.png`;
function cardImg(card, cls = '') {
  const alt = card.dup ? ` data-alt="${card.dup}"` : '';
  return `<img class="${cls}" loading="lazy" alt="" src="${imgSrc(card.code)}" data-code="${card.code}"${alt} data-try="0">`;
}
// Try .png, then .jpg, then the original printing; then show a coloured block.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.code) return;
  const step = +img.dataset.try;
  img.dataset.try = step + 1;
  const code = img.dataset.code, alt = img.dataset.alt;
  if (step === 0) img.src = `https://arkhamdb.com/bundles/cards/${code}.jpg`;
  else if (step === 1 && alt) img.src = imgSrc(alt);
  else if (step <= 2 && alt) img.src = `https://arkhamdb.com/bundles/cards/${alt}.jpg`;
  else {
    const card = db?.byCode.get(code);
    const span = document.createElement('span');
    span.className = img.className + ' dot';
    span.style.background = `var(--${card?.fac || 'neutral'})`;
    const fb = img.parentElement?.querySelector('.fallback');
    if (fb) { fb.hidden = false; span.style.opacity = '.35'; span.style.position = 'absolute'; span.style.inset = '0'; }
    img.replaceWith(span);
  }
}, true);

const facColor = f => `var(--${f || 'neutral'})`;
const xpDots = xp => xp ? '•'.repeat(Math.min(xp, 5)) : '';
const pct = x => `${Math.round(x * 100)}%`;
const cardText = t => esc((t || '').replace(/<\/?b>/g, '').replace(/<\/?i>/g, ''))
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\[(\w+)\]/g, (m, k) => ICON_WORDS[k] ? `<span class="icon">${ICON_WORDS[k]}</span>` : m);

// --- Rendering ------------------------------------------------------------
function render(deck, opts) {
  const r = analyze(deck, opts);
  const out = $('#results');
  const inv = r.inv;
  const errors = r.legality.filter(l => l.level === 'error');
  const roleLabel = `${ROLES[r.role]}${opts.role === 'auto' ? ' (auto)' : ''}`;

  const invBlock = inv ? `
    <div class="inv-card">${cardImg(inv)}<span class="fallback" hidden>${esc(inv.name)}</span></div>` :
    `<div class="inv-card"><span class="fallback">No investigator found</span></div>`;

  const fix = r.fixFirst.length || errors.length ? `
    <ul class="fix-list">
      ${errors.length ? `<li><span class="chip missing">Rules</span><span>${errors.length} deckbuilding problem${errors.length > 1 ? 's' : ''}. See the rules check below.</span></li>` : ''}
      ${r.fixFirst.map(p => `<li><span class="chip ${p.grade}">${GRADE_TEXT[p.grade]}</span><span><b>${esc(p.label)}.</b> ${esc(p.note)}</span></li>`).join('')}
    </ul>` : `<p>No glaring gaps. Every part of the deck has at least reasonable coverage.</p>`;

  const stats = inv ? `
    <div class="stats">
      ${r.skills.map(s => `<div class="stat"><b>${s.base}</b><span>${s.name}</span></div>`).join('')}
      <div class="stat"><b>${inv.health ?? '–'}</b><span>Health</span></div>
      <div class="stat"><b>${inv.sanity ?? '–'}</b><span>Sanity</span></div>
    </div>` : '';

  const pillars = r.pillars.map(p => {
    const max = Math.max(p.target * 2, p.count, 1);
    return `
    <article class="pillar">
      <div class="pillar-head"><h3>${esc(p.label)}</h3><span class="chip ${p.grade}">${GRADE_TEXT[p.grade]}</span></div>
      <div class="meter" aria-hidden="true"><i style="width:${Math.min(100, p.count / max * 100)}%;background:var(--${p.grade})"></i><span class="mark" style="left:${p.target / max * 100}%"></span></div>
      <div class="meter-label"><span>${p.count} card${p.count === 1 ? '' : 's'}</span><span>aim for ${p.target}+</span></div>
      <p>${esc(p.note)}</p>
      ${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}
      ${p.count ? `<div class="odds"><span>In opening hand: <b>${pct(p.odds.opening)}</b></span><span>By round 3: <b>${pct(p.odds.round3)}</b></span></div>` : ''}
      ${p.cards.length ? `<button class="show-cards" aria-expanded="false">Show the cards</button>
      <div class="mini-list" hidden>${p.cards.map(code => { const c = db.byCode.get(code); return `<button class="mini" data-code="${code}">${cardImg(c)}${esc(c.name)}${c.xp ? ` <span class="xp">${xpDots(c.xp)}</span>` : ''}</button>`; }).join('')}</div>` : ''}
    </article>`;
  }).join('');

  const maxIcons = Math.max(...r.skills.map(s => s.icons), 1);
  const skills = `
    <div class="skill-rows">
      ${r.skills.map(s => `
        <div class="skill-row"><span>${s.name}</span>
          <span class="pips" title="Base ${s.base}">${Array.from({ length: 6 }, (_, i) => `<i class="${i < s.base ? 'on' : ''}"></i>`).join('')}</span>
          <small>${s.icons} icon${s.icons === 1 ? '' : 's'} · ${s.boosts} boost${s.boosts === 1 ? '' : 's'}</small></div>`).join('')}
    </div>
    <p class="sub" style="margin-top:10px">Plus ${r.skills.wild} wild icon${r.skills.wild === 1 ? '' : 's'}. Icons are what you can commit to tests; boosts are assets that raise the skill.</p>
    ${weakestNote(r)}`;

  const curveMax = Math.max(...r.curve, 1);
  const curveLabels = ['0', '1', '2', '3', '4', '5', '6+'];
  const curve = `
    <div class="curve" role="img" aria-label="Cost curve">
      ${r.curve.map((n, i) => `<div><span class="n">${n || ''}</span><span class="bar" style="height:${n / curveMax * 100}%"></span><span class="c">${curveLabels[i]}</span></div>`).join('')}
      <div><span class="n">${r.xCost || ''}</span><span class="bar" style="height:${r.xCost / curveMax * 100}%;opacity:.5"></span><span class="c">X</span></div>
    </div>
    <p class="sub" style="margin-top:8px">Assets and events average <b>${r.avgCost.toFixed(1)}</b> resources. You start with 5 and gain 1 a round.</p>`;

  const slots = Object.entries(r.slots).filter(([, s]) => s.cards).map(([name, s]) => {
    const per = s.cards / s.cap;
    const g = per >= 3.5 ? 'missing' : per >= 2.5 ? 'thin' : 'strong';
    return `<div class="slot-row"><span>${name}</span><span class="meter"><i style="width:${Math.min(100, per / 4 * 100)}%;background:var(--${g})"></i></span><span>${s.cards} for ${s.cap}</span></div>`;
  }).join('') || '<p class="empty">No slotted assets.</p>';

  const rules = r.legality.length
    ? r.legality.map(l => `<li class="${l.level}">${esc(l.text)}</li>`).join('')
    : `<li class="good">Deck size, copies and card choices all follow ${esc(inv?.name || 'the investigator')}'s rules.</li>`;

  const groups = groupDeck(deck, r);
  const deckList = groups.map(([title, list]) => `
    <div><h3>${title} <span class="sub">(${list.reduce((s, e) => s + e.count, 0)})</span></h3>
      ${list.map(e => `<button class="row" data-code="${e.card.code}">
        <span class="qty">${e.count}×</span>${cardImg(e.card)}
        <span class="nm" style="border-left:3px solid ${facColor(e.card.fac)};padding-left:8px">${esc(e.card.name)} <span class="xp">${xpDots(e.card.xp)}</span></span>
        <span class="tags">${[...(e.roles || [])].filter(t => ROLE_TAGS[t]).slice(0, 3).map(t => `<span class="tag">${ROLE_TAGS[t]}</span>`).join('')}</span>
      </button>`).join('')}
    </div>`).join('');

  const unknown = deck.unknown.length ? `
    <section class="panel unknown"><h2 class="section-title">Lines I couldn't match</h2>
      <p class="section-lede">These were skipped. Check the spelling, or add the level in brackets, like <code>(2)</code>.</p>
      <ul>${deck.unknown.map(u => `<li>${esc(u)}</li>`).join('')}</ul></section>` : '';

  out.innerHTML = `
    <section class="panel verdict">
      ${invBlock}
      <div>
        ${inv ? `<div class="fac-bar" style="background:${facColor(inv.fac)}"></div><h2 class="inv-name">${esc(inv.name)}</h2><p class="inv-sub">${esc(inv.sub || '')}</p>${stats}` : ''}
        <p class="headline">${esc(r.headline)}</p>
        <ul class="facts">
          <li>${r.deckSize}/${r.sizeReq} cards</li><li>${r.xp} XP</li><li>${esc(roleLabel)}</li><li>${r.players} player${r.players > 1 ? 's' : ''}</li>
        </ul>
        ${fix}
      </div>
    </section>
    ${unknown}
    <section>
      <h2 class="section-title">The checkup</h2>
      <p class="section-lede">Each part of the deck graded for ${/^[aeiou]/i.test(ROLES[r.role]) ? 'an' : 'a'} ${esc(ROLES[r.role].toLowerCase())} in a ${r.players === 1 ? 'solo' : r.players + '-player'} game. Odds count the copies in your ${r.drawSize}-card draw deck.</p>
      <div class="pillars">${pillars}</div>
    </section>
    <div class="two-col">
      <section class="panel"><h2 class="section-title">Skill tests</h2>${skills}</section>
      <section class="panel"><h2 class="section-title">Cost curve</h2>${curve}</section>
      <section class="panel"><h2 class="section-title">Slots</h2><p class="section-lede">Slotted assets compared with the slots you have.</p><div class="slot-rows">${slots}</div></section>
      <section class="panel"><h2 class="section-title">Rules check</h2><ul class="rules">${rules}</ul></section>
    </div>
    <section class="panel"><h2 class="section-title">The deck</h2><p class="section-lede">Hover or tap a card to see it.</p><div class="deck-groups">${deckList}</div></section>`;
  out.hidden = false;
  return r;
}

function weakestNote(r) {
  const tests = r.skills.filter(s => s.key === 'w' || s.key === 'a');
  const weak = tests.filter(s => s.base <= 2 && s.boosts === 0);
  if (!weak.length) return '';
  return `<p class="sub"><b>Watch out:</b> ${weak.map(s => `${s.name.toLowerCase()} ${s.base}`).join(' and ')} with no boosts. Treacheries ${weak.some(s => s.key === 'a') ? 'and enemies that test agility ' : ''}will often get through.</p>`;
}

function groupDeck(deck, r) {
  const roleBy = new Map(r.entries.map(e => [e.card.code, e.roles]));
  const all = deck.entries.map(e => ({ ...e, roles: roleBy.get(e.card.code) }));
  const req = new Set((r.inv?.req || '').split(',').filter(p => p.trim().startsWith('card:')).flatMap(p => p.trim().slice(5).split(':')));
  const isSig = e => req.has(e.card.code) || req.has(e.card.dup) || e.card.restrictions;
  const sorted = list => list.sort((a, b) => (a.card.cost ?? 99) - (b.card.cost ?? 99) || a.card.name.localeCompare(b.card.name));
  const g = [
    ['Assets', all.filter(e => e.card.type === 'asset' && !isSig(e) && !e.card.subtype)],
    ['Events', all.filter(e => e.card.type === 'event' && !isSig(e) && !e.card.subtype)],
    ['Skills', all.filter(e => e.card.type === 'skill' && !isSig(e) && !e.card.subtype)],
    ['Signature cards', all.filter(e => isSig(e) && !e.card.subtype)],
    ['Weaknesses', all.filter(e => e.card.subtype)],
  ];
  return g.filter(([, l]) => l.length).map(([t, l]) => [t, sorted(l)]);
}

// --- Card preview ----------------------------------------------------------
const preview = $('#preview');
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
function showPreview(code, x, y) {
  const card = db.byCode.get(code);
  if (!card) return;
  if (preview.dataset.code !== code) { preview.innerHTML = cardImg(card); preview.dataset.code = code; }
  const w = card.type === 'investigator' ? 360 : 260;
  preview.style.width = w + 'px';
  const left = x + 24 + w > innerWidth ? x - w - 24 : x + 24;
  const top = Math.max(8, Math.min(y - 120, innerHeight - (card.type === 'investigator' ? 270 : 370)));
  preview.style.left = left + 'px'; preview.style.top = top + 'px';
  preview.classList.add('show');
}
document.addEventListener('mousemove', e => {
  if (!canHover || !db) return;
  const el = e.target.closest('[data-code].row, [data-code].mini, [data-code].peek, [data-code].inv-opt');
  if (el) showPreview(el.dataset.code, e.clientX, e.clientY); else preview.classList.remove('show');
});

const dialog = $('#card-dialog');
function openCard(code) {
  const c = db.byCode.get(code);
  if (!c) return;
  const facs = [c.fac, c.fac2, c.fac3].filter(Boolean).map(f => f[0].toUpperCase() + f.slice(1)).join(' / ');
  const bits = [facs, c.type[0].toUpperCase() + c.type.slice(1), c.cost !== undefined ? `Cost ${c.cost === -2 ? 'X' : c.cost}` : '', c.xp ? `Level ${c.xp}` : '', c.slot || '', db.packs[c.pack] || ''].filter(Boolean);
  const icons = ['w', 'i', 'c', 'a', 'x'].filter(k => c[k] && c.type !== 'investigator').map(k => `${c[k]}× ${['Willpower', 'Intellect', 'Combat', 'Agility', 'Wild'][['w', 'i', 'c', 'a', 'x'].indexOf(k)]}`);
  dialog.innerHTML = `<div class="dlg">
    <div>${cardImg(c)}</div>
    <div><h3>${esc(c.name)}</h3>${c.sub ? `<p class="inv-sub">${esc(c.sub)}</p>` : ''}
      <p class="meta">${esc(bits.join(' · '))}${c.traits ? `<br><i>${esc(c.traits)}</i>` : ''}${icons.length ? `<br>Icons: ${icons.join(', ')}` : ''}</p>
      <div class="text">${cardText(c.text)}</div>
    </div>
    <button class="close" aria-label="Close">×</button></div>`;
  dialog.showModal();
}
dialog.addEventListener('click', e => { if (e.target === dialog || e.target.closest('.close')) dialog.close(); });

document.addEventListener('click', e => {
  if (!db) return;
  const toggle = e.target.closest('.show-cards');
  if (toggle) {
    const list = toggle.nextElementSibling;
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
    toggle.textContent = list.hidden ? 'Show the cards' : 'Hide the cards';
    return;
  }
  const c = e.target.closest('[data-code].row, [data-code].mini, [data-code].peek');
  if (c) { preview.classList.remove('show'); openCard(c.dataset.code); }
});

// --- Input handling --------------------------------------------------------
const status = (msg, err = false) => { const s = $('#status'); s.textContent = msg; s.classList.toggle('err', err); };
const opts = () => ({ role: $('#role').value, players: +$('#players').value });

function setTab(which) {
  for (const t of ['paste', 'link']) {
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === which));
    $(`#pane-${t}`).hidden = t !== which;
  }
  store.set('tab', which);
}
$('#tab-paste').addEventListener('click', () => setTab('paste'));
$('#tab-link').addEventListener('click', () => setTab('link'));

async function check() {
  if (!db) return;
  const linkMode = $('#tab-link').getAttribute('aria-selected') === 'true';
  let deck;
  if (linkMode) {
    const link = parseLink($('#deck-link').value);
    if (!link) return status("That doesn't look like an ArkhamDB deck link.", true);
    status('Fetching the deck from ArkhamDB…');
    try {
      deck = parseJson(db, await fetchArkhamDb(link));
    } catch (err) {
      const msg = err.message === 'not-found' || err.message === 'private'
        ? "ArkhamDB wouldn't share that deck. It may be private. Use “Copy as text” on ArkhamDB and paste it in the other tab."
        : "Couldn't reach ArkhamDB from here. Use “Copy as text” on ArkhamDB and paste it in the other tab.";
      return status(msg, true);
    }
    store.set('link', $('#deck-link').value);
  } else {
    const text = $('#deck-text').value;
    if (!text.trim()) return status('Paste a deck list first.', true);
    deck = parseAny(db, text);
    store.set('text', text);
  }
  deck.lookup = code => db.byCode.get(code);
  if (!deck.entries.length) return status("I couldn't find any cards in that. Check the format and try again.", true);
  lastDeck = deck;
  render(deck, opts());
  status(`${deck.name ? `“${deck.name}”: c` : 'C'}hecked ${deck.entries.reduce((s, e) => s + e.count, 0)} cards${deck.investigator ? '' : '. No investigator found, so deckbuilding rules were skipped'}.`);
  if (innerWidth < 900) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#check').addEventListener('click', check);
$('#sample').addEventListener('click', () => { setTab('paste'); $('#deck-text').value = SAMPLE_DECK; check(); });
for (const id of ['#role', '#players']) $(id).addEventListener('change', () => {
  store.set(id.slice(1), $(id).value);
  if (lastDeck) render(lastDeck, opts());
});
$('#deck-text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) check(); });
$('#deck-link').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });

// --- Views ----------------------------------------------------------------
function showView() {
  const v = location.hash === '#check' ? 'check' : 'build';
  $('#view-check').hidden = v !== 'check';
  $('#view-build').hidden = v !== 'build';
  $('#nav-check').toggleAttribute('aria-current', v === 'check');
  $('#nav-build').toggleAttribute('aria-current', v === 'build');
  if (v === 'check') $('#nav-check').setAttribute('aria-current', 'page'); else $('#nav-build').setAttribute('aria-current', 'page');
  preview.classList.remove('show');
}
addEventListener('hashchange', showView);
showView();

function openInCheckup(text, role, players) {
  setTab('paste');
  $('#deck-text').value = text;
  $('#role').value = role; $('#players').value = String(players);
  location.hash = '#check';
  check();
  window.scrollTo({ top: 0 });
}

// --- New version check ------------------------------------------------------
// GitHub Pages caches files for a few minutes. Check quietly for a newer version and offer a one-tap reload.
let loadedVersion = window.APP_VERSION || null;
async function checkVersion() {
  try {
    const v = (await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json()).version;
    if (!loadedVersion) loadedVersion = v;
    else if (v !== loadedVersion && !document.querySelector('#update-bar')) {
      const bar = document.createElement('div');
      bar.id = 'update-bar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>A new version of Deck Helper is ready.</span><button class="primary">Update now</button>';
      bar.querySelector('button').addEventListener('click', () => location.reload());
      document.body.append(bar);
    }
  } catch { /* offline or local file: ignore */ }
}
checkVersion();
setInterval(checkVersion, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

// --- Start ----------------------------------------------------------------
(async () => {
  $('#deck-text').value = store.get('text') || SAMPLE_DECK;
  $('#deck-link').value = store.get('link') || '';
  if (store.get('role')) $('#role').value = store.get('role');
  if (store.get('players')) $('#players').value = store.get('players');
  if (store.get('tab') === 'link') setTab('link');
  status('Loading card data…');
  try {
    const res = await fetch(`data/cards.json?v=${window.APP_VERSION || ''}`);
    db = makeDb(await res.json());
    status('');
    if (store.get('tab') !== 'link') check();
    const camps = await (await fetch(`data/campaigns.json?v=${window.APP_VERSION || ''}`)).json();
    initBuilder(db, camps, { cardImg, esc, store, openInCheckup });
  } catch {
    status('Card data failed to load. Try refreshing the page.', true);
  }
})();

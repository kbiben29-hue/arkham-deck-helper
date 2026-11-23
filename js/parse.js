// Reads a deck from pasted text, ArkhamDB JSON, or an ArkhamDB link.

const norm = s => (s || '').toLowerCase()
  .replace(/[’‘`]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^a-z0-9'.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function makeDb(data) {
  const byCode = new Map(data.cards.map(c => [c.code, c]));
  const byName = new Map();
  for (const c of data.cards) {
    for (const key of [norm(c.name), c.sub ? norm(`${c.name} ${c.sub}`) : null].filter(Boolean)) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(c);
    }
  }
  const packByName = new Map(Object.entries(data.packs).map(([code, name]) => [norm(name), code]));
  return { byCode, byName, packs: data.packs, packByName, cards: data.cards };
}

// Prefer the first printing that isn't a reprint.
const pick = list => list.find(c => !c.dup) || list[0];

export function resolveName(db, rawName, { xp, pack } = {}) {
  let list = db.byName.get(norm(rawName));
  if (!list) {
    // "Name: Subname" or trailing punctuation
    const alt = norm(rawName.replace(/[:]/g, ' '));
    list = db.byName.get(alt);
  }
  if (!list) return null;
  let cands = list;
  if (xp !== undefined) {
    const f = cands.filter(c => (c.xp ?? 0) === xp);
    if (f.length) cands = f;
  } else {
    const zero = cands.filter(c => (c.xp ?? 0) === 0);
    if (zero.length) cands = zero;
  }
  if (pack) {
    const f = cands.filter(c => c.pack === pack);
    if (f.length) cands = f;
  }
  return pick(cands);
}

// Lines like "2x Machete (Core Set)", "1 Lightning Gun (5)", "Shrivelling •••", "2x .45 Automatic [2]"
export function parseText(db, text) {
  const entries = new Map();
  const unknown = [];
  let investigator = null;
  let randomWeakness = false;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let line of lines) {
    line = line.replace(/^[-*•]\s*/, '').replace(/^#+\s*/, '');
    const looksLikeHeader = !/^\d/.test(line) && /^(assets?|events?|skills?|treacher(y|ies)|enemies|weakness(es)?|permanents?|signatures?|hand|arcane|accessory|body|ally|allies|tarot|head|other|investigator|deck|side ?deck|packs?|total|xp|experience|version|taboo|cards?|deckbuilding|options|cost|faction|guardian|seeker|rogue|mystic|survivor|neutral|-{2,}|={2,})\b/i.test(line);
    const m = line.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
    let count = 1, rest = line;
    if (m) { count = +m[1]; rest = m[2]; }
    let xp, pack;
    // trailing "(Pack name)" or "[Pack name]"
    for (let i = 0; i < 3; i++) {
      const t = rest.match(/\s*[(\[]([^)\]]+)[)\]]\s*$/);
      if (!t) break;
      const inner = t[1].trim();
      if (/^\d$/.test(inner)) xp = +inner;
      else if (db.packByName.has(norm(inner))) pack = db.packByName.get(norm(inner));
      else if (/^(xp|level)\s*\d$/i.test(inner)) xp = +inner.replace(/\D/g, '');
      else break;
      rest = rest.slice(0, t.index);
    }
    const dots = rest.match(/\s*([•●]+)\s*$/);
    if (dots) { xp = dots[1].length; rest = rest.slice(0, dots.index); }
    rest = rest.replace(/^investigator:\s*/i, '').trim();
    if (/^random basic weakness$/i.test(rest)) { randomWeakness = true; continue; }
    const card = resolveName(db, rest, { xp, pack });
    if (!card) { if (!looksLikeHeader && !/^https?:/i.test(line)) unknown.push(line); continue; }
    if (card.type === 'investigator') { if (!investigator) investigator = card; continue; }
    const prev = entries.get(card.code);
    entries.set(card.code, { card, count: (prev?.count || 0) + count });
  }
  return { investigator, entries: [...entries.values()], unknown, randomWeakness };
}

// ArkhamDB deck JSON: { investigator_code, slots: { code: count } }
export function parseJson(db, obj) {
  const unknown = [];
  const investigator = db.byCode.get(obj.investigator_code) || null;
  const entries = [];
  let randomWeakness = false;
  for (const [code, count] of Object.entries(obj.slots || {})) {
    if (code === '01000') { randomWeakness = true; continue; }
    const card = db.byCode.get(code);
    if (!card) { unknown.push(`Card ${code}`); continue; }
    if (card.type === 'investigator') continue;
    entries.push({ card, count });
  }
  return { investigator, entries, unknown, randomWeakness, name: obj.name };
}

export function parseLink(input) {
  const m = input.match(/arkhamdb\.com\/(deck\/view|decklist\/view|deck\/edit)\/(\d+)/i);
  if (!m) return null;
  return { kind: m[1].startsWith('decklist') ? 'decklist' : 'deck', id: m[2] };
}

export async function fetchArkhamDb({ kind, id }) {
  const url = `https://arkhamdb.com/api/public/${kind}/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'not-found' : `http-${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith('{')) throw new Error('private');
  return JSON.parse(text);
}

export function parseAny(db, input) {
  const t = input.trim();
  if (t.startsWith('{')) {
    try { return parseJson(db, JSON.parse(t)); } catch { /* fall through */ }
  }
  return parseText(db, t);
}

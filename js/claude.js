// Brief for Claude (read by Claude in Chrome, or copied into the Claude app) and the parser for its reply.
import { ROLES } from './analyze.js';

const plain = t => (t || '').replace(/<[^>]+>/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
const SPICE = ['Proven: strong, well-known cards are welcome.', 'Mixed: some well-known cards, but look for fresh angles.', 'Off the beaten path: avoid the usual staples; find unusual synergies and cards people rarely play, especially combos between older and newer cards.'];

export function buildBrief({ db, builder, campaign, scenario, findings, details, spice, limit = 0, textLen = 170 }) {
  const inv = builder.inv;
  const icons = c => ['w', 'i', 'c', 'a', 'x'].filter(k => c[k]).map(k => `${c[k]}${k.toUpperCase()}`).join(' ');
  const source = limit ? builder.ranked().slice(0, limit).map(p => ({ card: p.card, max: p.max })) : [...builder.pool];
  const cards = source.sort((a, b) => a.card.type.localeCompare(b.card.type) || a.card.name.localeCompare(b.card.name)).map(({ card, max }) =>
    `- ${card.name} | ${card.type}${card.cost !== undefined ? `, cost ${card.cost === -2 ? 'X' : card.cost}` : ''} | ${card.fac}${card.slot ? ` | ${card.slot}` : ''} | ${card.traits || ''} | icons ${icons(card) || 'none'} | max ${max} | ${plain(card.text).slice(0, textLen)}`);
  const req = builder.required.map(c => `${c.name}${c.subtype ? ' (weakness)' : ''}: ${plain(c.text).slice(0, 200)}`);
  return [
    'ARKHAM DECK HELPER: BRIEF FOR CLAUDE',
    '',
    'TASK: Suggest 3 distinct approaches (different strategies, not small variations) for building this investigator\'s deck for what they are playing. Above all, each approach must be built for the specific campaign or scenario below: its skill tests, its named enemies, its treacheries and its chaos tokens. Within that, think creatively: look for synergies across old and new cards. For each approach, list the 15 to 20 different cards the deck should use, most important first. The page adds up to 2 copies of each (as the rules and the collection allow), builds a legal deck from them and fills any remaining slots itself. Only name cards from the owned list below, using their exact names.',
    '',
    'HOW TO ANSWER: If you can act on this page, write your answer into the text box labeled "Claude\'s approaches" and click the "Build Claude\'s approaches" button. Otherwise, reply with only the JSON. Format:',
    '{"approaches":[{"name":"short catchy name","plan":"one or two sentences on how the deck wins","why":"why it suits this investigator and scenario","key_cards":["Exact Card Name"],"avoid":["Exact Card Name"]}]}',
    '',
    `INVESTIGATOR: ${inv.name}${inv.sub ? `, ${inv.sub}` : ''} (${inv.fac}). Willpower ${inv.w}, Intellect ${inv.i}, Combat ${inv.c}, Agility ${inv.a}. Health ${inv.health}, Sanity ${inv.sanity}.`,
    `Ability: ${plain(inv.text)}`,
    `Deckbuilding: ${optionsText(inv)} (the list below is already filtered to legal cards you own).`,
    `Required cards: ${req.join(' / ') || 'none'}`,
    `Role: ${ROLES[builder.role]}. Players: ${builder.players}. Deck size: ${builder.size}. Level 0 cards only.`,
    '',
    `PLAYING (the most important factor; every approach must be built to beat this): ${campaign ? `${campaign.name}${scenario ? `, scenario "${scenario.name}"` : ' (whole campaign)'}` : 'Nothing specific: a general-purpose deck.'}`,
    ...(findings || []).map(f => `- ${f}`),
    campaign?.note ? `- ${campaign.note}` : '',
    ...(details?.threats?.length ? ['Biggest enemies:', ...details.threats.map(t => `- ${t}`)] : []),
    ...(details?.treacheries?.length ? ['Most common treacheries:', ...details.treacheries.map(t => `- ${t}`)] : []),
    details?.tokens ? `Chaos token effects (Easy/Standard): ${details.tokens.replace(/\n/g, ' ')}` : '',
    'In each approach\'s "why", say specifically how it handles these threats.',
    '',
    `STYLE: ${SPICE[spice]}`,
    '',
    `OWNED, LEGAL LEVEL 0 CARDS (${cards.length}${limit ? `, the best-suited of ${builder.pool.length}` : ''}): name | type, cost | class | slot | traits | icons | max copies | text`,
    ...cards,
  ].filter(l => l !== null).join('\n');
}

function optionsText(inv) {
  return (inv.options || []).filter(o => !o.deck_size_select).map(o => {
    const what = [(o.faction || o.faction_select || []).join('/'), o.trait ? `${o.trait.join('/')} trait` : '', o.type ? o.type.join('/') : '', o.tag ? 'tagged cards' : '', o.uses ? `${o.uses[0]} cards` : '', o.option_select ? o.option_select.map(x => x.name).join(' or ') : '']
      .filter(Boolean).join(' ') || 'cards';
    const lvl = o.level ? ` level ${o.level.min}-${o.level.max}` : '';
    return `${o.not ? 'NOT ' : ''}${what}${lvl}${o.limit ? ` (up to ${o.limit})` : ''}`;
  }).join('; ');
}

export function parseReply(text) {
  if (!text || !text.trim()) throw new Error('empty');
  const t = text.replace(/```(json)?/g, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no-json');
  const obj = JSON.parse(t.slice(start, end + 1));
  const list = Array.isArray(obj) ? obj : obj.approaches;
  if (!Array.isArray(list) || !list.length) throw new Error('no-approaches');
  return list.slice(0, 6).map((a, i) => ({
    name: String(a.name || `Claude idea ${i + 1}`).slice(0, 60),
    plan: String(a.plan || '').slice(0, 400),
    why: String(a.why || '').slice(0, 400),
    key: (a.key_cards || a.keyCards || a.cards || []).map(String).slice(0, 24),
    avoid: (a.avoid || []).map(String).slice(0, 20),
  }));
}

# Arkham Deck Helper: Deck Checkup

Paste a deck (or an ArkhamDB link) and get a checkup: what the deck does well, where it's thin, and what to fix first.

## What it checks

- **Six parts of every deck**, graded Strong / OK / Thin / Missing for your role and player count: finding clues, handling enemies, money, card draw, treachery protection and staying alive. Each one shows the cards that count toward it and the odds of seeing one in your opening hand and by round 3.
- **Skill tests**: the investigator's base skills, plus committable icons and boosting assets for each skill.
- **Cost curve**, compared with your income.
- **Slots**: how many hand, ally, arcane and other slotted assets compete for the same slots.
- **Rules check**: deck size, copy limits, signature cards and the investigator's deckbuilding options.

## Running it

It's a static site, so there's no build step for the app itself.

- **Locally:** run `python3 -m http.server` in this folder and open http://localhost:8000. Opening `index.html` directly won't work, because the card data has to be fetched.
- **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root.

## Updating card data

`data/cards.json` is built from [arkhamdb-json-data](https://github.com/Kamalisk/arkhamdb-json-data):

```sh
git clone --depth 1 https://github.com/Kamalisk/arkhamdb-json-data ../arkhamdb-json-data
node scripts/build-cards.mjs ../arkhamdb-json-data
```

## Code layout

- `js/parse.js`: reads pasted text, ArkhamDB JSON and ArkhamDB links.
- `js/analyze.js`: all grading, odds and rules checks. It has no UI code, so the planned **guided builder** and **upgrade planner** can reuse it.
- `js/app.js`: rendering, card previews and input handling.
- `js/sample.js`: the sample deck shown on first visit.

Card images load from ArkhamDB. This is an unofficial fan tool; Arkham Horror: The Card Game is © Fantasy Flight Games.

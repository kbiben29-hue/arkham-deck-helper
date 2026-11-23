# Arkham Deck Helper

Two tools for Arkham Horror: The Card Game:

- **Build a deck**: tick the products you own (every Chapter One and Chapter Two release, standalone scenarios, parallels, novellas and promos), choose an investigator or a role, then let it build a full level-0 deck or walk you through picking cards step by step with a live checkup.
  It also asks what you're playing (any campaign, Return to box or standalone scenario), reads that campaign's encounter cards to see what it throws at you, and offers several decks built around different plans. There's an "outside the box" setting, and Claude can add its own ideas through Claude in Chrome or the Claude app.
- **Chaos bag**: build your bag (Night of the Zealot presets, or your own counts), pull scenario token effects for every scenario at either difficulty, draw tokens (bless/curse redraw and leave the bag), and see your exact odds of passing a test.
- **Check a deck**: paste a deck (or an ArkhamDB link) and see what it does well, where it's thin, and what to fix first.

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
- `js/build.js`: collection handling, card scoring, auto-build and the walk-through steps.
- `js/builder-ui.js`: the Build a deck screens.
- `js/campaign.js`: campaign and scenario profiles (from `data/campaigns.json`) turned into findings and deck targets.
- `js/engines.js`: deck themes (Tomes, Spells, evade, bless…) and which ones your collection supports.
- `js/chaos.js`: the Chaos bag tab.
- `js/claude.js`: the brief for Claude and the parser for its reply.
- `js/app.js`: the Check a deck screen, card previews and page routing.
- `js/sample.js`: the sample deck shown on first visit.

Card images load from ArkhamDB. This is an unofficial fan tool; Arkham Horror: The Card Game is © Fantasy Flight Games.

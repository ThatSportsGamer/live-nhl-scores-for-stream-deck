# Live NHL Scores — Stream Deck Plugin

A Stream Deck plugin that shows live hockey scores directly on your buttons — **NHL, AHL, and ECHL**. Each button tracks one team and updates automatically every 30 seconds.

![Live NHL Scores Plugin](https://img.shields.io/badge/Stream%20Deck-Plugin-blue) ![Version](https://img.shields.io/badge/version-1.1.0-green)

---

## Features

- **Three leagues** — NHL, AHL, and ECHL, 94 teams total
- **Search by name or city** — type a team or location in the settings panel for instant results across all three leagues
- **Browse by league and division** — or pick a league, then a division, then a team from the dropdowns
- **Live scores** — shows away score, home score, and current period/time while a game is in progress
- **Pre-game** — shows the matchup (e.g. `TOR @ BOS`) and scheduled start time
- **Final scores** — shows the final score with a "Final", "Final/OT", or "Final/SO" label
- **Score-change flash** — when a team scores, the button flashes in that team's primary color
- **Browser shortcut** — press any button to open that game's recap or gamecenter
- **No-flicker updates** — buttons only redraw when the display actually changes
- **Multi-button support** — add as many team buttons as you want, each refreshes independently

---

## Recent Updates

**v1.1.0.0**
- Added AHL and ECHL support — 62 more teams alongside the NHL, sourced from the HockeyTech/LeagueStat feed used by theahl.com and echl.com
- Rebuilt the settings panel with a search box (type a team or city name for instant results across all three leagues), a league selector, and a division-filtered team dropdown
- Button link now opens the right destination per league — NHL Gamecenter, or the AHL/ECHL official game report

**v1.0.1.0**
- Updated Utah's team name to Utah Mammoth

**v1.0.0.0**
- Initial release — live scores, pre-game/final states, score-change flash, NHL Gamecenter shortcut, and all 32 NHL teams

---

## Requirements

- [Elgato Stream Deck](https://www.elgato.com/stream-deck) hardware
- [Stream Deck software](https://www.elgato.com/downloads) version 6.9 or later (Mac or Windows)
- No account required — the plugin uses each league's free public API

---

## Installation

1. Download the latest **`Live NHL Scores.streamDeckPlugin`** from the [Releases](../../releases) page
2. Double-click the file — Stream Deck will install it automatically
3. The plugin will appear in the Stream Deck action picker under **Live NHL Scores**

---

## Setup

1. Drag the **Live NHL Scores** action onto any button
2. In the settings panel on the right, either:
   - Type your team's name or city into the search box and pick it from the results, or
   - Choose a league (NHL / AHL / ECHL), optionally a division, then your team from the dropdown
3. Press the button anytime to open that game's recap or gamecenter

That's it. The button will load your team's game within a few seconds and refresh every 30 seconds from there.

---

## What the Button Shows

**Before the game:**
```
TOR @ BOS
 7:00 PM
```

**Live game:**
```
TOR  2
BOS  1
2nd 14:22
```

**Overtime:**
```
TOR  2
BOS  1
OT 3:05
```

**Final score:**
```
TOR  2
BOS  1
Final
```

**Final (OT/SO):**
```
TOR  2
BOS  1
Final/OT
```

**Off day:**
```
  TOR
No Game
```

---

## How It Works

NHL scores come from the [NHL's free public API](https://api-web.nhle.com). AHL and ECHL scores come from the HockeyTech/LeagueStat feed at `lscluster.hockeytech.com` — the same backend that powers theahl.com and echl.com. Both are polled once every 30 seconds per button. No API key or account is required for either. The plugin is fully self-contained — it uses only Node.js built-in modules and requires no external dependencies.

The schedule holds on the current day's games until 2 AM local time (NHL) or within a rolling multi-day window (AHL/ECHL), so late-running games and off days stay sensible on the button.

---

## Uninstalling

Open Stream Deck → Preferences → Plugins, select **Live NHL Scores**, and click the **−** button.

---

## Contributing

Bug reports and feature requests are welcome — open an [Issue](../../issues) to get started.

---

## Disclaimer

This plugin is not affiliated with, endorsed by, or sponsored by the National Hockey League, American Hockey League, ECHL, or any of their member clubs. NHL data is sourced from the NHL's public API; AHL and ECHL data is sourced from the HockeyTech/LeagueStat feed used by theahl.com and echl.com. This plugin is intended for individual, personal, non-commercial use only.

---

## Credits

Created by **T.J. Lauerman aka ThatSportsGamer**

Created with Claude Cowork by Anthropic

Data provided by the [NHL API](https://api-web.nhle.com)

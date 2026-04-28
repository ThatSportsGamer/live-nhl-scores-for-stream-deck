# Live NHL Scores — Stream Deck Plugin

A Stream Deck plugin that shows live NHL scores directly on your buttons. Each button tracks one team and updates automatically every 30 seconds.

![Live NHL Scores Plugin](https://img.shields.io/badge/Stream%20Deck-Plugin-blue) ![Version](https://img.shields.io/badge/version-1.0.1-green)

---

## Features

- **Live scores** — shows away score, home score, and current period/time while a game is in progress
- **Pre-game** — shows the matchup (e.g. `TOR @ BOS`) and scheduled start time
- **Final scores** — shows the final score with a "Final", "Final/OT", or "Final/SO" label
- **Score-change flash** — when a team scores, the button flashes in that team's primary color
- **Browser shortcut** — press any button to open that game in NHL Gamecenter
- **No-flicker updates** — buttons only redraw when the display actually changes
- **Multi-button support** — add as many team buttons as you want, each refreshes independently

---

## Requirements

- [Elgato Stream Deck](https://www.elgato.com/stream-deck) hardware
- [Stream Deck software](https://www.elgato.com/downloads) version 6.9 or later (Mac or Windows)
- No NHL account required — the plugin uses the NHL's free public API

---

## Installation

1. Download the latest **`Live NHL Scores.streamDeckPlugin`** from the [Releases](../../releases) page
2. Double-click the file — Stream Deck will install it automatically
3. The plugin will appear in the Stream Deck action picker under **Live Sports Scores**

---

## Setup

1. Drag the **Live NHL Scores** action onto any button
2. In the settings panel on the right, select your team from the dropdown
3. Press the button anytime to open that game in NHL Gamecenter

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

## Supported Teams

All 32 NHL teams are supported, organized by conference and division:

| Eastern — Atlantic | Eastern — Metropolitan |
|---|---|
| Boston Bruins | Carolina Hurricanes |
| Buffalo Sabres | Columbus Blue Jackets |
| Detroit Red Wings | New Jersey Devils |
| Florida Panthers | New York Islanders |
| Montréal Canadiens | New York Rangers |
| Ottawa Senators | Philadelphia Flyers |
| Tampa Bay Lightning | Pittsburgh Penguins |
| Toronto Maple Leafs | Washington Capitals |

| Western — Central | Western — Pacific |
|---|---|
| Chicago Blackhawks | Anaheim Ducks |
| Colorado Avalanche | Calgary Flames |
| Dallas Stars | Edmonton Oilers |
| Minnesota Wild | Los Angeles Kings |
| Nashville Predators | Seattle Kraken |
| St. Louis Blues | San Jose Sharks |
| Utah Hockey Club | Vancouver Canucks |
| Winnipeg Jets | Vegas Golden Knights |

---

## How It Works

The plugin polls the [NHL's free public API](https://api-web.nhle.com) once every 30 seconds per button. No API key or account is required. The plugin is fully self-contained — it uses only Node.js built-in modules and requires no external dependencies.

The schedule holds on the current day's games until 2 AM local time, so late-running games stay on the button until they finish.

---

## Uninstalling

Open Stream Deck → Preferences → Plugins, select **Live NHL Scores**, and click the **−** button.

---

## Contributing

Bug reports and feature requests are welcome — open an [Issue](../../issues) to get started.

---

## Disclaimer

This plugin is not affiliated with, endorsed by, or sponsored by the National Hockey League or any of its member clubs. All data is sourced from the NHL's public API. This plugin is intended for individual, personal, non-commercial use only.

---

## Credits

Created by **T.J. Lauerman aka ThatSportsGamer**

Created with Claude Cowork by Anthropic

Data provided by the [NHL API](https://api-web.nhle.com)

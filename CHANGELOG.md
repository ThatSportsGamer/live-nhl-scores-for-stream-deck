# Changelog

Full version history for Live NHL Scores, newest first. The [README](README.md) lists the three most recent updates.

**v1.2.1.0**
- Pregame keys are easier to read: the teams stack on two lines (away team on top, "@ home" below, with a small "@") and the day and time get their own lines. On game day the day line goes away and the start time is shown larger. Same on team keys and Scoreboard keys
- Games a week or more out show the date on the day line ("Sat 10/24"), with the time underneath
- Off-day keys show your team's next game the same way: the "Next Game" label is gone, and the day line reads the weekday ("Thursday"), or the date when it's a week or more away
- AHL and ECHL start times now show in your own time zone, like NHL games (they used to show the arena's local time)
- The Scoreboard's next-game-day keys (no games today) use the same layout

**v1.2.0.0**
- New: **Live NHL Scoreboard** action — drag it onto as many keys as you like and they fill with today's games, one game per key, in start-time order. Pick the league for each board: **NHL** (up to 16 keys), **AHL** (up to 16) or **ECHL** (up to 15)
- Same keys as the team action: the goal lamp on the scoring team's color plus the goal card (NHL: EV / PPG / SHG / EN / PS +1; AHL/ECHL: GOAL +1), and fireworks at the final. The lamp can be turned off per board for a quick flash instead
- Each board remembers its own settings, so an NHL page and an AHL page work, and boards with different settings can share a page; give each board its own background color to tell them apart
- Fill top-to-bottom or left-to-right and optionally send finals to the end. More games than keys: the last key shows "+N more"; extra keys show "No Game". Both open the league's scores page
- The board moves to the next day at 2:00 AM, same as the team keys. On a day with no games (All-Star break, holidays), it shows the next game day's schedule with the day on each key
- Press a Scoreboard key to open that game's Gamecenter (AHL/ECHL: the official game report)

**v1.1.16.0**
- Goal card now matches the baseball and football cards: team on top, goal type + count in yellow — EV +1, PPG +1, SHG +1, EN +1, PS +1 (WSH / PPG +1)
- AHL and ECHL keys now get a GOAL +1 card after the lamp too (that league feed doesn't say power play or shorthanded)
- If the NHL's goal details haven't caught up yet, or one team scores twice between updates, the card shows GOAL +1 / GOAL +2 instead of being skipped

**v1.1.15.0**
- Goal lamp now glows over the scoring team's color (black if both teams scored in the same update), and the lamp fills more of the key — the GOAL text under it is gone
- New: after the lamp on NHL games, a 3-second card shows the scoring team and the type of goal — POWER PLAY, SHORTHANDED, EMPTY NET or PENALTY SHOT in yellow (even-strength goals show just the team and GOAL). AHL and ECHL keys get the team-color lamp only
- With the goal lamp turned off, the flash is now 5 solid blinks of the scoring team's color with no text, so it reads at a glance

**v1.1.14.0**
- New: goal lamp — whenever either team scores, the key plays a short red goal-light animation with GOAL beneath it, then returns to the score. On by default; a new "Goal Lamp" checkbox in settings turns it off (you get the old quick flash in the scoring team's color instead)
- A goal that's overturned and later counted again doesn't replay the animation
- Fixed: in the offseason an AHL or ECHL key could keep showing last season's playoff final instead of the team's next game — finals more than 3 days old are now ignored
- Settings help text now says "key" instead of "button"

**v1.1.13.0**
- Fixed: reopening a key's settings could reset the background color and Custom Link fields once the live team list loaded, and the next change saved them blank

**v1.1.12.0**
- Custom Link now adds https:// automatically if you leave it off — previously a link without it was silently ignored
- In the offseason, pressing an NHL team's key opens that team's NHL.com schedule instead of the league-wide one (AHL/ECHL still open the league schedule)
- Settings: "Key Press Opens" default now reads "NHL.com Gamecenter (free)", and the Custom Link hint mentions the 30-minute post-final window

**v1.1.11.0**
- Search results now always lead with the matching NHL team and its AHL/ECHL affiliates, then any other matches — previously, if one league's live team list failed to refresh, an affiliate that shares the NHL team's name (e.g. Providence Bruins) could show up ahead of the NHL team

**v1.1.10.0**
- Fixed the plugin's internal ID (`com.tj.livenhlscores`) so it matches its bundle folder, as required for the Elgato Marketplace. **If you installed an earlier version, uninstall it and re-add your keys** — Stream Deck treats this as a new plugin
- Custom Link now switches back to Gamecenter 30 minutes after a final, matching the MLB, MiLB, and CFB plugins
- Turned off Node debug mode for release builds

**v1.1.9.0**
- Reordered the settings panel — "Key Press Opens" now sits above "Key Background"

**v1.1.8.0**
- Custom Link now opens Gamecenter until the game actually starts, then switches to your link — matches the MiLB plugin's behavior, and added the same explanatory note in settings

**v1.1.7.0**
- Added a "Key Press Opens" setting per key — NHL.com Gamecenter (default) or a Custom Link you type in, same idea as the MLB plugin's link option

**v1.1.6.0**
- Searching for an NHL team now also surfaces its AHL and ECHL affiliates, in NHL → AHL → ECHL order — same idea as the MiLB plugin's affiliate search. Affiliations are hand-maintained since the AHL/ECHL feed doesn't expose parent-org data; worth a check each September if a team's system changes

**v1.1.5.0**
- Fixed the settings panel search box reopening its dropdown (looking like an active search) when it just refreshed the live team list for an already-tracked team

**v1.1.4.0**
- Added the final marketplace/plugin icon — the goalie silhouette artwork with the "Live NHL Scores" wordmark, matching the CFB/NFL/MLB/MiLB plugins

**v1.1.3.0**
- Added a custom key background color option — pick any color and opacity in the settings panel to restyle the key background instead of the default black

**v1.1.2.0**
- Fixed AHL/ECHL keys showing a bare time (looking like tonight's game) instead of the Next Game date when the actual game was weeks out — the HockeyTech feed ignores its own day-window request during the off-season and returns the next game regardless of distance, which the date logic wasn't accounting for

**v1.1.1.0**
- Off days now show your team's next scheduled game (matchup, date, and time) instead of a dead-end "No Game" — looks ahead across the whole off-season if needed, same approach as the MLB/MiLB plugins
- Team lists now refresh from each league's own API instead of a fixed list baked into the plugin, so AHL/ECHL expansion teams and realignments show up automatically
- Confirmed the end-of-game fireworks animation and the score-change team-color flash are both fully wired up

**v1.1.0.0**
- Added AHL and ECHL support — 62 more teams alongside the NHL, sourced from the HockeyTech/LeagueStat feed used by theahl.com and echl.com
- Rebuilt the settings panel with a search box (type a team or city name for instant results across all three leagues), a league selector, and a division-filtered team dropdown
- Key link now opens the right destination per league — NHL Gamecenter, or the AHL/ECHL official game report

**v1.0.1.0**
- Updated Utah's team name to Utah Mammoth

**v1.0.0.0**
- Initial release — live scores, pre-game/final states, score-change flash, NHL Gamecenter shortcut, and all 32 NHL teams

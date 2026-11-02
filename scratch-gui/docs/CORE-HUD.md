# Core HUD

The core HUD is the overlay the player sees on top of a running game: team scores and the round timer along the top, a score board in the top right, and a status bar along the bottom. It lives in `src/components/core-hud/` and reads its numbers through `extractHudState` in `src/lib/core-hud-state.js`.

## Why the status bar looks like this

Hangar Breach shipped with its own Doom style bar drawn by two sprites, StatusHUD and WeaponHUD. The 2.2.0 overhaul hid StatusHUD and put a small pill in its place. Players lost the feeling of a cockpit. The new bar brings that feeling back in Squiggle's own voice.

| Doom idea | Squiggle version |
|---|---|
| A full width band across the bottom | A night panel band with a purple top edge, rounded top corners and a faint dot texture |
| Big red numerals | Big Nunito 900 numerals in calm colours: green, amber or coral for health, sky blue for armor, white for ammo |
| The marine's face reacts to damage | The Squiggle blob sits in a raised porthole in the middle and changes mood with health |
| Arms grid 2 to 7 | Keycaps 1, 2, 3 with the current weapon lit in brand purple |
| Keycard slots | Key glyphs in their own colours, dimmed with a dashed outline until found |
| Frags | Frags sit in the band when you are playing alone, and in the board when other players are in the room |

The face never shows injury. Its moods are great, good, worried, wobbly (a sweat drop and a sticking plaster), ouch (a short wince after each hit) and knocked out (dizzy spiral eyes and two stars). A 9 year old can read every slot by its icon and its word.

Labels are sentence case and come from `sq.coreHud.*` messages. Numbers use tabular figures so they do not jitter as they change.

## Layout

The band is a three column grid: the left group, the face, the right group. Left reads ammo, health, weapon. Right reads armor, keys, frags. A slot only appears when the game has data for it.

The HUD root is a CSS container, so the band sizes itself to the stage, not the browser window.

| Stage width | What changes |
|---|---|
| Over 620px | Everything shows, with icons and words |
| 620px and under | Words under the numbers hide and the icons stay. The weapon and key captions hide. Extra ammo kinds hide |
| 400px and under | The face shrinks to 44px and the keys slot hides |

The band does not take pointer events, so a click anywhere on it still reaches the stage and can start mouse look. Only the score board toggle is clickable.

## Data contract

`extractHudState(vm, net)` is pure. It reads four sources and the first one that has a value wins:

1. My player values in a room: `window.SquiggleNet.game.players[mySlot]`.
2. Game values in a room: `window.SquiggleNet.game.values`.
3. Project variables on every original target, Stage and Game Rules first. A variable named `last_<key>` also counts, which picks up the old StatusHUD mirror variables.
4. Player value defaults declared in Game Rules setup.

Names are matched without case. These are the names each slot looks for.

| Slot | Names |
|---|---|
| Health | `hp`, `health`, `hearts`, `lives`, `hull`, `energy`, `p1 hp`, `p1_hp`, `player_hp` |
| Armor or shield | `shield`, `armor`, `armour`, `p1 shield`, `p1_shield`. The label says Shield for the shield names and Armor otherwise |
| Ammo | `ammo`, `bolts`, `charges`, `shells`, `p1 ammo`, `p1_ammo`. Other kinds (`bullets`, `shells`, `cells`, `rockets`, `bolts`, `charges`, `arrows`, `darts`, `gems`) list under the main number |
| Weapon | `weapon`, `cur_wpn`, `wpn`, `cur_weapon`, `current_weapon`. Slot count comes from `weapon_slots`, `weapons` or `wpn_slots`, default 3, at most 7 |
| Keys | Any player value or variable ending in `key`, `keycard`, `card` or `pass`, at most 4. The colour comes from a colour word in the name: gold, red, blue, green or purple |
| Frags | My row on the first score board, labelled with the board name |
| Teams | Teams declared in Game Rules, scored from `<team>_score`, `<team>_pts`, `<team>_points` or the team name |
| Timer | Room timers first, then `time_left`, `timer`, `countdown`, `round_time` and friends |

The result has a `bar` field that decides the layout:

| `bar.layout` | When | Shows |
|---|---|---|
| `band` | Two or more of health, armor, ammo and weapon are known | The full band with the face |
| `compact` | Exactly one of them is known, for example a platformer with `lives` | A small plate with that one slot |
| none (`bar` is null) | None of them is known | No status bar. A score only game keeps just the board |

`bar.foldsBoard` is true when the band shows frags and the board has one row. The board then hides, so the same number is not on screen twice.

Creators can turn sections off in Game settings: `hud.health` hides the bar, `hud.scores` the board, `hud.teams` the team plate and `hud.timer` the timer. `hud.enabled` false hides the whole core HUD and gives the game's own HUD sprites back.

## The game's own HUD sprites

A sprite named StatusHUD is hidden while the core status bar shows, and a sprite named TimerHUD while the core timer shows. The text engine also hides `hud_*` text while StatusHUD is hidden. CoreHud remembers which sprites it hid and shows them again when its bar goes away, when the HUD is turned off, or when CoreHud unmounts. A sprite the game hid itself stays hidden. WeaponHUD is the gun in the player's hands, not a HUD, so it is never touched.

## Solo play and Game Rules

Values set by Game Rules blocks, such as `hp`, `armor`, `ammo` and `frags` in Hangar Breach, change only on the game server. Solo play from the play page runs without a room, so those values stay at their starting numbers. Values the project keeps in its own variables, such as Hangar Breach's `cur_wpn`, change in solo play too. A game that wants a live bar alone should either run in a room or keep its numbers in variables.

## Performance

CoreHud listens to `AFTER_EXECUTE` but reads the game at most every 100 ms, about 10 times a second, and does nothing else on the other ticks. It calls `setState` only when the HUD's JSON signature changes. On Hangar Breach at 4x CPU throttle the listener cost 0.03 ms per tick on average.

## Tests

`src/lib/core-hud-state.test.mjs` covers the data contract, including a Hangar Breach shaped project alone and in a room. `src/components/core-hud/core-hud.test.mjs` renders the band and drives the component for the sprite hand back, the poll limit and the hurt flash.

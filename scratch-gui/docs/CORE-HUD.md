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

1. My player values in a room or a private one player session: `window.SquiggleNet.game.players[mySlot]`. `mySlot` is whatever slot the server gave, not always 1.
2. Game values in a room or session: `window.SquiggleNet.game.values`.
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
| Frags | My live player value named after the first score board, so the band moves as soon as the rules change it. Without one, my row on the board. Labelled with the board name in sentence case |
| Teams | Teams declared in Game Rules, scored from `<team>_score`, `<team>_pts`, `<team>_points` or the team name. With none of those, the sum of the first board's value over the team's members, so a team of one still counts. My own team gets an outline |
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

Some games draw their own HUD with sprites named StatusHUD and TimerHUD. Showing both would stack two bars, so Game settings has an explicit choice, saved in the project's settings note as `ownHud`.

| Choice | What happens |
|---|---|
| Auto (default) | Replace when the game loads the Arena or Scores kit, keep otherwise |
| Replace | Hide StatusHUD while the Squiggle status bar shows, and TimerHUD while the Squiggle timer shows |
| Keep | Leave both sprites alone and leave out the matching Squiggle bar or timer. Team scores and the board still show |

A game without either sprite is not affected by this choice. Hangar Breach loads Arena and Scores, so Auto replaces its StatusHUD.

`extractHudState` reports the decision as `replaces.bar` and `replaces.timer`, and CoreHud hides only what those say. It remembers what it hid and shows it again when the setting changes, when its bar goes away, when the HUD is turned off, or when CoreHud unmounts. A sprite the game hid itself stays hidden. The text engine hides `hud_*` text while StatusHUD is hidden, so the old numbers go with their sprite. WeaponHUD is the gun in the player's hands, not a HUD, so it is never touched.

## One player sessions

Game Rules values such as `hp`, `armor`, `ammo` and `frags` change only on the game server. Solo play without a session leaves them at their starting numbers. The play page is gaining a private one player session for Game Rules projects, built on the server side. With it, the HUD reads the same `game.players[mySlot]` path as a full room. Nothing in the HUD needs two players: a board with one row folds into the band, a team of one is scored from its member, and the roster can be just me.

What the editor expects from the server for a private session:

| Item | Contract |
|---|---|
| Embed URL | `/embed.html?project_url=<sb3>&autoplay&theme=squiggle&coplay=<CODE>`. `&name=` is optional |
| Socket | `/ws/play/<CODE>`, the same as a room code. The embed upper cases the code |
| Welcome | A `welcome` frame with any slot of 1 or more |
| Names | `y.names[mySlot]` in the first keyframe. Until it arrives the player is called the `&name` value, else Player and the slot number |
| Boards | `y.boards` may be empty. The HUD falls back to my live player value |
| Game mode | The project must have a non empty Game Rules sprite and load Together or a Together kit. Otherwise the embed treats the code as a co-play drive session |
| Copy | The editor shows no waiting for players text. Any lobby or waiting copy lives on the play page, which should hide it for a private session |

Values a project keeps in its own variables, such as Hangar Breach's `cur_wpn`, also work with no session at all.

## Performance

CoreHud listens to `AFTER_EXECUTE` but reads the game at most every 100 ms, about 10 times a second, and does nothing else on the other ticks. It calls `setState` only when the HUD's JSON signature changes. On Hangar Breach at 4x CPU throttle the listener cost about 0.1 ms per tick on average, so it was never the stutter.

### 3D picture quality

The stutter after 2.2.0 came from the first person view. The overhaul drew it at full stage resolution on every browser, four times the pixels of 2.1. The view now picks its resolution from a ladder of 1, 0.75 and 0.5 of the stage size, chosen in Game settings as `render3d`.

| Choice | Behaviour |
|---|---|
| Auto (default) | Starts at 1 on screens of 1.5x pixel ratio and up, 0.75 otherwise, capped so the frame stays within 480x360 pixels. Steps down a rung when a window of 45 drawn ticks has a median tick over 60% of a display frame, or more than 5% late display frames. Steps back up toward its starting rung when the projected sharper tick fits in 35% and under 2% of frames are late. Each step down makes it wait 2, then 4, then at most 8 windows before trying sharper again |
| Crisp | Always 1 |
| Fast | Always 0.5, the 2.1 look |

A tick is timed from `BEFORE_EXECUTE` to the end of the stage's WebGL draw, so the upload counts. Late display frames are animation frame gaps over 1.75 times the shortest gap and over 25 ms. They catch work the page cannot time, such as compositing. The policy is `src/lib/world/render-scale.js`.

Measured on Hangar Breach in headless Chrome, walking with mouse look for 10 seconds, with CDP CPU throttling. Before is v2 at 1302996. Ticks are VM steps including the draw. Late frames are animation frames over 20 ms out of about 600.

| Throttle | Build and choice | Tick median | 3D render median | Late frames |
|---|---|---|---|---|
| 1x | Before | 0.5 ms | 0.3 ms | 1 |
| 1x | Auto, 1x screen (0.75) | 0.4 ms | 0.2 ms | 1 |
| 1x | Fast | 0.2 ms | 0.1 ms | 1 |
| 4x | Before | 2.0 ms | 1.3 ms | 2 |
| 4x | Auto, 1x screen (0.75) | 1.3 ms | 0.7 ms | 2 |
| 4x | Auto, 2x screen (1) | 1.9 ms | 1.2 ms | 2 |
| 4x | Fast | 0.9 ms | 0.4 ms | 2 |
| 12x | Before | 5.4 ms | 3.6 ms | 39 |
| 12x | Auto, 1x screen (0.75) | 3.6 ms | 2.3 ms | 15 |
| 12x | Crisp | 5.7 ms | 3.8 ms | 41 |
| 12x | Fast | 2.5 ms | 0.7 ms | 6 |

At 20x throttle on a 2x screen, Auto stepped once to 0.75 and held there for 15 seconds. It had 93 late frames out of 901 against 174 out of 898 for Crisp, and a tick median of 6.2 ms against 9.8 ms. At 12x on a 2x screen over 20 seconds, Auto stayed at 1 with no flapping, because only 2 to 3% of frames were truly dropped.

Headless Chrome draws WebGL in software, so absolute numbers are higher than on a real graphics card. Neither build dropped frames at 1x on this machine, so the stutter Nick saw could not be reproduced frame for frame. The table shows the cost that was added and what each choice takes away.

## Tests

`src/lib/core-hud-state.test.mjs` covers the data contract, including a Hangar Breach shaped project alone, in a room and in a one player session on slot 4, and each own HUD choice. `src/components/core-hud/core-hud.test.mjs` renders the band and drives the component for the sprite hand back, the poll limit and the hurt flash. `src/lib/world/render-scale.test.mjs` covers the quality ladder and `src/lib/world/view3d.test.mjs` runs it end to end. `src/lib/game-settings.test.mjs` covers saving both choices.

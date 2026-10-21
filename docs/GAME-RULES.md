# Game Rules

Some things in a multiplayer game have to be the same for everyone: the score,
who is on which team, whose turn it is, who won. If every computer decides
those on its own, two players can end up seeing two different winners. Game
Rules fix that. You write those rules once, on one special sprite, and the
game server runs them for the whole room.

## Two kinds of blocks

| | Device blocks | Rule blocks |
|---|---|---|
| Where they go | Any normal sprite or the Stage | Only the Game Rules sprite |
| Where they run | On your computer, and on every other player's computer | On the game server, once for the whole room |
| What they are good at | Moving your own sprite, drawing, sounds, keys, anything that needs to feel instant | Scores, rounds, teams, items, hits, timers, the end of the game |
| How to tell | The normal block colours | A gold edge |

Your own sprite moves on your screen the moment you press a key. Things that
are shared are decided by the server, so they take a moment to come back.

## The Game Rules sprite

Press **Open Game Rules** at the top of Together, Scores and Rounds, Teams and
Items or Arena. If your project has no Game Rules sprite yet, the editor makes
one and switches to it.

- There is one Game Rules sprite per project. It sits right after the Stage in
  the sprite list.
- It is invisible on the stage and cannot be dragged.
- Its scripts never run on your computer, not even when you press the green
  flag.
- While you edit it, the block palette shows only what the server can run:
  Control, Operators, Variables, My Blocks and the gold rule blocks. A **Game
  setup** button opens a sheet where you set up secret and saved values,
  player values, teams and boards.

## Together rule blocks

| Block | Kind |
|---|---|
| `when the game starts` | hat |
| `when a player joins`, `when a player leaves` | hat |
| `when a player sends [NAME]` | hat |
| `when timer [TIMER] is done` | hat |
| `every [SECONDS] seconds` | hat |
| `when [VALUE] changes` | hat |
| `set [VALUE] of [PLAYER] to [TO]`, `change [VALUE] of [PLAYER] by [BY]` | command |
| `for each player` | loop |
| `send [NAME] with [VALUE] to [TO]` | command |
| `start timer [TIMER] for [SECONDS] seconds`, `stop timer [TIMER]` | command |
| `remove [PLAYER] from the game` | command |
| `end the game, winner [WINNER]` | command |
| `the player`, `message value`, `name of [PLAYER]`, `[VALUE] of [PLAYER]` | reporter |
| `number of players`, `time left on [TIMER]`, `game time`, `random player` | reporter |

The rule blocks from Scores and Rounds, Teams and Items and Arena are listed in
[TOGETHER.md](./TOGETHER.md).

## How big Game Rules can be

The server keeps every game small enough to run fast for everyone. If you go
over a limit, the editor tells you which one.

| Limit | Most you can have |
|---|---|
| Game values | 64 |
| Events | 32 |
| Rules for one event | 16 |
| Phases | 16 |
| Timers | 16 |
| Player values | 32 |
| Input names | 32 |
| Lists | 16 |
| Items in one list | 200 |
| Teams | 4 |
| Boards | 4 |
| Saved values | 16 |
| Levels | 32 |
| Tiles across one level | 128 |
| Letters in one name | 40 |
| Letters in a piece of text | 4096 |
| Times a repeat runs | 100 |
| Shortest `every` | 0.1 seconds |

## What the checker tells you

The checker is the pill in the menu bar. It looks over your whole project while
you work and lists what it finds in plain words. **Show me** jumps to the
block, and **Fix it** fixes it for you when there is one clear fix.

For Game Rules it can say things like:

| It says | What to do |
|---|---|
| This gold block only works inside Game Rules. | Press **Move it**, or drag the block onto the Game Rules sprite |
| This block can't run on the server. Move it to a normal sprite. | The block is a device block on the Game Rules sprite. Move it out |
| Game Rules can only use their own variables. | Make the variable on the Game Rules sprite, or use a game value |
| This name isn't set up. Check the spelling or add it in Game setup. | Open **Game setup** and add the timer, team, board or value |
| These custom blocks call each other in a circle. | Change one of the My Blocks so the circle ends |
| Game Rules can have at most 4 teams. Remove some. | Stay inside the limits in the table above |
| These Game Rules are too big for the server. Make them smaller. | Split long scripts into fewer, smaller rules |
| Some words here aren't allowed. Try different words. | Rename the message, value or text |
| Reload the editor to get the newest blocks. | Reload the page |

Some of these come back from the server when it checks your rules, so you see
them once your rules reach it.

While a game runs, the server can also report back:

- This rule did too much at once, so its changes were undone.
- The game was busy, so this rule ran a moment late.
- This rule kept the game too busy, so it rests for 5 seconds.
- This repeat stopped at 100 times.
- Some text was too long, so the end was cut off.
- This rule sent too many messages at once, so some were not sent.

The checker also looks at normal sprites: messages nobody hears, messages
nobody sends, unused variables, loose blocks with no hat, clones that never
delete themselves, Together sends in a loop with no wait, pen drawing in a
World project, scenes, levels and tiles that do not exist, and costumes or
sounds big enough to make the game slow to load.

## In 2.0

The game server is switched off for players in this release. You can build
Game Rules, and the checker reads them, but the blocks on normal sprites that
connect a game to the server are hidden and a game plays on each computer.
Turning the game server on is what is next.

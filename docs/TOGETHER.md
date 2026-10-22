# Together: multiplayer games

Add Extension, then **Together**, to turn a room into a multiplayer game.
Everyone running the same project trades messages and shared variables while
the green flag is down. Each computer still runs the whole project on its own;
only the values you send are shared.

With no room open, messages come back to you and shared variables stay on your
device, so you can test a game alone before you invite anyone.

## Together blocks

### Messages

| Block | What it does |
|---|---|
| `send [NAME] to everyone with [VALUE]` | Sends a named message and a value to everyone in the room, you included |
| `when someone sends [NAME]` | Runs when that message arrives |
| `when someone sends anything` | Runs for every message |
| `message name`, `message value` | The name and value of the most recent message |

### Shared variables

| Block | What it does |
|---|---|
| `set shared variable [NAME] to [VALUE]` | Sets a room variable. The last write wins |
| `change shared variable [NAME] by [VALUE]` | Adds to a room variable. It travels as a change, so two players adding at once both count |
| `shared variable [NAME]` | Reads a room variable. Someone who joins late gets the current values from the room |

### Room

| Block | What it does |
|---|---|
| `my player name` | The name you play under |
| `other players` | Everyone else in the room, joined with commas |
| `player count` | You plus everyone else in the room |
| `when a player joins`, `when a player leaves` | Run when someone comes or goes |
| `last player joined`, `last player left` | The name from the most recent join or leave |
| `connected to room?` | Whether the room connection is live |

The category ends with an **Open Game Rules** button. It makes the Game Rules
sprite if the project does not have one and switches to it. See
[GAME-RULES.md](./GAME-RULES.md).

## The three expansions

Scores and Rounds, Teams and Items, and Arena build on Together. Their cards in
the extension library carry a **Together Room** badge under Requires, which
means the blocks only do something in a room. Each one adds gold-edged rule
blocks that go on the Game Rules sprite and run on the game server, not on
your computer.

### Scores and Rounds

Keep score, play in rounds and crown the winner.

| Block | Kind |
|---|---|
| `when a round starts`, `when a round ends` | hat |
| `start a new round`, `end the round` | command |
| `round` | reporter |
| `save [VALUE] for [PLAYER]` | command |
| `post [SCORE] for [PLAYER] on [BOARD]` | command |
| `player with the most [VALUE]` | reporter |

### Teams and Items

Pick teams and give players things to find and use.

| Block | Kind |
|---|---|
| `put [PLAYER] on team [TEAM]` | command |
| `for each player on team [TEAM]` | loop |
| `send [NAME] with [VALUE] to team [TEAM]` | command |
| `team of [PLAYER]`, `players on team [TEAM]` | reporter |
| `give [COUNT] [ITEM] to [PLAYER]`, `take [COUNT] [ITEM] from [PLAYER]` | command |
| `count of [ITEM] for [PLAYER]` | reporter |

### Arena

Health, hits and respawns for battle games.

| Block | Kind |
|---|---|
| `when a player fires` | hat |
| `players can move [STEPS] steps a second` | command |
| `move [PLAYER] to x [X] y [Y]` | command |
| `hit [PLAYER] by [BY]` | command |
| `x of [PLAYER]`, `y of [PLAYER]`, `direction of [PLAYER]` | reporter |
| `player [PLAYER] is aiming at within [STEPS] steps and [DEGREES] degrees` | reporter, needs a level |
| `can [PLAYER] see [OTHER]?` | boolean, needs a level |

The two blocks that need a level check the solid tiles of a World level, so
walls block sight and aim.

### The game server is switched off in 2.0

The editor also has blocks for normal sprites that talk to the game server:
`tell the game [NAME] with [VALUE]`, `when the game says [EVENT]`,
`game value [NAME]`, `my player value [NAME]`, `round`, `my team`,
`time left on [TIMER]`, `in a game?`, and per expansion `fire`,
`when I get hit` and `who hit me last` (Arena), `my place on [BOARD]` (Scores
and Rounds) and `team of [PLAYER]` (Teams and Items). They are hidden from the
palette while the game server is off, which it is in this release. You can
build Game Rules today, and the checker reads them. Turning the game server on
is what is next.

## A two-player example

A shared counter both players can bump:

1. Add the **Together** extension.
2. On the Stage:

```text
when green flag clicked
set shared variable [score] to [0]

when someone sends [bump]
change shared variable [score] by (message value)
say (join [Score: ] (shared variable [score]))

when this sprite clicked
send [bump] to everyone with [1]
```

3. Open the same room in two browsers, press the green flag in both, click the
   stage on either side, and both see the score climb. A third tab that joins
   mid-game already has the current `score`.

## Things worth knowing before you design a game

- **Every player runs the whole project.** Motion, collisions and timers run on
  each computer. Two players will not agree about anything you do not share,
  and that is what keeps their scripts from fighting each other.
- **Pick one owner for anything contested.** For scores, turn order or spawns,
  let one player own the value and send the results, or put the rule on the
  Game Rules sprite once the game server is on.
- **Late joiners get shared variables, not messages.** Messages are live only.
  Anything a newcomer needs to know must live in a shared variable.
- **Do not send in a loop with no wait.** The checker flags a Together send or a
  shared variable change that runs every frame.

`scratch-gui/src/lib/libraries/extensions/together/together.test.mjs` drives the
extension against a stubbed runtime and bridge, with no browser needed. It is a
good starting point if you are changing the extension, and CI runs it on every
pull request.

## Undo in a room

Undo is yours alone. Ctrl or Cmd+Z walks back your own block edits in the sprite you are looking at, newest first. Your friends' edits never go on your undo stack, so you cannot undo what they did, and they cannot undo what you did.

If a friend changed a block after you did, undo stops at that step and tells you. Press undo again within a few seconds to skip that step and keep going from before it. That way you never roll back a friend's later change by accident.

Undo starts fresh when you switch sprites. A deleted sprite, costume or sound comes back with Restore in the Edit menu. For a bigger mistake use Room history in the room panel: the room keeps a version about once a minute, and the room host can bring one back for everyone.

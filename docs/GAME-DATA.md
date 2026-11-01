# Game data

Game data lets a game remember a player. Fred plays Ninja Grab, reaches level
10, comes back a week later on another computer and is still at level 10. The
same game can keep a top 10 for everyone who plays it.

Game data is in every project. You do not need to add it from the extension
library. Its blocks are in the **Game data** category of the block palette.

## The blocks

| Block | What it does |
|---|---|
| `save [level] as [10]` | Keeps a value for the player who is playing. A whole number or a decimal stays a number; anything else is kept as text |
| `saved [level]` | The value kept under that name, or nothing if there is none |
| `forget [level]` | Removes that value |
| `when saves are ready` | Runs when the player's saves have loaded. Start your game from here, or check `saves ready?` first |
| `saves ready?` | True once the saves have loaded |
| `signed in?` | True when the player is signed in, so their saves follow them to every device |
| `post score [100] to [Ninjas], [highest score] wins` | Puts a score on a board. Pick **lowest score** for a race against the clock. Only the player's best score stays on the board |
| `my best on [Ninjas]` | The player's best score on that board |
| `top [10] on [Ninjas]` | The top scores as one line, like `1. Fred 120, 2. a player 90, 3. you 50`. Put it in a `say` block |
| `put top [10] on [Ninjas] in list [top scores]` | Fills a list with the top scores, one place per item, so the list shows on the stage |

## A small example

```text
when saves are ready
if <(saved [level]) = []> then
  save [level] as [1]
end
say (join [You are on level ] (saved [level]))

when I receive [level done]
save [level] as ((saved [level]) + (1))
post score (score) to [Ninjas], [highest score] wins
put top (10) on [Ninjas] in list [top scores]
```

To tell a signed-out player how to keep their progress:

```text
when saves are ready
if <not <signed in?>> then
  say [Sign in to keep your progress on every device] for (3) seconds
end
```

## The limits

| Limit | How much |
|---|---|
| Saved values for each player in one game | 16 |
| Letters in a name | 64 |
| Letters in all of a player's values together | 4096 |
| Letters in a board name | 40 |
| Places a top shows | 10 |

When a game is full, `save` does nothing and the Game data panel says so.
Forget a value to make room.

## Where saves go

| Player | Where | How long |
|---|---|---|
| Signed in, playing a shared game or a room game | On their Squiggle account, for that game only | Until the game or the account is deleted |
| Signed out, or a game that is not saved yet | In the browser on that device | Until the browser's data for Squiggle is cleared |

A signed-in save waits a second for more changes, then goes up in one go. If
Squiggle cannot be reached, the game keeps playing and the save tries again
by itself. The first time a player signs in and plays a game they have no
account saves for, the saves from that device go up to the account.

If the same player saves the same name on two devices at once, the save that
arrives last wins.

Scores need a signed-in player. A signed-out player's best stays on their
device, and their top shows only their own score.

On a board, a grown-up's name is shown to everyone. A child's name is shown
only to that child; everyone else sees `a player`.

## The Game data panel

Open **Settings**, then **Game settings**, then scroll to **Game data**. It
shows what your game saved for you while you tested it, your best on each
board, and buttons to **Reset my saves** and **Clear board**. Both ask before
they do anything. Only the person who made the game can clear a board.

## With Game Rules

Game data works the same in a game that also uses Game Rules. A Game Rules
game can still save player values and post scores from the server with
`save [VALUE] for [PLAYER]` and `post [SCORE] for [PLAYER] on [BOARD]`
(Scores and Rounds). Both kinds of save land in the same place, so `saved` and
`my best on` read them too.

## On the play page

A signed-in player sees a **Your progress** line under the game with how many
things the game saved and their best scores. A signed-out player sees a short
note asking them to sign in, but only once the game uses a Game data block.

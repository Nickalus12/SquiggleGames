Nick sends.

Flair: Devlog

# Squiggle 2.0: what changed, why, and what is next

Squiggle 2.0 is live. Here is what changed and why.

## What changed for makers

**Five new kits.** World builds big levels out of tiles and follows the action
with a camera. It comes with a tile painter that has its own zoom and pan, so
you can work on a level much bigger than the stage. Scenes switches between
levels, menus and cutscenes. Animate adds glides, bounces and costume clips.
Game Tools moves toward a spot, rolls a chance and sends messages with data.
3D turns a tile level into a first-person world you can walk through, and a
sprite can show a different picture for each of eight sides.

**Three game expansions.** Scores and Rounds, Teams and Items, and Arena build
on Together. Their blocks have a gold edge and go on one special sprite called
Game Rules. Those rules are meant to run on the game server, once for the
whole room, so every player sees the same score and the same winner.

To be clear about where this stands: the game server ships switched off in
2.0. You can build Game Rules, and the checker reads them, but the blocks that
connect a normal sprite to the game server are hidden until it is on.

**Rooms.** A room panel shows who is here, lets you follow a friend, invite
people and look at history. A presence bar over the stage shows everyone's
avatar. A sync chip tells you whether your edits have reached the room. If you
edit while offline, Keep my work asks whether your changes or the room's win,
then tells you how many of yours it kept.

**Everything else.** Night and Day themes. A project checker in the menu bar
that explains problems in plain words, with Show me and Fix it. A command
palette on Ctrl or Cmd+K. The tile painter on phones as a bottom sheet, and an
on-screen game pad in the player for touch screens.

## What changed underneath, and why

Squiggle used to be one program on one machine. Every room, save and chat line
went through it. That worked, but it meant one place for everything to go
wrong, and a game's state lived only in the players' browsers.

2.0 moves the service to Cloudflare. The pages, the API and the rooms are
separate Workers, and every room is its own Durable Object. A room is placed
near whoever opens it, so for a group in one area, edits and chat have a
shorter way to travel.

We want to be honest about what that buys. Server-side logic gives
consistency and persistence: one answer for scores, rounds, items and who is
alive, rules that a modified client cannot edit, and a game that can keep its
state when the host closes the tab. It does not lower input lag or raise your
frame rate. Your own sprite still moves on your own screen the moment you
press a key, and a server-checked action waits a round trip. The netcode for
games is a fixed 20 Hz server tick, prediction for your own sprite and
interpolation for everyone else.

Your account, password, projects, rooms, play links and consent all carried
over. Nobody needs a new account.

## What is next

Turning the game server on, so Game Rules run for real. After that, the
reference game we are building inside Squiggle itself: a Doom-style
first-person game made from World levels, the 3D kit and Arena rules, with
the phone game pad. It is a test of the tools as much as a game. If something
is hard to build in Squiggle, the reference game will find it first.

If something broke, post with the Bug flair, use `/bug` in Discord, or open an
issue on GitHub. The full list of changes is in the editor's CHANGELOG.md.

Nick sends.

# Squiggle 2.0

Squiggle 2.0 moves the whole service to Cloudflare and ships a new editor.
Five new kits: World builds
big levels out of tiles with a camera and a tile painter, Scenes switches
between levels, menus and cutscenes, Animate adds glides, bounces and costume
clips, Game Tools adds movement, chance and messages with data, and 3D turns a
tile level into a world you can walk through. Three game expansions build on
Together: Scores and Rounds, Teams and Items, and Arena. Their rule blocks go
on one Game Rules sprite, and the game server that runs them stays switched off
in this release. Rooms get a room panel, a presence bar, a sync chip and keep
my work. The editor has Night and Day themes, a
project checker, a command palette and a phone layout with the tile painter as
a sheet. Accounts, projects, rooms, play links and consent carry over
unchanged.

![The editor in a room](docs/images/editor-room.png)
![The editor on a phone](docs/images/editor-phone.png)
![The editor in the Night theme](docs/images/editor-night.png)
![A Game Rules sprite with gold rule blocks](docs/images/game-rules.png)
![The tile painter sheet on a phone](docs/images/phone-tiles.png)

## Added

- Five kits: World, Scenes, Animate, Game Tools and 3D.
- Three expansions that need Together: Scores and Rounds, Teams and Items, and
  Arena, with a Together Room badge on their library cards.
- The Game Rules sprite and Game setup. Rule blocks have a gold edge.
- The tile painter, with its own zoom and pan, and a bottom sheet on phones.
- Room panel, presence bar, sync chip, keep my work and a history that shows
  who changed what.
- A project checker with Show me and Fix it, a command palette on Ctrl or
  Cmd+K, and focus mode on Ctrl or Cmd+Shift+F.
- Night and Day themes with Auto.
- An on-screen game pad and action buttons in the player on touch screens.

## Changed

- Room protocol 2: joins resume, edits are acked, snapshots go over HTTP.
- A drifted room repairs from the room's head instead of reloading everyone.
- The service runs on Cloudflare Workers and Durable Objects. Rooms are placed
  near the players who open them.
- Chat keeps the last 50 lines.

## Fixed

- Rule blocks keep their gold edge under a block theme.
- Saves stop retrying on 401, 403 and 404 and say why.
- Custom fonts load in rooms.
- Long parallax backdrops wrap.
- Library badges meet contrast in Night and Day.

The full list is in [CHANGELOG.md](CHANGELOG.md).

If something broke, tell us in Discord `#help` or open an issue at
https://github.com/Nickalus12/SquiggleGames/issues/new/choose.

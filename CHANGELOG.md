# Changelog: Squiggle editor

Changes to the editor in this repository. The editor is versioned by the
Squiggle release it ships with; the hosted service reports its own version at
`/api/version`.

Entries before the repository split are not reproduced here. That history
described the service and the editor as one program, which they are not, and
splitting the narrative after the fact would have meant rewriting descriptions
of work rather than just moving files.

## 2.0.3 (2026-10-22)

### Changed

- The feedback button in the menu bar, and in the phone menu, now reads "Help and bugs". It opens the Help section of the Squiggle home page in a new tab, which points to the Squiggle Discord, What's new and GitHub issues, so a project in progress stays open.

## 2.0.2 (2026-10-22)

### Fixed

- A new project could open with a blank stage, with sprites listed but not drawn, and hovering a sprite then crashed the editor with "Oops! Something went wrong". It happened when the editor took longer to download than the starter project took to load, which was most first visits since 2.0.1. The stage is now ready before any project loads.

## 2.0.1 (2026-10-21)

### Fixed

- Undo in a room no longer rolls back a friend's later change to the same block. It stops with a note, and a second press skips that step and keeps going from before it. Redo is unchanged. The Together docs now explain undo in a room.

## 2.0.0 (2026-10-21)

The editor for Squiggle 2.0, which now runs on Cloudflare. 210 commits since
1.8.0, built by eight editor lanes.

### Added

- **Five new kits.** World builds big levels out of tiles and follows the
  action with a camera. Scenes switches between levels, menus and cutscenes.
  Animate makes sprites glide, bounce and play costume clips. Game Tools moves
  toward a spot, rolls a chance and sends messages with data. 3D turns your
  tile levels into a world you can walk through, and a sprite shows the
  picture that matches the side you see it from, in eight views.
- **Three game expansions that need Together:** Scores and Rounds, Teams and
  Items, and Arena. Their rule blocks go on a Game Rules sprite and draw with
  a gold edge. The game server that runs them stays switched off in this
  release, so the blocks that connect a game to it are hidden. Turning it on
  is what is next.
- **The tile painter.** Paint tiles over the stage, zoom and pan the painter
  on its own, and on a phone open it as a bottom sheet from the Tiles button.
  A Scenes button in the stage header opens the scene strip, and on a phone
  the scene sheet.
- **Together's new look.** New card art, a "Together Room" badge on every
  card that needs a room, filter pills for All, Multiplayer, Game World, FX and
  UI, and Classic, and a short Together sheet the first time you add it.
- **Room panel.** Who is in the room, your colour and shape, follow a friend,
  invite, the room's status, history and the room's library. On a phone it is
  the Room tab.
- **Presence bar** over the stage with everyone's avatar, a count and the
  quick phrase picker. Friends' rings, soft locks and typing carets show on the
  blocks they are working on.
- **Sync chip** that reads synced, syncing, reconnecting or offline.
- **Keep my work.** After editing offline you choose whether your changes or
  the room's win, and the editor tells you how many of your changes it kept.
- **History** rows show who made a change and what it was, and a restore asks
  first.
- **Project checker.** A pill in the menu bar checks fifteen things in plain
  words, with Show me and Fix it.
- **Command palette** on Ctrl or Cmd+K for commands, blocks, variables,
  sprites and the world, and **focus mode** on Ctrl or Cmd+Shift+F with a
  floating stage you can drag.
- **Night and Day themes** with an Auto choice that follows the device, a
  keyboard reachable theme menu, and the icon set redrawn on a 24 grid.
- **Game pad in the player.** On touch screens a game that listens for keys
  gets arrow and WASD pads and up to four action buttons.
- **A portability note.** Saving to your computer a project that uses
  Squiggle blocks says that it runs on squigglegames.app.

### Changed

- The editor speaks room protocol 2: joins resume where they left off, edits
  are acked, snapshots go over HTTP by sha, costumes and sounds go by file
  hash, and tile edits travel as patches under the relay's frame size.
- A drifted room repairs up to three sprites from the room's head instead of
  reloading everyone.
- The room socket dials `/ws/room/<slug>` on the 2.0 host.
- Kits register through one registry (`src/lib/kits/`), and kits draw through
  the world view, so text, effects, particles and health bars follow the
  camera.
- The phone block palette opens from a search icon in the top bar.
- Chat keeps the last 50 lines and follows the Day and Night colours.

### Fixed

- A block theme no longer removes the gold edge from rule blocks.
- Saves stop retrying on 401, 403 and 404 and say why.
- Custom fonts load in rooms that use HTTP snapshots.
- A long level's parallax backdrop wraps instead of running out of sky.
- The Requires glyphs and the Coming Soon tag meet 3:1 contrast in Night and
  Day.
- A kit that fails to load shows a kid-safe note instead of a browser alert.
- The closed phone menu sheet stays hidden whatever order the stylesheets load
  in.

## 1.8.0 (2026-10-20)

### Added

- **Room chat.** A chat panel sits beside the editor on desktop and opens as
  its own pane on the phone. Everyone in the room sees the same lines; there is
  no way to message one person privately. Players the server marks as needing
  the child-safe mode, and guests, get a set of quick phrases instead of a
  keyboard. The phrase list and the chat mode come from the server, so the
  editor never decides who may type.
- **Report a chat line in plain words.** The report sheet offers reasons a
  ten-year-old can read, and they match the reasons the server accepts.
- **Messages button with an unread badge** in the menu bar. It opens your
  messages in a new tab so the project stays open, and it is hidden when you
  are signed out.
- Co-play forwards the chat config, the phrase list and the server's reason
  for a blocked line to the panel around the player.

### Changed

- Chat controls use the account id the server sends for each player instead
  of guessing it from a name and colour, so Mute can no longer point at the
  wrong person when two players share both.
- Lint on `src/lib/collab` is clean and CI now fails a pull request that
  breaks it (#6).

### Fixed

- From UI review: button and badge contrast, touch targets of 44px, a menu
  bar that no longer shifts when a badge appears, phrase chips a mouse wheel
  can scroll, and a composer that stays reachable on landscape phones.
- Join no longer sends an `undefined` token when there is none (#6).

## 1.7.0 (2026-10-20)

### Added

- **The editor works on a phone.** On a narrow screen it switches to one pane
  at a time: a top bar with the project name and menu, tabs along the bottom
  for Code, Costumes, Sounds and Stage, a sprite row, and a small stage button
  that keeps the game in view while you edit.
- **On-screen keys for games.** Arrow and space buttons appear over the stage
  on touch screens, showing only the keys the project actually uses and staying
  clear of the tab bar.
- The editor tracks phone, tablet and desktop layout modes, the stage can take
  a fixed width, and the block flyout can be narrower, which is what lets the
  phone layout fit.
- The playground page has a viewport tag for phones and allows pinch zoom.

### Fixed

- The phone stage draws when it becomes visible instead of staying blank until
  the first resize.
- The room pane is readable on a phone, and toasts clear the top bar.
- The phone menu sheet works from the keyboard, with better contrast and
  larger targets.
- The FPS and interpolation labels no longer show in embed and player mode.
- Room messages no longer use em dashes.

## 1.6.0 (2026-10-20)

### Fixed

- **Editor sync no longer loses, duplicates or silently reverts edits** around
  reconnects, refusals and moderation. Queued edits stay queued until the
  editor has decided whether to keep its own copy or take the room's.
- **Offline work can no longer overwrite a room that moved on**, and role
  changes, viewer games and server closes are noticed instead of ignored.
- **A refused save keeps the other pending saves**, and host-only refusals and
  blocked viewer game text show the right message.
- **Large projects respect the server's per-socket byte budget**, and a frame
  the server closed as too large is no longer sent again after every
  reconnect.
- The client keeps the server's close code, so a tab kicked for flooding can
  say why.
- Masked costume, sound and sprite names and block comments are masked on the
  sender's screen too.
- A malformed workspace update no longer leaves local block edits unsent for
  the rest of the session.
- File > New, Load from your computer and restore points no longer try to
  replace a shared room.
- A `?server=` link can no longer hand the device token to someone else's
  server.
- The Together game blocks keep working after the second project load in a
  room.


- **A page restored from the back-forward cache checks the connection is
  alive again.** Leaving closed the socket and stopped the heartbeat, and
  coming back reopened the socket but never restarted the heartbeat, so a
  connection that died silently after a restore (wifi changed, laptop slept)
  showed a green presence dot while every edit went nowhere. The heartbeat
  now starts with every socket, not just the first. It also no longer tears
  down a connection for silence while the tab is hidden, where timers are
  throttled and silence means nothing.

- **A server that accepts the socket and then refuses the join no longer
  gets retried every second forever.** The reconnect backoff reset when the
  socket opened, before the room had said yes, so an accept-then-close loop
  pinned the retry at its minimum. The backoff resets on the welcome now,
  and each retry is jittered so a room full of clients does not come back
  in lockstep after an outage.

- **Only the newest unsent snapshot is kept while offline.** Snapshots are
  whole projects, and edits made across a long disconnection queued one
  after another, megabytes of superseded project copies that all flushed,
  oldest first, on reconnect. A newer snapshot now replaces any queued one,
  carrying its force/reset flags with it.

- **The "you are watching" banner no longer sits on top of the menu bar.** It
  was a fixed bar at the top of the window, and unlike a toast it never goes
  away, so for as long as you were a viewer it covered File, Edit, Addons, the
  project name and Save. The banner hid the controls it was telling you about.
  It takes its own space now: the editor root is inset by the bar's measured
  height, re-measured when the text wraps on a narrow window, and a resize is
  fired so Blockly re-reads its geometry rather than dropping blocks a banner's
  height away from the pointer.

- **Leaving a room hands the seat back before the next page asks who is in it.**
  Browsers do close the socket when you navigate away, but on their own
  schedule, and the dashboard fetches the room list immediately, so you could
  walk out of a room and be told you were still in it. The client now closes on
  `pagehide`, which puts the close frame ahead of that first request. The
  session is kept rather than torn down, so a page restored from the bfcache
  reconnects instead of coming back to a dead editor.

- **A snapshot that fails to load says so instead of leaving a half-built
  project on screen.** A load that throws part-way installs the targets from
  the project JSON without the assets and render skins behind them, and the
  result looks almost right: sprite names, coordinates and panels all present,
  stage and sprite thumbnails blank, nothing saying why. That was a
  `console.error` and nothing else. It now asks the room for the project again,
  rate limited, and forced past the "same bytes" check, and tells the person
  watching that it is retrying.

### Changed

- A refusal in co-play chat now carries the server's warning with it, so the
  panel around the player can show what was recognised and what it costs the
  account rather than a line in the chat log. The editor forwards it and does
  not re-derive any of it, the decision is the server's.

## 1.5.0

### Added

- **`when I receive any game message`.** Asked for by a player: naming every
  message up front is fine until you are writing the thing that logs them,
  relays them, or reacts to whatever the other player just did, and then it is
  one hat block per message, edited again whenever the game changes. Inside the
  new hat, `game message name` and `game message value` tell you which one
  arrived, so one script can handle all of them.

### Fixed

- **Watching a project no longer looks like editing one.** A viewer was handed
  a working editor: `canEdit` arrived with the welcome, was shown in a toast
  that faded in under three seconds, and then nothing consulted it. Every edit
  applied locally, went to the server, and was refused there in silence, the
  error handler knew three codes and dropped the rest, `read-only` among them,
  until the next snapshot erased the lot. Viewers now send nothing, the
  workspace and the palette stop accepting edits, every structural change is
  refused at the call rather than half-applied, and the reason stays on screen
  instead of fading.
- **A project too large to save said so.** `bad-snapshot`, the size cap, which
  means nothing is reaching disk any more, was one of the errors being
  dropped. It gets a banner now, and anything unrecognised at least gets a
  toast.
- **Costumes and sounds are addressed by identity, not position.** An index is
  a fact about one editor's list at one moment: a partner adding, deleting or
  reordering a costume renumbers everything below it, so "delete costume 3"
  sent when 3 was the hat arrived where 3 was the whole drawing. Blocks already
  routed by sprite name; the two lists that never got that lesson now carry a
  name and an asset id, and a message whose costume is not here does nothing
  rather than acting on whatever occupies the slot.
- **Continuous editing is saved.** The snapshot debounce was re-armed by every
  edit and guards the only path to disk, so painting or dragging blocks without
  ever pausing the minimum wait saved nothing at all. The deferral now has a
  ceiling.
- **A dead connection is noticed.** A socket whose path died without a close
  frame stayed open in the tab forever with the presence dot green. The editor
  keeps its own clock now, and a handshake left hanging gets a deadline.
- **Dropped edits ask for a fresh copy.** Four buffers silently discarded
  relayed edits when full, edits nothing would ever resend, because the sender
  never learns they went missing. Each now repairs itself rather than leaving
  two people looking at different projects.
- **Game messages no longer read each other's values.** Two arriving in one
  frame both wrote `game message name` before either script ran, so both scripts
  saw the second one, rare enough with `when I receive [score]` to look like a
  glitch, and the normal case for a script handling several kinds. Each started
  script now carries the message it woke on. Broadcasting had the same bug
  locally and worse: `broadcast score` then `broadcast lives` in one frame is an
  ordinary pair, and both hats read "lives". A game behaves the same now
  whoever sent the message, which matters more than the frame it costs, a bug
  that only appears when *you* are the host is the worst kind to be told about.
- **A `forever` loop cannot flood the room.** `forever [broadcast game
  message]` sends at the frame rate, and the server relays game traffic
  reliably, unthrottled, fanned out per peer, six players was 900 relayed
  messages a second from one loop nobody thought was unusual. There is a budget
  now: under it nothing changes, over it messages coalesce by name and flush
  next frame, so distinct events still all arrive.
- **A second project load no longer stacks another copy of the extension.**
  `dispose()` left its runtime listeners attached, so the step handler ran once
  per project ever opened, each with its own inbox, all firing hats into the
  current one. Shared variables were left behind for the next project to read
  as though they were current, too.
- **`player count` counts you.** It returned 0 while connected-but-not-yet-named
  and 1 when there was no bridge at all, so it read 1 alone offline, 0 alone
  online, and any game checking `= 1` or dividing by it broke for the first
  second of every session.
- **`change shared variable by` cannot lose a point.** It computed the new
  value locally and sent that, so two players scoring at once both read 5, both
  wrote 6, and one child's point vanished. The increment now travels as an
  increment. Requires a server new enough to understand it.
- **Comment bodies are not overwritten while you type in them**, and comments
  cost one pair of document listeners between them rather than two each, forty
  comments used to force eighty layouts on every click anywhere in the editor.
- **The History panel says why it failed.** Every failure collapsed into "Could
  not read the history", so a permission problem, a signed-out session and a
  real outage were indistinguishable, impossible to diagnose from a
  screenshot, which is exactly how it arrived. The server sends a reason and the
  panel shows it, restore included, where the likely answer is that only the
  host may put a version back.
- Frame interpolation is on by default whether or not you opened a room link;
  History works against the dev server; a session that ends actually stops.

### Changed

- This repository is now the editor alone. The Squiggle server moved to a
  separate, private repository; the two programs exchange data over a
  WebSocket rather than being built or licensed together. See the README's
  [License](./README.md#license) section for what that means for reuse.
- `README.md` and `CONTRIBUTING.md` rewritten around the editor: how to run it,
  where the collab client lives, and what a PR here can change.

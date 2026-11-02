# Peer palette

Source of truth: `scratch-gui/src/lib/themes/peers.js`. The editor overlay and the profile pages must render the same avatar for the same peer id, so any other renderer copies this table and the algorithm below exactly.

A peer avatar is a filled shape in one colour on a 20 by 20 grid, with the peer initial or glyph on top in the ink listed for that colour: dark `#10142a` or white `#ffffff`, whichever clears 4.5:1 on that fill. Every fill also clears 3:1 against the Night (#10142a, #161c36) and Day (#f7f6fc, #ffffff) page and panel surfaces. Colour is never the only signal: the shape carries identity too.

On the purple menu bar the fills fall under 3:1, so an avatar drawn there gets a 1px `#ffffff` outline (`outlineOnBar` in every style, token `--sq-peer-outline-bar`), which clears 5:1 on both gradient stops.

## Colours

| Index | Id | Name | Hex | Ink |
|---|---|---|---|---|
| 0 | coral | Coral | `#e8505b` | `#10142a` |
| 1 | orange | Orange | `#d9700a` | `#10142a` |
| 2 | amber | Amber | `#b88700` | `#10142a` |
| 3 | lime | Lime | `#5f9e1b` | `#10142a` |
| 4 | green | Green | `#1f9d55` | `#10142a` |
| 5 | teal | Teal | `#0f9488` | `#10142a` |
| 6 | cyan | Cyan | `#0e8fb3` | `#10142a` |
| 7 | blue | Blue | `#3f82e3` | `#10142a` |
| 8 | indigo | Indigo | `#5b5fe8` | `#ffffff` |
| 9 | violet | Violet | `#9152e0` | `#ffffff` |
| 10 | magenta | Magenta | `#c94fb5` | `#10142a` |
| 11 | rose | Rose | `#e0457b` | `#10142a` |

## Shapes

SVG `viewBox="0 0 20 20"`, one `<path>` with the given `fill-rule`.

| Index | Id | Name | fill-rule | d |
|---|---|---|---|---|
| 0 | circle | circle | nonzero | `M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z` |
| 1 | square | square | nonzero | `M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z` |
| 2 | triangle | triangle | nonzero | `M10 2.5l8 14.5H2z` |
| 3 | diamond | diamond | nonzero | `M10 2l8 8-8 8-8-8z` |
| 4 | star | star | nonzero | `M10 2.2L12.12 7.69L17.99 8L13.42 11.71L14.94 17.4L10 14.2L5.06 17.4L6.58 11.71L2.01 8L7.88 7.69z` |
| 5 | ring | ring | evenodd | `M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z` |

## Palette for 20 players

Game rooms seat up to 20 players (`MAX_PEERS = 20`). `PEER_PALETTE` and `playerPeerStyle(slot)` assign each 1-based player slot (`1..20`) a distinct `(colour, shape)` pair with a kid-readable two-word name (`"{Colour} {shape}"`). For index `i` in `0..19`:

- `colourIndex = i % 12`
- `shapeIndex = (i < 12 ? i : i + 1) % 6`
- `slot = (shapeIndex * 12) + colourIndex`

The first 12 players get all 12 colours with every adjacent pair differing in both colour and shape. Players 13 through 20 reuse the first 8 colours shifted to the next shape so all 20 slots are distinct.

| Player slot | Slot | Colour | Shape | Name | Hex | Ink |
|---|---|---|---|---|---|---|
| 1 | 0 | coral | circle | Coral circle | `#e8505b` | `#10142a` |
| 2 | 13 | orange | square | Orange square | `#d9700a` | `#10142a` |
| 3 | 26 | amber | triangle | Amber triangle | `#b88700` | `#10142a` |
| 4 | 39 | lime | diamond | Lime diamond | `#5f9e1b` | `#10142a` |
| 5 | 52 | green | star | Green star | `#1f9d55` | `#10142a` |
| 6 | 65 | teal | ring | Teal ring | `#0f9488` | `#10142a` |
| 7 | 6 | cyan | circle | Cyan circle | `#0e8fb3` | `#10142a` |
| 8 | 19 | blue | square | Blue square | `#3f82e3` | `#10142a` |
| 9 | 32 | indigo | triangle | Indigo triangle | `#5b5fe8` | `#ffffff` |
| 10 | 45 | violet | diamond | Violet diamond | `#9152e0` | `#ffffff` |
| 11 | 58 | magenta | star | Magenta star | `#c94fb5` | `#10142a` |
| 12 | 71 | rose | ring | Rose ring | `#e0457b` | `#10142a` |
| 13 | 12 | coral | square | Coral square | `#e8505b` | `#10142a` |
| 14 | 25 | orange | triangle | Orange triangle | `#d9700a` | `#10142a` |
| 15 | 38 | amber | diamond | Amber diamond | `#b88700` | `#10142a` |
| 16 | 51 | lime | star | Lime star | `#5f9e1b` | `#10142a` |
| 17 | 64 | green | ring | Green ring | `#1f9d55` | `#10142a` |
| 18 | 5 | teal | circle | Teal circle | `#0f9488` | `#10142a` |
| 19 | 18 | cyan | square | Cyan square | `#0e8fb3` | `#10142a` |
| 20 | 31 | blue | triangle | Blue triangle | `#3f82e3` | `#10142a` |

## Assignment

There are 72 slots (12 colours by 6 shapes). Slot `s` maps to colour `s % 12` and shape `floor(s / 12)`.

1. Hash: FNV-1a 32 bit over the UTF-16 code units of `String(id)`. Start at `0x811c9dc5`; for each code unit, XOR it in, then multiply by `0x01000193` modulo 2^32 (unsigned).
2. Lone peer (a profile page, one cursor): slot = hash % 72. This is `peerStyle(id)`.
3. A room (`assignPeerStyles(ids)`) of n peers: dedupe ids, sort by (hash % 72, id) ascending. For the k-th peer in that sorted order (`k` from 1 to `n`), let `stepCount = n <= 8 ? n : max(8, k)`, and set `colourCap = ceil(stepCount / 12)` and `shapeCap = ceil(stepCount / 6)`. Give each peer in that order the first free slot at or after its own, wrapping at 72, whose colour is held fewer than `colourCap` times and whose shape is held fewer than `shapeCap` times. If no slot qualifies, take the first free slot. The result does not depend on the order the ids arrive in.

So a room of up to 6 peers has 6 different colours and 6 different shapes, any room of up to 8 peers (and the first 8 sorted peers in a larger room) keeps the exact same assignments as before, a room of up to 12 has 12 different colours with no shape used more than twice, and a room of 20 peers gives all 20 peers distinct `(colour, shape)` slots with no colour used more than twice and no shape used more than 4 times.

## Check values

A port is correct when it reproduces these.

| id | hash % 72 | colour | shape | name |
|---|---|---|---|---|
| `abc` | 35 | rose | triangle | Rose triangle |
| `peer-0` | 36 | coral | diamond | Coral diamond |
| `peer-1` | 71 | rose | ring | Rose ring |
| `sprout` | 8 | indigo | circle | Indigo circle |
| `42` | 11 | rose | circle | Rose circle |

Room check (5 peers): `assignPeerStyles(["abc","peer-0","peer-1","sprout","42"])`.

| id | slot | colour | shape | name |
|---|---|---|---|---|
| `abc` | 35 | rose | triangle | Rose triangle |
| `peer-0` | 37 | orange | diamond | Orange diamond |
| `peer-1` | 50 | amber | star | Amber star |
| `sprout` | 8 | indigo | circle | Indigo circle |
| `42` | 12 | coral | square | Coral square |

Room check (20 peers): `assignPeerStyles(["peer-0", ..., "peer-19"])`.

| id | slot | colour | shape | name |
|---|---|---|---|---|
| `peer-0` | 57 | violet | star | Violet star |
| `peer-1` | 4 | green | circle | Green circle |
| `peer-2` | 56 | indigo | star | Indigo star |
| `peer-3` | 69 | violet | ring | Violet ring |
| `peer-4` | 71 | rose | ring | Rose ring |
| `peer-5` | 3 | lime | circle | Lime circle |
| `peer-6` | 70 | magenta | ring | Magenta ring |
| `peer-7` | 1 | orange | circle | Orange circle |
| `peer-8` | 44 | indigo | diamond | Indigo diamond |
| `peer-9` | 12 | coral | square | Coral square |
| `peer-10` | 61 | orange | ring | Orange ring |
| `peer-11` | 28 | green | triangle | Green triangle |
| `peer-12` | 2 | amber | circle | Amber circle |
| `peer-13` | 29 | teal | triangle | Teal triangle |
| `peer-14` | 15 | lime | square | Lime square |
| `peer-15` | 42 | cyan | diamond | Cyan diamond |
| `peer-16` | 30 | cyan | triangle | Cyan triangle |
| `peer-17` | 43 | blue | diamond | Blue diamond |
| `peer-18` | 48 | coral | star | Coral star |
| `peer-19` | 14 | amber | square | Amber square |

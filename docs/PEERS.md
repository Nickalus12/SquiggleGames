# Peer palette

Source of truth: `scratch-gui/src/lib/themes/peers.js`. The editor overlay and the profile pages must render the same avatar for the same peer id, so any other renderer copies this table and the algorithm below exactly.

A peer avatar is a filled shape in one colour on a 20 by 20 grid, with the peer initial or glyph on top in the ink listed for that colour: dark `#10142a` or white `#ffffff`, whichever clears 4.5:1 on that fill. Every fill also clears 3:1 against the Night (#10142a, #161c36) and Day (#f7f6fc, #ffffff) page and panel surfaces. Colour is never the only signal: the shape carries identity too.

On the purple menu bar the fills fall under 3:1, so an avatar drawn there gets a 1px `#ffffff` outline (`outlineOnBar` in every style, token `--sq-peer-outline-bar`), which clears 5:1 on both gradient stops.

## Colours

| Index | Id | Hex | Ink |
|---|---|---|---|
| 0 | coral | `#e8505b` | `#10142a` |
| 1 | orange | `#d9700a` | `#10142a` |
| 2 | amber | `#b88700` | `#10142a` |
| 3 | lime | `#5f9e1b` | `#10142a` |
| 4 | green | `#1f9d55` | `#10142a` |
| 5 | teal | `#0f9488` | `#10142a` |
| 6 | cyan | `#0e8fb3` | `#10142a` |
| 7 | blue | `#3f82e3` | `#10142a` |
| 8 | indigo | `#5b5fe8` | `#ffffff` |
| 9 | violet | `#9152e0` | `#ffffff` |
| 10 | magenta | `#c94fb5` | `#10142a` |
| 11 | rose | `#e0457b` | `#10142a` |

## Shapes

SVG `viewBox="0 0 20 20"`, one `<path>` with the given `fill-rule`.

| Index | Id | fill-rule | d |
|---|---|---|---|
| 0 | circle | nonzero | `M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z` |
| 1 | square | nonzero | `M5 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z` |
| 2 | triangle | nonzero | `M10 2.5l8 14.5H2z` |
| 3 | diamond | nonzero | `M10 2l8 8-8 8-8-8z` |
| 4 | star | nonzero | `M10 2.2L12.12 7.69L17.99 8L13.42 11.71L14.94 17.4L10 14.2L5.06 17.4L6.58 11.71L2.01 8L7.88 7.69z` |
| 5 | ring | evenodd | `M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15zM10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z` |

## Assignment

There are 72 slots (12 colours by 6 shapes). Slot `s` maps to colour `s % 12` and shape `floor(s / 12)`.

1. Hash: FNV-1a 32 bit over the UTF-16 code units of `String(id)`. Start at `0x811c9dc5`; for each code unit, XOR it in, then multiply by `0x01000193` modulo 2^32 (unsigned).
2. Lone peer (a profile page, one cursor): slot = hash % 72. This is `peerStyle(id)`.
3. A room (`assignPeerStyles(ids)`) of n peers: dedupe ids, sort by (hash % 72, id) ascending. Set colourCap = ceil(n / 12) and shapeCap = ceil(n / 6). Give each peer in that order the first free slot at or after its own, wrapping at 72, whose colour is held fewer than colourCap times and whose shape is held fewer than shapeCap times. If no slot qualifies, take the first free slot. The result does not depend on the order the ids arrive in.

So a room of up to 6 peers has 6 different colours and 6 different shapes, and a room of up to 12 has 12 different colours with no shape used more than twice.

## Check values

A port is correct when it reproduces these.

| id | hash % 72 | colour | shape |
|---|---|---|---|
| `abc` | 35 | rose | triangle |
| `peer-0` | 36 | coral | diamond |
| `peer-1` | 71 | rose | ring |
| `sprout` | 8 | indigo | circle |
| `42` | 11 | rose | circle |

Room check: `assignPeerStyles(["abc","peer-0","peer-1","sprout","42"])`.

| id | slot | colour | shape |
|---|---|---|---|
| `abc` | 35 | rose | triangle |
| `peer-0` | 37 | orange | diamond |
| `peer-1` | 50 | amber | star |
| `sprout` | 8 | indigo | circle |
| `42` | 12 | coral | square |

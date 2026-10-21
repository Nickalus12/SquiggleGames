# Peer palette

Source of truth: `scratch-gui/src/lib/themes/peers.js`. The editor overlay and the profile pages must render the same avatar for the same peer id, so any other renderer copies this table and the algorithm below exactly.

A peer avatar is a filled shape in one colour on a 20 by 20 grid, with the peer initial or glyph in white ink (`#ffffff`) on top. Every colour clears 3:1 against Night (#10142a, #161c36) and Day (#f7f6fc, #ffffff) surfaces and against white ink at avatar size, so colour is never the only signal: the shape carries identity too.

## Colours

| Index | Id | Hex |
|---|---|---|
| 0 | coral | `#e8505b` |
| 1 | orange | `#d9700a` |
| 2 | amber | `#b88700` |
| 3 | lime | `#5f9e1b` |
| 4 | green | `#1f9d55` |
| 5 | teal | `#0f9488` |
| 6 | cyan | `#0e8fb3` |
| 7 | blue | `#3b7ddd` |
| 8 | indigo | `#6366f1` |
| 9 | violet | `#9b5de5` |
| 10 | magenta | `#c94fb5` |
| 11 | rose | `#e0457b` |

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
3. A room (`assignPeerStyles(ids)`): dedupe ids, sort by (hash % 72, id) ascending, then give each peer in that order the first slot at or after its own, wrapping at 72, whose colour no earlier peer holds and whose slot is free. When all 12 colours are taken, fall back to the first free slot. The result does not depend on the order the ids arrive in. Rooms hold at most 12 peers, so every peer in a room has a distinct colour.

## Check values

A port is correct when it reproduces these.

| id | hash % 72 | colour | shape |
|---|---|---|---|
| `abc` | 35 | rose | triangle |
| `peer-0` | 36 | coral | diamond |
| `peer-1` | 71 | rose | ring |
| `sprout` | 8 | indigo | circle |
| `42` | 11 | rose | circle |

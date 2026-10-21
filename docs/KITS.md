# Kits: how a kit plugs into the editor

Squiggle 2.0 kits run on the stock scratch-vm pin and TurboWarp scratch-render. Nothing is forked or patched. A kit uses three seams in `scratch-gui/src/lib`, and each does nothing until a kit calls it, so a 1.8 project behaves exactly as before.

## 1. Register the kit (`kits/registry.js`)

```js
import {registerKit} from '../../../kits/registry.js';
registerKit({id: 'squiggleworld', layers: ['sq-tiles-back', 'sq-tiles-front'], provides: ['world'], extension: WorldBlocks});
```

| Field | Rule |
|---|---|
| `id` | lowercase letters and digits. Reserved: `squiggleworld`, `squigglescenes`, `squiggleanimate`, `squiggletools`, `squiggle3d`, and the expansions `squigglescores`, `squiggleteams`, `squigglearena`. `together` is not a kit. |
| `name`, `color` | Needed only for a new id. Reserved ids keep their name and `#rrggbb` color, which is `KIT_COLORS[id].color1` in `src/lib/themes/tokens.js`; tokens.js is the source and the registry copies it. |
| `togetherRequired` | True for the three expansions and cannot be changed for a reserved id. |
| `layers` | Any of `sq-tiles-back`, `sq-tiles-front`, `sq-hud`. |
| `provides` | `'world'` switches world mode on for projects that use the kit (see 2). |
| `extension` | The extension class. One per id. |

The renderer draws layers in this order: `background, video, sq-tiles-back, pen, sprite, sq-tiles-front, sq-hud`. A kit creates drawables with `renderer.createDrawable('sq-hud')`. The editor loads a kit through one import line in `src/lib/kits/builtin.js`. Send that line to sqv2-lead as a review bead; kit lanes do not edit it. `installBuiltinKits` then adds each kit's extension once, from `src/reducers/vm.js`. Also exported: `getKit`, `isKit`, `listKits`, `requiresTogether`, `worldKitIds`, `builtinKits`, `LAYER_ORDER`, `KIT_LAYERS`.

## 2. World seams (`world/seams.js`)

`stage.jsx` calls `installWorldSeams(vm)` once after `attachRenderer`. After that, `window.SquiggleWorld` is set and a `SquiggleWorldReady` event fires. Read it inside the extension as `window.SquiggleWorld`.

| Call | Effect |
|---|---|
| `setCamera(progress => ({x, y, zoom}))` | Sets a view in world units. `progress` runs 0 to 1 between steps when interpolation is on. Returns a disposer. `null` clears the camera. |
| `getView()`, `toView(x, y)`, `toWorld(x, y)` | The current view, and conversion from world to stage (`{x, y, scale}`) and back. |
| `hook(name, fn)` | `fn(next, ...args)` replaces the stock call. Call `next(...args)` to keep stock behavior. Returns a disposer. |
| `onBeforeExecute(fn)`, `onAfterExecute(fn)` | Run around every VM step. Each returns a disposer. |
| `isWorldMode()`, `setWorldMode(on)`, `refreshWorldMode()` | World mode turns fencing off, so sprites can leave the stage. |

| Hook | Arguments after `next` |
|---|---|
| `drawablePosition` | `drawableID, [x, y]` |
| `drawableDirectionScale` | `drawableID, direction, [sx, sy]` |
| `drawableProperties` | `drawableID, properties` |
| `drawableEffect` | `drawableID, effectName, value` (`setEffect` and `clearEffects` on a target) |
| `bubble` | `target` (the looks bubble placement) |
| `touchingEdge` | `target` |
| `edgeBounce` | `target` |
| `toggleScript` | `topBlockId, opts` (the rules sprite is skipped before the hook) |

With a camera set, drawing, picking, `mouse x` and `mouse y` all go through the view. World mode switches on when a loaded project has blocks or runtime storage of a kit that provides `'world'`, or when such a kit is added.

## 3. Project seam (`collab/project-seam.js`)

The Game Rules sprite is marked with `target.extensionStorage.together = {role: 'rules', v: 1}`. Stock `vm.toJSON` drops storage for extensions with no blocks. The seam keeps it, so the mark survives save, sprite export and collab snapshots. Use `isRulesTarget(target)` and `markRulesTarget(target)`. To keep a kit's own project-level data (for example level maps in `runtime.extensionStorage.squiggleworld`), call `preserveExtensionStorage('squiggleworld')` once when the kit loads.

## 4. 3D views (`squiggle3d`)

`show me in 3D as 8 views` picks a costume named `NAME-1` to `NAME-8` from where the viewer stands, following Doom exactly. `NAME-1` faces the viewer. The numbers go clockwise around the sprite as seen from above: `NAME-3` faces the viewer's left (its left side shows), `NAME-5` shows its back, `NAME-7` faces the viewer's right (its right side shows), and 2, 4, 6 and 8 are the diagonals in between in that order. A sheet drawn for Doom works unchanged. A missing view keeps the current costume.

## Known gaps

- Sprite dragging in `src/containers/stage.jsx` still converts in stage space. A world kit with a camera needs a CR to the lead for that.
- Green flag still starts rules sprite scripts until Together 2 adds its `removeExecutable` guard. Clicking a script is already blocked.
- Pen, stamp and `go to random position` stay inside the stage rectangle.

## Tests

From `scratch-gui/`: `node src/lib/world/world-seams.test.mjs`, `node src/lib/kits/registry.test.mjs`, `node src/lib/collab/project-seam.test.mjs`. The world contract test fails if a scratch-vm or scratch-render bump moves anything a seam wraps. CI also fails if the gzipped editor grows more than 150 KB, or the player more than 60 KB, over `scratch-gui/size-baseline.json` (`node size-check.mjs` after a production build).

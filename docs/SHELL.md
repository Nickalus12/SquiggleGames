# Squiggle editor shell

The plan for making the editor chrome Squiggle's own. The shell is everything around the blocks, the paint editor and the stage: the bar along the top, the tabs, the stage header, the sprite pane, menus, modals, alerts, the loading screen, the phone shell and the player pages. Block colours and kit colours are not part of the shell and do not change.

Binding brief: `collab-server/design.md` in the site repo (identity, shape language, type scale, targets, voice, the Never list). Site tokens: `collab-server/theme.css`. The editor does not import theme.css; `src/lib/themes/tokens.js` mirrors it.

## 1. Inventory: what a kid sees today

Baseline screenshots: `ui-shots/shell/before/` in the session scratchpad (editor at 1280 and 412, Settings open, player page).

### Chrome surfaces

| Surface | Where | What is TurboWarp or Scratch in it today |
|---|---|---|
| Menu bar | `components/menu-bar/menu-bar.jsx` | No Squiggle mark anywhere. Settings first, then File, Edit, Addons. "See Project Page" (TurboWarp's community button). "Help and bugs" as a stray button. Errors menu links to the TurboWarp author's Scratch profile. 12px bold labels. Dropdown caret is Scratch's 8x5 PNG-like SVG |
| File menu | same | "Package project" opens packager.turbowarp.org. "Restore points", "Save to separate file..." are TurboWarp jargon. Title Case strings |
| Edit menu | same | "Turn on 60 FPS Mode" duplicates Game settings. "Cloud Variables are not Available", "Change Username" in Title Case |
| Settings menu | `settings-menu.jsx`, `tw-theme-*.jsx` | "Block Colors" offers "Customize in Addon Settings". Accent menu describes TurboWarp red. Rainbow and filled-circle icons beside line icons |
| Menus (all) | `components/menu/menu.jsx`, `tw-menu-label.jsx` | Plain `li` with click handlers: no roles, no keyboard, no focus. 34px rows, 12px text |
| Tabs | `components/gui/gui.css` | Scratch's overlapping folder tabs, 1rem top radius, 12px labels, 80 to 90% height |
| Palette and categories | scratch-blocks | Category circles are block colours (kept). Find bar from the find-bar addon |
| Extension button | `gui/icon--extensions.svg` | Scratch's Sketch-drawn icon on a square purple tile |
| Stage header | `stage-header.jsx`, `tw-framerate-indicator` | "Interpolation" and "{n} FPS" labels (TurboWarp words). Sketch-drawn stage size and fullscreen icons. Green flag and stop sign |
| Sprite info row | `sprite-info.jsx` | Sketch-drawn x, y, eye icons at 16px. 12px labels |
| Add sprite and backdrop | `action-menu/icon--*.svg` | The Scratch cat face on the add sprite button. Scratch's surprise, paint, upload, search glyphs. "Choose a Sprite", "Upload Sprite" in Title Case |
| Backpack | `backpack.jsx` | Scratch's backpack bar, 12px |
| Modals | `components/modal/modal.css` | Scratch header: 50px bar, 4px translucent border, Scratch round close and back icons |
| Alerts | `components/alerts` | Scratch alert shapes. Cloud alert links to scratch.mit.edu FAQ |
| Loading | `components/loader`, `playground/index.ejs` | Scratch's stacking blocks loader. Splash noscript points at TurboWarp Desktop. Splash error links to the TurboWarp author's Scratch profile |
| Phone shell | `components/phone-shell` | Already Squiggle (sq-icon). Menu sheet inherits the desktop bar and so inherits its problems |
| Player page (index.html) | `playground/render-interface.jsx` | scratch.mit.edu project URL box, "a Scratch mod that compiles projects to JavaScript", footer with TurboWarp Desktop, Packager, docs.turbowarp.org, GitHub TurboWarp, "Feedback & Bugs" to the TurboWarp author. "See inside" button |
| Embed and fullscreen | `playground/embed.jsx`, `fullscreen.jsx`, `tw-invalid-embed` | Invalid embed page tells you to use turbowarp.org embed URLs and links docs.turbowarp.org |
| Default sprite | `lib/default-project` | Dango cat by a Scratch community artist (credited in its README). Not the Scratch cat |

### Identity grep

Command: `rg -n -i "turbowarp|scratch\.mit\.edu|\bAddons?\b|See Project Page" src static` without imports. 1539 hits. 1300 of them sit in `src/addons/**` (addon code, manifests, addon translations) and in `src/lib/tw-translations/generated-translations.json`; those are internal identifiers or text only shown on the Addons page. Every other hit:

| File | Hit | Decision |
|---|---|---|
| `src/addons/**`, generated translations, addons-l10n | Addon ids, addon page strings, upstream URLs | Keep. Not shown once the Addons page leaves the chrome |
| `components/menu-bar/menu-bar.jsx` | Addons button, two GarboMuffin profile links, upstream comment on the help link | Remove Addons button. Errors menu points to `/#help` with new copy. Comment removed |
| `components/menu-bar/community-button.jsx` | "See Project Page" | Reword: "Preview", new id |
| `components/menu-bar/tw-see-inside.jsx` | "See inside" (player) | Reword: "Open in editor", new id |
| `components/menu-bar/tw-theme-blocks.jsx` | "Customize in Addon Settings" | Remove the link |
| `components/menu-bar/tw-theme-accent.jsx` | Descriptions mention TurboWarp red | Keep (translator descriptions, not shown) |
| `components/menu-bar/tw-news.jsx` | TurboWarp news banner about a Scratch bug | Remove from the menu bar |
| `components/menu-bar/author-info.jsx` | Link to scratch.mit.edu project | Keep. Only renders for Scratch-hosted projects, which Squiggle does not load from the editor |
| `components/sq-icon/icons.js` | `addons` glyph | Remove with the button |
| `playground/render-interface.jsx` | Footer (TurboWarp Desktop, Packager, docs, GitHub, GarboMuffin), homepage blurb, unshared-project docs link, scratch.org disclaimer | Replace footer with Squiggle attribution (below). Replace blurb. Remove project URL box and unshared box. Keep the not-affiliated line |
| `playground/index.ejs` | noscript TurboWarp Desktop link, error report link | Reword both, report link to `/#help` |
| `playground/embed.jsx` | Upstream URL comments | Keep (comments in upstream file, untouched) |
| `playground/addon-settings.jsx` | `turbowarp-addon-settings.json` filename | Keep. Addons page only |
| `playground/render-gui.jsx` | `clouddata.turbowarp.org` default cloud host | Keep for this pass, flagged in Risks. Service choice, not chrome |
| `playground/credits/*` | TurboWarp and Scratch credits | Keep. This is where the licence attribution lives |
| `components/tw-invalid-embed/invalid-embed.jsx` | turbowarp.org embed instructions, docs link, GarboMuffin | Reword to Squiggle copy, no external links |
| `components/tw-project-input/project-input.jsx` | scratch.mit.edu project base | Remove from the player page (component stays for upstream code paths) |
| `components/tw-description/description.jsx` | Links Scratch @mentions | Keep. Only for Scratch-hosted project descriptions |
| `components/tw-featured-projects/featured-projects.jsx` | TurboWarp studio link | Keep. Already unmounted (decision 1170) |
| `components/tw-studioview/studioview.js` | trampoline.turbowarp.org | Keep. Unmounted with the above |
| `components/tw-cloud-variable-badge/*` | clouddata.turbowarp.org, docs link | Keep. Only on Scratch-hosted cloud projects on the player page |
| `components/tw-invalid-project-modal/*` | sb3fix links | Keep. Real recovery tool, licence-clean |
| `components/tw-custom-extension-modal/*` | extensions.turbowarp.org placeholder | Keep. Custom extensions are an expert path |
| `components/tw-documentation-link/*` | docs.turbowarp.org | Keep. No longer used by the shell after the settings rewrite |
| `components/prompt/prompt.jsx` | Packager link in the cloud reminder | Keep. Only on cloud prompts |
| `components/telemetry-modal/*` | Scratch privacy link | Keep. Telemetry modal is never opened |
| `components/webgl-modal/*` | scratch.mit.edu/3faq | Keep. Rewritten in 70f970b, link is behind "For grown-ups" |
| `components/squiggle-only-notice/*` | "Scratch and TurboWarp cannot run Squiggle blocks" | Keep. Descriptive and true |
| `components/stage-header/*`, `sprite-list.jsx`, `asset-panel/selector.jsx`, `monitor.jsx`, `data-url.jsx` | Code comments about addons or upstream issues | Keep (upstream code) |
| `containers/extension-library.jsx`, `lib/libraries/extensions/index.jsx`, `tw-extension-tags.js`, `make-toolbox-xml.js` | Extension gallery from extensions.turbowarp.org, "TurboWarp Blocks" | Keep this pass. The extension library is its own redesign (see Not in scope) |
| `containers/tw-security-manager.jsx`, `tw-windchime-submitter.jsx`, `lib/tw-project-meta-fetcher-hoc.jsx`, `lib/project-fetcher-hoc.jsx`, `lib/tw-packager-integration-hoc.jsx`, `lib/tw-restore-point-api.js` | Service URLs and storage keys | Keep. Not visible. Packager integration stays but loses its menu item |
| `containers/blocks.jsx` | docs.turbowarp.org/return link | Keep. Only for the TurboWarp "return" block help |
| `containers/library-item.jsx` | Scratch asset CDN | Keep. Library assets are served from it |
| `lib/alerts/index.jsx` | Scratch cloud FAQ link | Keep. Cloud alerts only |
| `lib/themes/**` | `addons` block colour key, comments | Keep (data keys) |
| `lib/collab/*`, `lib/checker/messages.js` | Comments or factual mention | Keep |
| `lib/default-project/*` | Scratch export comment, artist credit | Keep. Credited art |
| `static/privacy.html`, `static/embedtest.html` | TurboWarp privacy policy page, test page | Keep. Squiggle's privacy page is on the site; this file is not linked from the shell |

## 2. Research

| Topic | Source | What it decides here |
|---|---|---|
| Icon grid | Lucide icon design guide, lucide.dev/contribute/icon-design-guide | 24x24 canvas, at least 1px from the edge, 2px centred strokes, round caps and joins, 2px radius on corners of shapes 8px or larger and 1px below that, 2px gaps between elements, low detail, match the visual weight of the circle and square references |
| Icon set licences | Lucide LICENSE (ISC, with Feather-derived icons under MIT); Phosphor README (MIT, 16px design grid, six weights); Google Material Symbols docs, developers.google.com/fonts/docs/material_symbols (Apache 2.0, variable font with weight 100 to 700, fill 0 to 1, optical size 20 to 48) | Lucide fits: same 24px, 2px, round-terminal grammar the editor already uses. Phosphor's 16px grid and Material's variable font would mean a second grammar or a font dependency |
| Menu bar and menus | WAI-ARIA APG Menu and Menubar pattern and Menu Button pattern (offline catalog, aria-apg `content/patterns/menubar/menu-and-menubar-pattern.html`, `content/patterns/menu-button/menu-button-pattern.html`) | Each top item is a menu button with `aria-haspopup` and `aria-expanded`. Enter, Space and Down open and focus the first item. Up and Down move inside the menu, Escape closes and returns focus to the button, Tab leaves and closes |
| Tabs | APG Tabs pattern (aria-apg `content/patterns/tabs/tabs-pattern.html`); Fluent 2 TabList best practices | react-tabs already gives `tablist`, `tab`, `aria-selected` and arrow keys. Keep it, change the look. Selected state must not rely on colour alone, so the selected tab gets a fill and an indicator bar |
| Modals and sheets | APG Dialog (Modal) pattern; Carbon Dialogs pattern (carbon `src/pages/patterns/dialog-pattern/index.mdx`) | Focus moves into the dialog, Tab is trapped, Escape closes. Header holds title and close only. Short tasks only |
| Dark surfaces | Carbon Color usage and overview, layering model (carbon `src/pages/elements/color/overview.mdx`) | In dark themes each layer is one step lighter: bg, panel, raised. Elevation in the dark editor is a lighter surface plus a 1px line, not a heavier shadow |
| Touch toolbars | APG Toolbar example; NN/g "Physical development in kids", nngroup.com/articles/children-ux-physical-development | Children need bigger targets than adults (NN/g: 2cm for young children) and a tap alternative to every drag. With design.md: 44px on coarse pointers and phones, 40px on desktop |
| Children's UI | NN/g "Children's websites: usability issues", nngroup.com/articles/childrens-websites-usability-issues | Kids notice age styling one grade off and reject it, so no baby styling. They mine-sweep the screen, so every icon in the bar carries a word next to it where width allows. Redundant navigation confuses them, so one way to each place |

## 3. Icon decision

| Option | For | Against |
|---|---|---|
| a. Lucide base plus Squiggle marks on the same grid | 1,600+ icons drawn by many hands under one guide, ISC licence, the editor's own icons already use its grammar so the switch is seamless, SVG source per icon | Generic if used without care |
| a'. Phosphor base | MIT, six weights | 16px design grid and its own proportions; mixing with the 24px Squiggle marks would show |
| b. Keep and clean sq-icon | Already ours | 37 glyphs drawn ad hoc: mixed solid dots, uneven optical weight (gamepad, tools, rules are busy), no guide behind them. This is the "AI slop" risk Nick named |
| c. Material Symbols | Apache 2.0, huge | Variable font or 20+ KB per weight; filled grammar by default; reads as Google |

**Decision: a.** Lucide 1.56.0 (published 2026-10-13), ISC. SVG sources are vendored into `src/components/sq-icon/svg/lucide/` with the Lucide `LICENSE` beside them and a `NOTICE` in `src/components/sq-icon/svg/`. Squiggle-specific marks that Lucide has no answer for (the sprite character, the world kit pin, the rules shield, the animate mark) are redrawn to Lucide's guide in `svg/squiggle/`. One script, `scripts/sq-icons.mjs`, reads both folders and writes the registry `src/components/sq-icon/icons.js` and every shell asset SVG that used to be Scratch art. A node test fails if any output drifts from its source.

### Icon rules

| Rule | Value |
|---|---|
| Grid | 24x24, 1px safe area (Lucide's), live area 22x22 |
| Stroke | 2px, centred, round caps and joins, `currentColor` |
| Corners | 2px radius on shapes 8px or larger, 1px below |
| Gaps | At least 2px between separate parts |
| Fill | Outline only. A dot is a zero-length stroke (`h.01`), never a filled circle. No filled and outlined icons in one bar |
| On the purple bar | White at 100%, 20px |
| On panels | `--sq-text-muted` at rest, `--sq-text` on hover, brand 500 (Night) or brand 700 (Day) when selected |
| On brand buttons | White on brand 700 or 800 only |
| Sizes | 16px minimum rendered, 20px in bars and menus, 24px in tabs and the phone tab bar |
| Labels | Every icon in the bar has a visible word at 1125px and wider. Icon-only buttons have an accessible name and a tooltip |
| Logo | The wave mark from the site (`assets/mark-v1.svg`) is the only logo. It appears once, at the left of the bar |
| Kept on purpose | Green flag and stop sign. The blocks draw the same flag, so the button must match the block |

## 4. Token map

Editor tokens live in `src/lib/themes/tokens.js` (`--sq-*`), the gui themes (`gui/squiggle.js` Night, `gui/squiggle-day.js` Day) and the accent (`accent/squiggle.js`). `src/css/colors.css` and `default-colors.css` are the upstream indirection (`$ui-primary` to `--ui-primary`) and stay.

| Editor token | Now | Site token | After | Why |
|---|---|---|---|---|
| `--sq-text-xs` | 12px | `--sq-t-xs` 14px | 14px | design.md: nothing under 14px |
| `--sq-text-sm` | 14px | `--sq-t-xs` 14px | 14px | Same |
| `--sq-text-md` | 16px | `--sq-t-sm` 16px | 16px | Same |
| `--sq-text-lg` | 20px | `--sq-t-lg` 22px | 22px | Sheet titles match the site |
| `--sq-text-xl` | 24px | `--sq-t-xl` 28px | 28px | Same |
| `--sq-weight-regular` | 500 | 400 and 600 | 600 | Nunito 600 for UI text, the site's text weight |
| `--sq-target` | 36px | `--sq-hit` 36px | 40px | design.md: 40px on desktop. The site's 36px is its inline chip size |
| `--sq-target-touch` | 44px | | 44px | Stays |
| `--sq-line-hi` | missing | `#454f80` Night, `#b9b2d6` Day | added | Hover and focus edges |
| `--sq-text-faint` | missing | `--sq-faint` | added | Helper text |
| `--sq-tint` | missing | `rgba(153,102,255,.14)` Night, `rgba(119,77,203,.09)` Day | added | Selected tab and menu item fill |
| `--sq-radius-sheet` | missing | 20px (design.md) | added | Phone sheets |
| `--sq-bg`, `--sq-panel`, `--sq-raised`, `--sq-line`, `--sq-text`, `--sq-text-muted`, `--sq-link`, `--sq-focus`, status colours | equal to site | | stay | Already the site's values |
| `--sq-menu-bar*` | site `--sq-menu-a` and `--sq-menu-b` gradient | | stay | The top bar gradient is design.md's one allowed gradient |
| `ui-modal-header-background` (Night) | `#1c2342` | | `--sq-panel` | The header is part of the card, not a second bar |
| `ui-modal-header-background` (Day) | `var(--looks-secondary)` purple | | `--sq-panel` | Same, and Day loses its purple slab |
| Block, kit, peer colours | | | stay | Out of scope by rule |

Why the dark editor still reads as the light site: the same purple bar gradient sits on top of both, the same wave mark and wordmark sit at its left, both use Nunito 700 and 800 for controls, the same 10px buttons and 16px cards, the same `--sq-bg`, `--sq-panel`, `--sq-raised` steps (the site's Night theme uses them exactly), and the same voice. Day in the editor uses the site's Day values.

## 5. The design, surface by surface

| Surface | Before | After | Rule |
|---|---|---|---|
| Menu bar, left | Settings, File, Edit, Addons, title | Wave mark and "Squiggle" wordmark (link to the home page, same tab; the editor already warns before leaving unsaved work). Then File, Edit, then the game name field | One logo. Order follows the desktop convention kids know from other apps |
| Menu bar, middle | See Project Page, Help and bugs | Preview (eye icon, opens the player view) | Labels say the action |
| Menu bar, right | checker, Outline, History, presence, save status | The same Squiggle group (checker, Outline, History, Messages, presence, save status), then Help (question icon, opens `/#help` in a new tab), then Settings (sliders icon) last | Settings and Help sit together at the end, where the site keeps its account controls. Together and invite stay inside presence and the room panel where they live today |
| Menu buttons | 12px bold, 8x5 caret image, no keyboard | 14px Nunito 700, 40px tall, 10px radius hover fill, Lucide chevron-down, `role=button`, `aria-haspopup=menu`, `aria-expanded`, Enter, Space and Down open | APG menu button |
| Menus | 34px rows, 12px, purple slab, no roles | `--sq-panel` card, 10px radius, 1px `--sq-line`, `--sq-elevation-3`, 40px rows (44px on coarse pointers), 14px text, 20px icons, `role=menu` and `role=menuitem`, arrow keys, Escape | APG menu; Carbon layering |
| File menu | New, Save now, Save as a copy, Remix, Load from your computer, Save to your computer, Save as..., Package project, Restore points | New game, Save now, Save a copy, Remix, Open a file from your computer, Save to your computer, Recover a lost game. Package project removed | Say what to do. No jargon |
| Edit menu | Restore, Turbo mode, 60 FPS, Change Username, Cloud variables, Game settings | Undo delete, Turn on Turbo mode, Change username, Cloud variables on or off, Game settings. 60 FPS goes (it lives in Game settings) | One way to each place |
| Settings menu | Language, Appearance, Block Colors, Accent, Game settings | Language, Theme (Night, Day, Auto), Block colours, Accent, Game settings. No addon link | Sentence case |
| Errors menu | Links to the TurboWarp author | "Some scripts hit a problem. Tell us about it." links to `/#help` | Voice |
| Addons | Top-level button to a page of 81 addons | Removed from the chrome. The brief said none are on by default; 21 are (find bar, folders, block switching, pause, onion skinning, the colour pickers, drag and drop and others), and they quietly power things kids already use, so they stay on as editor features. The page stays reachable at `addons.html` for anyone who already uses it, and kept settings keep working | The earlier review: hide the page, curate. A settings page of 81 switches written for Scratch power users fails the grade 3 to 5 voice rule and the one-accent rule. Curating more addons into named Squiggle features is a later job, one feature at a time |
| Tabs | Folder tabs, 12px | Flat tab bar on the panel: 40px tabs, 10px radius, 24px icon and 16px Nunito 700 label, selected tab gets `--sq-tint` fill, brand text and a 3px brand bar along the bottom; unselected are muted text. Keeps react-tabs for roles and arrow keys | APG tabs; not colour alone |
| Palette and categories | Scratch circles, 12px labels | Unchanged in this pass (scratch-blocks draws them; category colours are block colours) | No block colour changes |
| Extension button | Scratch icon on a square tile | Lucide `blocks` with a plus, on the same 10px brand button as the add buttons | One icon grammar |
| Stage header | "Interpolation", "{n} FPS", Sketch icons | "Smooth motion", "{n} frames a second" (the Game settings words), Lucide panel and maximize icons, 40px buttons, 10px radius | Same words everywhere |
| Sprite info row | 12px labels, Sketch icons | 14px labels, Lucide eye, eye-off and move icons | 14px minimum |
| Add sprite and backdrop | Scratch cat face, Scratch glyphs, Title Case | The Squiggle sprite mark with a plus, Lucide image-plus, dices, brush, upload, search. "Choose a sprite", "Draw a sprite", "Surprise me", "Upload a sprite" and the backdrop versions | Voice; no Scratch art in the chrome |
| Backpack | 12px Scratch bar | 40px bar, 14px label "Backpack", panel surface | 14px minimum |
| Modals | 50px coloured header, 4px border, round close | Card on `--sq-panel`, 16px radius, 1px `--sq-line`, header on the same surface with 22px title and a 40px close button (Lucide x), back uses Lucide arrow-left | design.md card and sheet; APG dialog |
| Alerts | Scratch shapes | 10px radius, panel surface, 14px text, Lucide close | Shape language |
| Loading | Stacking blocks animation | The wave mark (still under reduced motion) and the progress line, "Loading your game" and "Making a new game" | One mascot; no Scratch art |
| Splash and noscript | TurboWarp Desktop link, report to TurboWarp author | "Squiggle needs JavaScript to run. Turn it on in your browser settings." and "Something went wrong. Tell us at squigglegames.app/#help" | Voice |
| Phone shell | Menu sheet repeats the desktop bar | Sheet gets the same new menus, 48px rows, Help and Settings at the bottom, no Addons | 44px targets |
| Player page | URL box, TurboWarp blurb, TurboWarp footer | No URL box. Footer: "Squiggle is made by Lumina Games LLC. It is built on TurboWarp and Scratch, free software under the GPL." with links to Credits, Source code and Privacy | Licence attribution lives here and in Credits |
| Invalid embed | turbowarp.org instructions | "This game can only be played on Squiggle." with a link to the game on squigglegames.app | Voice |

## 6. Implementation sequence

| Step | Files | Risk | How it is checked |
|---|---|---|---|
| 1. Plan | `docs/SHELL.md` | | Commit on its own |
| 2. Icons | `scripts/sq-icons.mjs`, `src/components/sq-icon/svg/**`, `icons.js`, asset SVGs in `action-menu`, `gui`, `stage-header`, `sprite-info`, `close-button`, `delete-button`, `lib/assets`, `menu-bar` | Recolour loader keys on `#855cd6`; sizes of replaced files | `sq-icon/sq-icon.test.mjs` (registry rules, sync, every used name exists); screenshots of every bar |
| 3. Tokens | `lib/themes/tokens.js`, `gui/squiggle*.js` | 12px to 14px may wrap labels in narrow panes | Screenshots at 1024 |
| 4. Menus | `components/menu/*`, `menu-bar/tw-menu-label.jsx`, `menu-bar.jsx`, `settings-menu.jsx`, `tw-theme-blocks.jsx`, `community-button.jsx`, `tw-see-inside.jsx`, `menu-bar.css`, `menu-structure.js` | 25 existing lint errors in menu-bar.jsx; translations; phone sheet reuses the bar | `menu-bar/menu-structure.test.mjs`; eslint on touched files; Settings open screenshot; phone sheet screenshot |
| 5. Tabs, stage header, sprite pane, add buttons, backpack | `gui.css`, `gui-editor.jsx`, `stage-header.*`, `tw-framerate-indicator`, `sprite-info.*`, `sprite-selector.jsx`, `stage-selector.jsx`, `backpack.css` | Phone layout overrides tab CSS by data attribute | 1280, 1024 and 412 screenshots |
| 6. Modals, alerts, loader | `modal.*`, `close-button`, `alerts`, `loader` | Library modals use the same header | Screenshot with a library modal open |
| 7. Player, splash, embed | `render-interface.jsx`, `index.ejs`, `invalid-embed.jsx` | Embed and fullscreen share code | index.html and fullscreen.html screenshots |
| 8. Gate | CI steps from `.github/workflows/editor.yml`, eslint on touched files, final screenshots | Bundle size | `size-check.mjs` |

### Translations

Every changed user-visible string gets a new `sq.` id so other locales fall back to English instead of showing the old TurboWarp words.

### Not in scope

| Item | Why |
|---|---|
| Extension library and its turbowarp.org gallery | A content and safety decision, not chrome |
| Cloud variable host | A service choice for the server team |
| Paint and sound editors | Upstream editors with their own toolbars; a separate pass |
| Block palette category column | Drawn by scratch-blocks; block colours are fixed |
| A new default sprite | Needs art from the mascot work |

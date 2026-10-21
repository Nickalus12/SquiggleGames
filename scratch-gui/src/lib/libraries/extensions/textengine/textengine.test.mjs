import {readFileSync} from 'node:fs';
import {ok, near, section, done} from '../../../world/harness.mjs';
import {boot, fixedClock, frame, frames, pending} from '../vfx/overlay-harness.mjs';

const faces = [];
globalThis.FontFace = class {
    constructor (family, source, descriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
        this.loaded = new Promise(() => {});
        faces.push(this);
    }
    load () {
        return this.family === 'Pacifico' ? Promise.reject(new Error('blocked')) : Promise.resolve(this);
    }
};
const added = [];
globalThis.document.fonts = {add: face => added.push(face)};

const {default: ThunderboltText, KIT_FONTS, FONT_PATH} = await import('./index.js');

const {runtime, cat, world, step} = await boot();
const settle = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
};
const same = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.scale, b.scale);

section('self-hosted fonts');
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
ok('no woff2 file goes through a bundler import', !/import\s+\w+\s+from\s+'[^']+\.woff2'/.test(source));
ok('no font request leaves the origin', !/https?:\/\//.test(Object.values(KIT_FONTS).flat(2).join(' ')) &&
    !/fonts\.(googleapis|gstatic)/.test(source));
const text = new ThunderboltText(runtime);
fixedClock(text.overlay);
frame();
text.createText({ID: 'title', TEXT: 'Hi', X: 0, Y: 0});
frame();
text.setFont({ID: 'title', FONT: 'Bangers'});
const bangers = faces.filter(f => f.family === 'Bangers');
ok('a kit font registers one face per subset', bangers.length === 3 && added.length === 3, bangers.length);
ok('faces load from the copied static path', bangers.every(f => f.source.startsWith(`url(${FONT_PATH}bangers-`) &&
    f.source.endsWith('.woff2) format("woff2")')), bangers.map(f => f.source));
ok('each subset carries its unicode range', bangers[0].descriptors.unicodeRange.startsWith('U+0000-00FF') &&
    bangers[1].descriptors.unicodeRange.startsWith('U+0100-02BA') &&
    bangers[2].descriptors.unicodeRange.includes('U+1EA0-1EF9'));
frames(2);
await settle();
ok('a loaded font wakes the overlay', pending() === 1);
frame();
text.setFont({ID: 'title', FONT: 'Bangers'});
ok('a font registers once', faces.filter(f => f.family === 'Bangers').length === 3);
frame();
text.setFont({ID: 'title', FONT: 'Pacifico'});
frame();
await settle();
ok('a font that fails to load still wakes the overlay', pending() === 1);
frame();
ok('the failed font falls back without throwing', text.objects.get('title').font === 'Pacifico');
text.setFont({ID: 'title', FONT: 'Arial'});
ok('a system font registers nothing', faces.length === 6);
const ranges = Object.fromEntries(Object.entries(KIT_FONTS).map(([family, list]) => [family, list.length]));
ok('the subsets match the ruling', JSON.stringify(ranges) ===
    '{"Bangers":3,"Press Start 2P":4,"Pacifico":3,"Permanent Marker":1,"Luckiest Guy":2}', ranges);

section('anchors');
const at = text.anchor(text.objects.get('title'));
ok('a new text is pinned to the screen like 1.8', at.x === 480 && at.y === 360 && at.scale === 2, at);
text.createText({ID: 'hud', TEXT: 'Score', X: -200, Y: 150});
const corner = text.anchor(text.objects.get('hud'));
ok('a pinned anchor maps stage units to backing pixels', corner.x === 80 && corner.y === 60, corner);
const made = world();
made.camera.set(100, 0);
made.camera.setZoom(200);
step();
ok('a pinned text ignores the camera', same(text.anchor(text.objects.get('hud')), corner));
cat.setXY(100, 0);
text.stickToMe({ID: 'title', DY: -40}, {target: cat});
const stuck = text.anchor(text.objects.get('title'));
ok('a stuck text rides its sprite through the camera', near(stuck.x, 480) && near(stuck.y, 520) &&
    stuck.scale === 4, stuck);
ok('stick text to me ignores the stage', (() => {
    text.stickToMe({ID: 'hud', DY: 0}, {target: runtime.getTargetForStage()});
    return text.objects.get('hud').target === null && !text.stuck.has(text.objects.get('hud'));
})());

section('pin text to screen does not jump');
const obj = text.objects.get('title');
text.pinToScreen({ID: 'title', ONOFF: 'on'});
const pinnedAt = text.anchor(obj);
ok('pinning at camera x 100 zoom 2 keeps the screen spot', near(pinnedAt.x, stuck.x) && near(pinnedAt.y, stuck.y) &&
    !obj.target && obj.pinned, {pinnedAt, stuck});
ok('the pinned spot is in screen units', near(obj.x, 0) && near(obj.y, -80), obj);
text.pinToScreen({ID: 'title', ONOFF: 'off'});
ok('unpinning at camera x 100 zoom 2 keeps the screen spot', same(text.anchor(obj), stuck), text.anchor(obj));
ok('the unpinned spot is in world units', near(obj.x, 100) && near(obj.y, -40), obj);

section('a deleted clone');
const clone = cat.makeClone();
runtime.addTarget(clone);
clone.setXY(60, 20);
text.createText({ID: 'tag', TEXT: 'clone', X: 0, Y: 0});
text.stickToMe({ID: 'tag', DY: 15}, {target: clone});
step();
const before = text.anchor(text.objects.get('tag'));
runtime.disposeTarget(clone);
step();
frame();
const tag = text.objects.get('tag');
ok('a deleted clone leaves the text at its last spot', !tag.target && tag.x === 60 && tag.y === 35, tag);
ok('the text does not move on screen', same(text.anchor(tag), before));
text.deleteText({ID: 'tag'});
ok('deleting a text forgets it', !text.objects.has('tag') && text.stuck.size === 0);

section('drawing');
const ctx = text.overlay.ctx;
ctx.calls.length = 0;
text.overlay.wake();
frame();
ok('visible text draws', ctx.calls.some(c => c[0] === 'fillText'));
text.setAnimation({ID: 'title', ANIMATION: 'wave', SPEED: 1});
frames(3);
ok('an animated text keeps the loop', pending() === 1);
text.setAnimation({ID: 'title', ANIMATION: 'none', SPEED: 1});
frames(2);
ok('a still text lets the loop sleep', pending() === 0);

done();

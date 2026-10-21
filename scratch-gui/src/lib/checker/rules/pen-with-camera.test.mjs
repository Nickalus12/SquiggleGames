import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: penWithCamera} = await import('./pen-with-camera.js');
const {ok, done} = harness();
const cases = loadFixture('pen-with-camera');

ok('pen in a project without world mode is fine', penWithCamera(cases.flat).length === 0);
const items = penWithCamera(cases.world);
ok('one item per sprite in a world project', items.length === 1 && items[0].targetId === 'pen');
ok('counts pen down and stamp, not clear', items[0].values.count === 2 && items[0].blockId === 'down');
ok('warn, no fix', items[0].severity === 'warn' && items[0].fix === null);
done();

import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: togetherFlood} = await import('./together-flood.js');
const {ok, done} = harness();
const cases = loadFixture('together-flood');

ok('a loop with a wait is fine', togetherFlood(cases.waited).length === 0);
ok('a send outside any loop is fine', togetherFlood(cases.noLoop).length === 0);
const items = togetherFlood(cases.flood);
ok('a send in a loop with no wait is reported, even under an if', items.length === 1 && items[0].blockId === 'send');
ok('warn severity', items[0].severity === 'warn');
ok('fix adds wait 0.1 after the send', items[0].fix === 'add-wait' &&
    items[0].fixData.afterBlockId === 'send' && items[0].fixData.seconds === 0.1 && items[0].fixData.targetId === 'cat');
const inner = togetherFlood(cases.innerLoop);
ok('the innermost loop decides, an outer wait does not help', inner.length === 1 && inner[0].blockId === 'inner');
done();

import {harness, loadFixture} from '../fixtures/load.mjs';

const {default: looseBlocks} = await import('./loose-blocks.js');
const {ok, done} = harness();
const cases = loadFixture('loose-blocks');

ok('hat stacks and definitions are not loose', looseBlocks(cases.clean).length === 0);
const loose = looseBlocks(cases.loose);
ok('one item per sprite', loose.length === 1, loose);
ok('counts both loose stacks', loose[0].values.count === 2 && loose[0].values.sprite === 'Cat');
ok('points at a loose stack', loose[0].targetId === 'cat' && loose[0].blockId === 'lone');
ok('info severity', loose[0].severity === 'info');
ok('fix is clean up with every loose stack', loose[0].fix === 'clean-up' && loose[0].fixData.blockIds.length === 2);
ok('single reporters left out to click are not loose', looseBlocks(cases.reporters).length === 0);
ok('extension hats count as hats', looseBlocks(cases.extensionHat).length === 0);
const stage = looseBlocks(cases.stage);
ok('the stage is checked too', stage.length === 1 && stage[0].targetId === 'stage');
ok('stable key', loose[0].key === 'loose-blocks:cat:stacks');
done();

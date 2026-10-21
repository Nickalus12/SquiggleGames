import messageNotReceived from './message-not-received.js';
import messageNotSent from './message-not-sent.js';
import customBlockMissing from './custom-block-missing.js';
import variableUnused from './variable-unused.js';
import looseBlocks from './loose-blocks.js';
import cloneRunaway from './clone-runaway.js';
import togetherFlood from './together-flood.js';
import togetherSharedLoop from './together-shared-loop.js';
import rulesWrongPlace from './rules-wrong-place.js';
import rulesStatus from './rules-status.js';
import penWithCamera from './pen-with-camera.js';
import sceneMissing from './scene-missing.js';
import tileMissing from './tile-missing.js';
import bigAsset from './big-asset.js';
import squiggleOnly from './squiggle-only.js';

const RULES = Object.freeze([
    messageNotReceived,
    messageNotSent,
    customBlockMissing,
    variableUnused,
    looseBlocks,
    cloneRunaway,
    togetherFlood,
    togetherSharedLoop,
    rulesWrongPlace,
    rulesStatus,
    penWithCamera,
    sceneMissing,
    tileMissing,
    bigAsset,
    squiggleOnly
]);

export default RULES;

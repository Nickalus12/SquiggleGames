import {CLASSIC_TAG, isSquiggleItem, tagLabels} from '../../lib/libraries/tw-extension-tags';
import {requiresTogether} from '../../lib/kits/registry.js';

const MAX_TAG_CHIPS = 3;

const tagChipsFor = tags => (tags || [])
    .filter(tag => Object.prototype.hasOwnProperty.call(tagLabels, tag) && tag !== CLASSIC_TAG)
    .slice(0, MAX_TAG_CHIPS)
    .map(tag => ({tag, label: tagLabels[tag]}));

const squiggleFirst = items => items
    .filter(isSquiggleItem)
    .concat(items.filter(item => !isSquiggleItem(item)));

const isTogetherRequired = item => !!(
    item &&
    (item.togetherRequired || requiresTogether(item.extensionId))
);

export {
    MAX_TAG_CHIPS,
    isTogetherRequired,
    squiggleFirst,
    tagChipsFor
};

import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {getKit, isKit, TOGETHER_ID} from '../lib/kits/registry.js';
import {isTogetherRequired, squiggleFirst, tagChipsFor} from '../components/extension-library/extension-cards.js';
import collab from '../lib/collab';
import {showLoadError, showTogetherSheet} from '../components/squiggle-only-notice';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an extension',
        description: 'Heading for the extension library',
        id: 'sq.library.chooseExtension'
    }
});

const rulesContext = require.context('../lib', true, /^\.\/rules\/ensure-sprite\.js$/, 'lazy');

const loadEnsureRulesSprite = () => {
    const key = rulesContext.keys()[0];
    if (!key) return Promise.resolve(null);
    return rulesContext(key).then(mod => mod.ensureRulesSprite || mod.default || null);
};

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            tagChips: tagChipsFor(extension.tags),
            ...extension
        });
    }
    return extension;
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleItemShowBlocks'
        ]);
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (item.disabled || this.isUnshippedKit(extensionId)) return;
        if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
            this.props.onCategorySelected(extensionId);
            return;
        }
        const togetherRequired = isTogetherRequired(item);
        const ready = togetherRequired ?
            this.loadExtension(TOGETHER_ID, TOGETHER_ID).then(() => this.loadExtension(url, extensionId)) :
            this.loadExtension(url, extensionId);
        ready
            .then(() => {
                this.props.onCategorySelected(extensionId);
                if (togetherRequired) this.afterTogetherExpansion();
            })
            .catch(err => {
                log.error(err);
                showLoadError({intl: this.props.intl});
            });
    }
    handleItemShowBlocks (item) {
        if (item && this.props.vm.extensionManager.isExtensionLoaded(item.extensionId)) {
            this.props.onCategorySelected(item.extensionId);
            return;
        }
        this.handleItemSelect(item);
    }
    loadExtension (url, extensionId) {
        if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) return Promise.resolve();
        return this.props.vm.extensionManager.loadExtensionURL(url);
    }
    afterTogetherExpansion () {
        const vm = this.props.vm;
        loadEnsureRulesSprite()
            .then(ensureRulesSprite => {
                if (typeof ensureRulesSprite === 'function') return ensureRulesSprite(vm);
                return null;
            })
            .catch(err => log.error(err));
        if (!collab.roomName) showTogetherSheet({intl: this.props.intl});
    }
    isUnshippedKit (extensionId) {
        if (!isKit(extensionId)) return false;
        const kit = getKit(extensionId);
        return !kit.extension && !this.props.vm.extensionManager.isBuiltinExtension(extensionId);
    }
    withState (item) {
        if (typeof item !== 'object' || !item.extensionId || item.href) return item;
        const manager = this.props.vm.extensionManager;
        return {
            ...item,
            added: manager.isExtensionLoaded(item.extensionId),
            disabled: item.disabled || this.isUnshippedKit(item.extensionId),
            togetherRequired: isTogetherRequired(item)
        };
    }
    render () {
        const library = squiggleFirst(extensionLibraryContent)
            .map(toLibraryItem)
            .map(item => this.withState(item));

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                rememberTag
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onItemShowBlocks={this.handleItemShowBlocks}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);

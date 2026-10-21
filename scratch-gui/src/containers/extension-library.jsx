import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {getKit, isKit, TOGETHER_ID} from '../lib/kits/registry.js';
import {isTogetherRequired, squiggleFirst, tagChipsFor} from '../components/extension-library/extension-cards.js';
import collab from '../lib/collab';
import {showLoadError, showTogetherSheet} from '../components/squiggle-only-notice';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
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

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});

let cachedGallery = null;

const fetchLibrary = async () => {
    const res = await fetch('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json');
    if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
    }
    const data = await res.json();
    return data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
        iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
        tags: ['classic'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: true
    }));
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'handleItemShowBlocks'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false
        };
    }
    componentDidMount () {
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

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
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            library = squiggleFirst(extensionLibraryContent)
                .map(toLibraryItem)
                .map(item => this.withState(item));
            library.push('---');
            if (this.state.gallery) {
                library.push(toLibraryItem(galleryMore));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.gallery
                        .filter(i => i.extensionId !== 'faceSensing')
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                        .map(item => this.withState(item))
                );
            } else if (this.state.galleryError) {
                library.push(toLibraryItem(galleryError));
            } else {
                library.push(toLibraryItem(galleryLoading));
            }
        }

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
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);

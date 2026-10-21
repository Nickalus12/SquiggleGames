import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import LibraryItem from '../../containers/library-item.jsx';
import Modal from '../../containers/modal.jsx';
import Divider from '../divider/divider.jsx';
import Filter from '../filter/filter.jsx';
import TagButton from '../../containers/tag-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import Separator from '../tw-extension-separator/separator.jsx';
import RemovedTrademarks from '../tw-removed-trademarks/removed-trademarks.jsx';
import {APP_NAME} from '../../lib/brand.js';

import styles from './library.css';

const messages = defineMessages({
    filterPlaceholder: {
        id: 'gui.library.filterPlaceholder',
        defaultMessage: 'Search',
        description: 'Placeholder text for library search field'
    },
    allTag: {
        id: 'gui.library.allTag',
        defaultMessage: 'All',
        description: 'Label for library tag to revert to all items after filtering by tag.'
    },
    tagGroup: {
        id: 'sq.library.tagGroup',
        defaultMessage: 'Filters',
        description: 'Accessible name of the row of filter buttons in a library'
    }
});

const ALL_TAG = {tag: 'all', intlLabel: messages.allTag};

const readSessionItem = key => {
    try {
        return sessionStorage.getItem(key);
    } catch (error) {
        return null;
    }
};

const writeSessionItem = (key, value) => {
    try {
        sessionStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
};

const withoutMatches = tagProps => {
    const buttonProps = Object.assign({}, tagProps);
    delete buttonProps.matches;
    return buttonProps;
};
const tagListPrefix = [ALL_TAG];

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClose',
            'handleFilterChange',
            'handleFilterClear',
            'handleMouseEnter',
            'handleMouseLeave',
            'handlePlayingEnd',
            'handleSelect',
            'handleShowBlocks',
            'handleFavorite',
            'handleTagClick',
            'handleTagKeyDown',
            'setFilteredDataRef'
        ]);
        const favorites = this.readFavoritesFromStorage();
        this.state = {
            playingItem: null,
            filterQuery: '',
            selectedTag: this.readRememberedTag(),
            canDisplay: false,
            favorites,
            initialFavorites: favorites
        };
    }
    componentDidMount () {
        // Rendering all the items in the library can take a bit, so we'll always
        // show one frame with a loading spinner.
        setTimeout(() => {
            this.setState({
                canDisplay: true
            });
        });
        if (this.props.setStopHandler) this.props.setStopHandler(this.handlePlayingEnd);
    }
    componentDidUpdate (prevProps, prevState) {
        if (prevState.filterQuery !== this.state.filterQuery ||
            prevState.selectedTag !== this.state.selectedTag) {
            this.scrollToTop();
        }

        if (this.props.rememberTag && prevState.selectedTag !== this.state.selectedTag) {
            writeSessionItem(this.getTagStorageKey(), this.state.selectedTag);
        }

        if (this.state.favorites !== prevState.favorites) {
            try {
                localStorage.setItem(this.getFavoriteStorageKey(), JSON.stringify(this.state.favorites));
            } catch (error) {
                // ignore
            }
        }
    }
    handleSelect (id) {
        this.handleClose();
        this.props.onItemSelected(this.getFilteredData()[id]);
    }
    handleShowBlocks (id) {
        const item = this.getFilteredData()[id];
        this.handleClose();
        if (this.props.onItemShowBlocks) {
            this.props.onItemShowBlocks(item);
        } else {
            this.props.onItemSelected(item);
        }
    }
    getTagStorageKey () {
        return `sq:library-tag:${this.props.id}`;
    }
    readRememberedTag () {
        if (!this.props.rememberTag || !this.props.tags) return ALL_TAG.tag;
        const tag = readSessionItem(this.getTagStorageKey());
        const known = this.props.tags.some(tagProps => tagProps.tag.toLowerCase() === tag);
        return known ? tag : ALL_TAG.tag;
    }
    readFavoritesFromStorage () {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(this.getFavoriteStorageKey()));
        } catch (error) {
            // ignore
        }
        if (!Array.isArray(data)) {
            data = [];
        }
        return data;
    }
    getFavoriteStorageKey () {
        return `tw:library-favorites:${this.props.id}`;
    }
    handleFavorite (id) {
        const data = this.getFilteredData()[id];
        const key = data[this.props.persistableKey];
        this.setState(oldState => ({
            favorites: oldState.favorites.includes(key) ? (
                oldState.favorites.filter(i => i !== key)
            ) : (
                [...oldState.favorites, key]
            )
        }));
    }
    handleClose () {
        this.props.onRequestClose();
    }
    handleTagClick (tag) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: '',
                selectedTag: tag.toLowerCase()
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: '',
                playingItem: null,
                selectedTag: tag.toLowerCase()
            });
        }
    }
    handleTagKeyDown (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const tag = event.currentTarget.getAttribute('data-tag');
        if (tag) this.handleTagClick(tag);
    }
    getSelectedTagMatches () {
        const selected = this.state.selectedTag;
        const tagProps = (this.props.tags || []).find(item => item.tag.toLowerCase() === selected);
        if (tagProps && Array.isArray(tagProps.matches)) {
            return tagProps.matches.map(tag => tag.toLowerCase());
        }
        return [selected];
    }
    handleMouseEnter (id) {
        // don't restart if mouse over already playing item
        if (this.props.onItemMouseEnter && this.state.playingItem !== id) {
            this.props.onItemMouseEnter(this.getFilteredData()[id]);
            this.setState({
                playingItem: id
            });
        }
    }
    handleMouseLeave (id) {
        if (this.props.onItemMouseLeave) {
            this.props.onItemMouseLeave(this.getFilteredData()[id]);
            this.setState({
                playingItem: null
            });
        }
    }
    handlePlayingEnd () {
        if (this.state.playingItem !== null) {
            this.setState({
                playingItem: null
            });
        }
    }
    handleFilterChange (event) {
        if (this.state.playingItem === null) {
            this.setState({
                filterQuery: event.target.value,
                selectedTag: ALL_TAG.tag
            });
        } else {
            this.props.onItemMouseLeave(this.getFilteredData()[[this.state.playingItem]]);
            this.setState({
                filterQuery: event.target.value,
                playingItem: null,
                selectedTag: ALL_TAG.tag
            });
        }
    }
    handleFilterClear () {
        this.setState({filterQuery: ''});
    }
    getFilteredData () {
        // When no filtering, favorites get their own section
        if (this.state.selectedTag === 'all' && !this.state.filterQuery) {
            const favoriteItems = this.props.data
                .filter(dataItem => (
                    this.state.initialFavorites.includes(dataItem[this.props.persistableKey])
                ))
                .map(dataItem => ({
                    ...dataItem,
                    key: `favorite-${dataItem[this.props.persistableKey]}`
                }));

            if (favoriteItems.length) {
                favoriteItems.push('---');
            }

            return [
                ...favoriteItems,
                ...this.props.data
            ];
        }

        // When filtering, favorites are just listed first, not in a separate section.
        const favoriteItems = [];
        const nonFavoriteItems = [];
        for (const dataItem of this.props.data) {
            if (dataItem === '---') {
                // ignore
            } else if (this.state.initialFavorites.includes(dataItem[this.props.persistableKey])) {
                favoriteItems.push(dataItem);
            } else {
                nonFavoriteItems.push(dataItem);
            }
        }

        let filteredItems = favoriteItems.concat(nonFavoriteItems);

        if (this.state.selectedTag !== 'all') {
            const wanted = this.getSelectedTagMatches();
            filteredItems = filteredItems.filter(dataItem => (
                dataItem.tags &&
                dataItem.tags.some(i => wanted.includes(i.toLowerCase()))
            ));
        }

        if (this.state.filterQuery) {
            filteredItems = filteredItems.filter(dataItem => {
                const search = [...dataItem.tags];
                if (dataItem.name) {
                    // Use the name if it is a string, else use formatMessage to get the translated name
                    if (typeof dataItem.name === 'string') {
                        search.push(dataItem.name);
                    } else {
                        search.push(this.props.intl.formatMessage(dataItem.name.props, {
                            APP_NAME
                        }));
                    }
                }
                if (dataItem.description) {
                    if (typeof dataItem.description === 'string') {
                        search.push(dataItem.description);
                    } else {
                        search.push(this.props.intl.formatMessage(dataItem.description.props, {
                            APP_NAME
                        }));
                    }
                }
                return search
                    .join('\n')
                    .toLowerCase()
                    .includes(this.state.filterQuery.toLowerCase());
            });
        }

        return filteredItems;
    }
    scrollToTop () {
        this.filteredDataRef.scrollTop = 0;
    }
    setFilteredDataRef (ref) {
        this.filteredDataRef = ref;
    }
    render () {
        const filteredData = this.state.canDisplay && this.props.data && this.getFilteredData();
        return (
            <Modal
                fullScreen
                contentLabel={this.props.title}
                id={this.props.id}
                onRequestClose={this.handleClose}
            >
                {(this.props.filterable || this.props.tags) && (
                    <div className={styles.filterBar}>
                        {this.props.filterable && (
                            <Filter
                                className={classNames(
                                    styles.filterBarItem,
                                    styles.filter
                                )}
                                filterQuery={this.state.filterQuery}
                                inputClassName={styles.filterInput}
                                placeholderText={this.props.intl.formatMessage(messages.filterPlaceholder)}
                                onChange={this.handleFilterChange}
                                onClear={this.handleFilterClear}
                            />
                        )}
                        {this.props.filterable && this.props.tags && (
                            <Divider className={classNames(styles.filterBarItem, styles.divider)} />
                        )}
                        {this.props.tags &&
                            <div
                                className={styles.tagWrapper}
                                role="group"
                                aria-label={this.props.intl.formatMessage(messages.tagGroup)}
                            >
                                {tagListPrefix.concat(this.props.tags.map(withoutMatches)).map((tagProps, id) => {
                                    const active = this.state.selectedTag === tagProps.tag.toLowerCase();
                                    return (
                                        <TagButton
                                            active={active}
                                            aria-pressed={active}
                                            className={classNames(
                                                styles.filterBarItem,
                                                styles.tagButton,
                                                tagProps.className
                                            )}
                                            data-tag={tagProps.tag.toLowerCase()}
                                            key={`tag-button-${id}`}
                                            tabIndex={0}
                                            onClick={this.handleTagClick}
                                            onKeyDown={this.handleTagKeyDown}
                                            {...tagProps}
                                        />
                                    );
                                })}
                            </div>
                        }
                    </div>
                )}
                <div
                    className={classNames(styles.libraryScrollGrid, {
                        [styles.withFilterBar]: this.props.filterable || this.props.tags
                    })}
                    ref={this.setFilteredDataRef}
                >
                    {filteredData && this.getFilteredData().map((dataItem, index) => (
                        dataItem === '---' ? (
                            <Separator key={index} />
                        ) : (
                            <LibraryItem
                                added={dataItem.added}
                                bluetoothRequired={dataItem.bluetoothRequired}
                                collaborator={dataItem.collaborator}
                                description={dataItem.description}
                                disabled={dataItem.disabled}
                                extensionId={dataItem.extensionId}
                                href={dataItem.href}
                                featured={dataItem.featured}
                                hidden={dataItem.hidden}
                                iconMd5={dataItem.costumes ? dataItem.costumes[0].md5ext : dataItem.md5ext}
                                iconRawURL={dataItem.rawURL}
                                icons={dataItem.costumes}
                                id={index}
                                incompatibleWithScratch={dataItem.incompatibleWithScratch}
                                favorite={this.state.favorites.includes(dataItem[this.props.persistableKey])}
                                onFavorite={this.handleFavorite}
                                insetIconURL={dataItem.insetIconURL}
                                internetConnectionRequired={dataItem.internetConnectionRequired}
                                isPlaying={this.state.playingItem === index}
                                key={dataItem.key || (
                                    typeof dataItem.name === 'string' ?
                                        dataItem.name :
                                        dataItem.rawURL
                                )}
                                name={dataItem.name}
                                credits={dataItem.credits}
                                samples={dataItem.samples}
                                docsURI={dataItem.docsURI}
                                showPlayButton={this.props.showPlayButton}
                                onMouseEnter={this.handleMouseEnter}
                                onMouseLeave={this.handleMouseLeave}
                                onSelect={this.handleSelect}
                                onShowBlocks={this.handleShowBlocks}
                                tagChips={dataItem.tagChips}
                                togetherRequired={dataItem.togetherRequired}
                            />
                        )
                    ))}
                    {filteredData && this.props.removedTrademarks && (
                        <React.Fragment>
                            {filteredData.length > 0 && (
                                <Separator />
                            )}
                            <RemovedTrademarks />
                        </React.Fragment>
                    )}
                    {!filteredData && (
                        <div className={styles.spinnerWrapper}>
                            <Spinner
                                large
                                level="primary"
                            />
                        </div>
                    )}
                </div>
            </Modal>
        );
    }
}

LibraryComponent.propTypes = {
    data: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.oneOfType([
            /* eslint-disable react/no-unused-prop-types, lines-around-comment */
            // An item in the library
            PropTypes.shape({
                // @todo remove md5/rawURL prop from library, refactor to use storage
                md5: PropTypes.string,
                name: PropTypes.oneOfType([
                    PropTypes.string,
                    PropTypes.node
                ]),
                rawURL: PropTypes.string
            }),
            PropTypes.string
            /* eslint-enable react/no-unused-prop-types, lines-around-comment */
        ])),
        PropTypes.instanceOf(Promise)
    ]),
    filterable: PropTypes.bool,
    id: PropTypes.string.isRequired,
    persistableKey: PropTypes.string,
    intl: intlShape.isRequired,
    onItemMouseEnter: PropTypes.func,
    onItemMouseLeave: PropTypes.func,
    onItemSelected: PropTypes.func,
    onItemShowBlocks: PropTypes.func,
    onRequestClose: PropTypes.func,
    setStopHandler: PropTypes.func,
    rememberTag: PropTypes.bool,
    showPlayButton: PropTypes.bool,
    tags: PropTypes.arrayOf(PropTypes.shape(TagButton.propTypes)),
    title: PropTypes.string.isRequired,
    removedTrademarks: PropTypes.bool
};

LibraryComponent.defaultProps = {
    filterable: true,
    persistableKey: 'name',
    showPlayButton: false
};

export default injectIntl(LibraryComponent);

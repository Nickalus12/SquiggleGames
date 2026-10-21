import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon/sq-icon.jsx';
import {prepare, search} from './fuzzy';
import {firstItems, groupResults} from './sources';
import {kindMessages, uiMessages} from './messages';
import styles from './command-palette.css';

const LIMIT = 60;
const LISTBOX_ID = 'sq-palette-listbox';
const optionId = index => `sq-palette-option-${index}`;

class CommandPalette extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleKeyDown',
            'handleListClick',
            'handleListMove',
            'handleScrimDown',
            'setInput',
            'setList'
        ]);
        this.prepared = prepare(props.items);
        const query = props.initialQuery || '';
        this.state = {query, active: 0, groups: this.resultsFor(query)};
    }
    componentDidMount () {
        if (this.input) this.input.focus();
    }
    componentDidUpdate (prevProps, prevState) {
        if (prevState.active !== this.state.active && this.list) {
            const element = this.list.querySelector(`#${optionId(this.state.active)}`);
            if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({block: 'nearest'});
        }
    }
    resultsFor (query) {
        const results = query.trim() ? search(this.prepared, query, LIMIT) : firstItems(this.prepared);
        return groupResults(results);
    }
    flat () {
        return this.state.groups.reduce((all, group) => all.concat(group.items), []);
    }
    setInput (element) {
        this.input = element;
    }
    setList (element) {
        this.list = element;
    }
    handleChange (event) {
        const query = event.target.value;
        this.setState({query, active: 0, groups: this.resultsFor(query)});
    }
    pick (index) {
        const entry = this.flat()[index];
        if (entry) this.props.onPick(entry);
    }
    handleKeyDown (event) {
        const count = this.flat().length;
        switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            if (count) this.setState(state => ({active: (state.active + 1) % count}));
            break;
        case 'ArrowUp':
            event.preventDefault();
            if (count) this.setState(state => ({active: (state.active - 1 + count) % count}));
            break;
        case 'PageDown':
            event.preventDefault();
            if (count) this.setState(state => ({active: Math.min(count - 1, state.active + 8)}));
            break;
        case 'PageUp':
            event.preventDefault();
            if (count) this.setState(state => ({active: Math.max(0, state.active - 8)}));
            break;
        case 'Enter':
            event.preventDefault();
            this.pick(this.state.active);
            break;
        case 'Escape':
            event.preventDefault();
            event.stopPropagation();
            this.props.onClose();
            break;
        case 'Tab':
            event.preventDefault();
            break;
        default:
            break;
        }
    }
    indexFromEvent (event) {
        const option = event.target.closest('[data-index]');
        return option ? Number(option.getAttribute('data-index')) : -1;
    }
    handleListMove (event) {
        const index = this.indexFromEvent(event);
        if (index !== -1 && index !== this.state.active) this.setState({active: index});
    }
    handleListClick (event) {
        const index = this.indexFromEvent(event);
        if (index !== -1) this.pick(index);
    }
    handleScrimDown (event) {
        if (event.target === event.currentTarget) this.props.onClose();
    }
    renderOption (entry, index) {
        const active = index === this.state.active;
        return (
            <div
                aria-selected={active}
                className={classNames(styles.option, {[styles.active]: active})}
                data-index={index}
                id={optionId(index)}
                key={entry.id}
                role="option"
            >
                {entry.severity ? (
                    <span
                        aria-hidden="true"
                        className={classNames(styles.dot, styles[entry.severity])}
                    />
                ) : null}
                <span className={styles.label}>{entry.label}</span>
                {entry.detail ? <span className={styles.detail}>{entry.detail}</span> : null}
            </div>
        );
    }
    render () {
        const {intl} = this.props;
        const {active, groups, query} = this.state;
        const label = intl.formatMessage(uiMessages.label);
        const count = groups.reduce((total, group) => total + group.items.length, 0);
        let index = 0;
        return (
            <div
                className={styles.scrim}
                onMouseDown={this.handleScrimDown}
            >
                <div
                    aria-label={label}
                    aria-modal="true"
                    className={styles.dialog}
                    role="dialog"
                >
                    <div className={styles.field}>
                        <SqIcon
                            className={styles.searchIcon}
                            name="search"
                            size={20}
                        />
                        <input
                            aria-activedescendant={count ? optionId(active) : null}
                            aria-autocomplete="list"
                            aria-controls={LISTBOX_ID}
                            aria-expanded="true"
                            aria-label={label}
                            autoComplete="off"
                            className={styles.input}
                            onChange={this.handleChange}
                            onKeyDown={this.handleKeyDown}
                            placeholder={label}
                            ref={this.setInput}
                            role="combobox"
                            spellCheck="false"
                            type="text"
                            value={query}
                        />
                    </div>
                    <div
                        aria-label={label}
                        className={styles.list}
                        id={LISTBOX_ID}
                        onClick={this.handleListClick}
                        onMouseMove={this.handleListMove}
                        ref={this.setList}
                        role="listbox"
                    >
                        {groups.map(group => {
                            const headingId = `sq-palette-group-${group.kind}`;
                            return (
                                <div
                                    aria-labelledby={headingId}
                                    className={styles.group}
                                    key={group.kind}
                                    role="group"
                                >
                                    <div
                                        className={styles.groupTitle}
                                        id={headingId}
                                        role="presentation"
                                    >
                                        {intl.formatMessage(kindMessages[group.kind])}
                                    </div>
                                    {group.items.map(entry => this.renderOption(entry, index++))}
                                </div>
                            );
                        })}
                        {count ? null : (
                            <p className={styles.empty}>{intl.formatMessage(uiMessages.empty, {query})}</p>
                        )}
                    </div>
                    <div className={styles.footer}>
                        <span
                            aria-live="polite"
                            className={styles.count}
                            role="status"
                        >
                            {intl.formatMessage(uiMessages.results, {count})}
                        </span>
                        <span aria-hidden="true">{intl.formatMessage(uiMessages.hint)}</span>
                    </div>
                </div>
            </div>
        );
    }
}

CommandPalette.propTypes = {
    initialQuery: PropTypes.string,
    intl: intlShape.isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        kind: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        run: PropTypes.func
    })).isRequired,
    onClose: PropTypes.func.isRequired,
    onPick: PropTypes.func.isRequired
};

export default injectIntl(CommandPalette);

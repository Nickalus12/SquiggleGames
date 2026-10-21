import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import messages from './setup-messages.js';
import {KEEP, LIMITS, ORDER, SEE, blankBoard, blankPlayer, normalizeSetup} from './setup-model.js';
import styles from './game-setup-sheet.css';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';

const SEE_TEXT = {all: messages.seeAll, self: messages.seeSelf};
const ORDER_TEXT = {high: messages.orderHigh, low: messages.orderLow};
const KEEP_TEXT = {best: messages.keepBest, last: messages.keepLast};

const toggle = (list, id, on) => {
    const rest = list.filter(item => item !== id);
    return on ? rest.concat(id) : rest;
};

const replaceAt = (list, index, patch) => list.map((item, i) => {
    if (i !== index) return item;
    return typeof patch === 'object' && patch !== null ? Object.assign({}, item, patch) : patch;
});

const removeAt = (list, index) => list.filter((item, i) => i !== index);

class GameSetupSheet extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleClick',
            'handleKeyDown',
            'handleSave',
            'setSheet'
        ]);
        const setup = props.setup || normalizeSetup(null);
        this.state = {
            secret: setup.secret.slice(),
            saved: setup.saved.slice(),
            players: setup.players.map(player => Object.assign({}, player, {default: String(player.default)})),
            teams: setup.teams.slice(),
            boards: setup.boards.map(board => Object.assign({}, board)),
            player: setup.player || ''
        };
    }
    componentDidMount () {
        const first = this.sheet && this.sheet.querySelector(FOCUSABLE);
        if (first) first.focus();
    }
    setSheet (el) {
        this.sheet = el;
    }
    draft () {
        return normalizeSetup(this.state, this.props.variables, this.props.sprites);
    }
    handleSave () {
        this.props.onSave(this.draft());
    }
    handleChange (e) {
        const {section, index, field, id} = e.target.dataset;
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (section === 'player') {
            this.setState({player: value});
            return;
        }
        if (section === 'secret' || section === 'saved') {
            this.setState({[section]: toggle(this.state[section], id, value)});
            return;
        }
        const at = Number(index);
        if (section === 'teams') {
            this.setState({teams: replaceAt(this.state.teams, at, value)});
            return;
        }
        this.setState({[section]: replaceAt(this.state[section], at, {[field]: value})});
    }
    handleClick (e) {
        const {action, section, index} = e.currentTarget.dataset;
        if (action === 'remove') {
            this.setState({[section]: removeAt(this.state[section], Number(index))});
            return;
        }
        if (action !== 'add') return;
        const blank = {players: blankPlayer, teams: () => '', boards: blankBoard}[section];
        if (this.state[section].length >= LIMITS[section]) return;
        this.setState({[section]: this.state[section].concat(blank())});
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.props.onClose();
            return;
        }
        if (e.key !== 'Tab' || !this.sheet) return;
        const items = Array.from(this.sheet.querySelectorAll(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    renderCount (section) {
        return (
            <span className={styles.count}>
                {this.props.intl.formatMessage(messages.limit, {
                    count: this.state[section].length,
                    max: LIMITS[section]
                })}
            </span>
        );
    }
    renderAdd (section, label) {
        return (
            <button
                className={styles.add}
                data-action="add"
                data-section={section}
                disabled={this.state[section].length >= LIMITS[section]}
                type="button"
                onClick={this.handleClick}
            >
                {this.props.intl.formatMessage(label)}
            </button>
        );
    }
    renderRemove (section, index) {
        return (
            <button
                aria-label={this.props.intl.formatMessage(messages.remove)}
                className={styles.remove}
                data-action="remove"
                data-index={index}
                data-section={section}
                type="button"
                onClick={this.handleClick}
            >
                {'×'}
            </button>
        );
    }
    renderSelect (section, index, field, value, options, text) {
        return (
            <select
                className={styles.select}
                data-field={field}
                data-index={index}
                data-section={section}
                value={value}
                onChange={this.handleChange}
            >
                {options.map(option => (
                    <option
                        key={option}
                        value={option}
                    >
                        {this.props.intl.formatMessage(text[option])}
                    </option>
                ))}
            </select>
        );
    }
    renderValues () {
        const {intl, variables} = this.props;
        if (!variables.length) return <p className={styles.empty}>{intl.formatMessage(messages.noValues)}</p>;
        return (
            <ul className={styles.rows}>
                {variables.map(variable => (
                    <li
                        className={styles.row}
                        key={variable.id}
                    >
                        <span className={styles.valueName}>
                            {variable.name}
                            {variable.kind === 'list' ? (
                                <span className={styles.tag}>{intl.formatMessage(messages.list)}</span>
                            ) : null}
                        </span>
                        {['secret', 'saved'].map(section => (
                            <label
                                className={styles.check}
                                key={section}
                            >
                                <input
                                    checked={this.state[section].includes(variable.id)}
                                    data-id={variable.id}
                                    data-section={section}
                                    type="checkbox"
                                    onChange={this.handleChange}
                                />
                                <span>{intl.formatMessage(messages[section])}</span>
                            </label>
                        ))}
                    </li>
                ))}
            </ul>
        );
    }
    renderPlayers () {
        const {intl} = this.props;
        return (
            <ul className={styles.rows}>
                {this.state.players.map((player, index) => (
                    <li
                        className={styles.row}
                        key={index}
                    >
                        <input
                            aria-label={intl.formatMessage(messages.playerName)}
                            className={styles.text}
                            data-field="name"
                            data-index={index}
                            data-section="players"
                            maxLength={LIMITS.name}
                            placeholder={intl.formatMessage(messages.playerName)}
                            type="text"
                            value={player.name}
                            onChange={this.handleChange}
                        />
                        <input
                            aria-label={intl.formatMessage(messages.playerStart)}
                            className={styles.short}
                            data-field="default"
                            data-index={index}
                            data-section="players"
                            maxLength={LIMITS.name}
                            placeholder={intl.formatMessage(messages.playerStart)}
                            type="text"
                            value={player.default}
                            onChange={this.handleChange}
                        />
                        {this.renderSelect('players', index, 'see', player.see, SEE, SEE_TEXT)}
                        <label className={styles.check}>
                            <input
                                checked={player.save}
                                data-field="save"
                                data-index={index}
                                data-section="players"
                                type="checkbox"
                                onChange={this.handleChange}
                            />
                            <span>{intl.formatMessage(messages.saved)}</span>
                        </label>
                        {this.renderRemove('players', index)}
                    </li>
                ))}
            </ul>
        );
    }
    renderTeams () {
        const {intl} = this.props;
        return (
            <ul className={styles.rows}>
                {this.state.teams.map((team, index) => (
                    <li
                        className={styles.row}
                        key={index}
                    >
                        <input
                            aria-label={intl.formatMessage(messages.teamName)}
                            className={styles.text}
                            data-index={index}
                            data-section="teams"
                            maxLength={LIMITS.name}
                            placeholder={intl.formatMessage(messages.teamName)}
                            type="text"
                            value={team}
                            onChange={this.handleChange}
                        />
                        {this.renderRemove('teams', index)}
                    </li>
                ))}
            </ul>
        );
    }
    renderBoards () {
        const {intl} = this.props;
        return (
            <ul className={styles.rows}>
                {this.state.boards.map((board, index) => (
                    <li
                        className={styles.row}
                        key={index}
                    >
                        <input
                            aria-label={intl.formatMessage(messages.boardName)}
                            className={styles.text}
                            data-field="name"
                            data-index={index}
                            data-section="boards"
                            maxLength={LIMITS.name}
                            placeholder={intl.formatMessage(messages.boardName)}
                            type="text"
                            value={board.name}
                            onChange={this.handleChange}
                        />
                        {this.renderSelect('boards', index, 'order', board.order, ORDER, ORDER_TEXT)}
                        {this.renderSelect('boards', index, 'keep', board.keep, KEEP, KEEP_TEXT)}
                        {this.renderRemove('boards', index)}
                    </li>
                ))}
            </ul>
        );
    }
    renderPlayerSprite () {
        const {intl, sprites} = this.props;
        return (
            <div className={styles.row}>
                <select
                    aria-label={intl.formatMessage(messages.playerSprite)}
                    className={styles.select}
                    data-section="player"
                    value={this.state.player}
                    onChange={this.handleChange}
                >
                    <option value="">{intl.formatMessage(messages.playerSpriteFirst)}</option>
                    {sprites.map(name => (
                        <option
                            key={name}
                            value={name}
                        >
                            {name}
                        </option>
                    ))}
                </select>
                <p className={styles.note}>{intl.formatMessage(messages.playerSpriteHelp)}</p>
            </div>
        );
    }
    renderSection (heading, section, body, addLabel) {
        return (
            <section className={styles.section}>
                <h4 className={styles.heading}>
                    {this.props.intl.formatMessage(heading)}
                    {section ? this.renderCount(section) : null}
                </h4>
                {body}
                {section ? this.renderAdd(section, addLabel) : null}
            </section>
        );
    }
    render () {
        const {intl, onClose} = this.props;
        return (
            <div
                className={styles.backdrop}
                data-game-setup-sheet
                onKeyDown={this.handleKeyDown}
            >
                <div
                    aria-labelledby="sq-game-setup-title"
                    aria-modal="true"
                    className={styles.sheet}
                    ref={this.setSheet}
                    role="dialog"
                >
                    <h3
                        className={styles.title}
                        id="sq-game-setup-title"
                    >
                        {intl.formatMessage(messages.title)}
                    </h3>
                    <p className={styles.intro}>{intl.formatMessage(messages.intro)}</p>
                    {this.renderSection(messages.playerSprite, null, this.renderPlayerSprite())}
                    {this.renderSection(messages.values, null, this.renderValues())}
                    {this.renderSection(messages.players, 'players', this.renderPlayers(), messages.addPlayer)}
                    {this.renderSection(messages.teams, 'teams', this.renderTeams(), messages.addTeam)}
                    {this.renderSection(messages.boards, 'boards', this.renderBoards(), messages.addBoard)}
                    <p className={styles.note}>{intl.formatMessage(messages.timersNote)}</p>
                    <p className={styles.note}>{intl.formatMessage(messages.savesNote)}</p>
                    <div className={styles.buttons}>
                        <button
                            className={styles.secondary}
                            type="button"
                            onClick={onClose}
                        >
                            {intl.formatMessage(messages.cancel)}
                        </button>
                        <button
                            className={styles.primary}
                            data-game-setup-save
                            type="button"
                            onClick={this.handleSave}
                        >
                            {intl.formatMessage(messages.save)}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

GameSetupSheet.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    setup: PropTypes.shape({
        secret: PropTypes.arrayOf(PropTypes.string),
        saved: PropTypes.arrayOf(PropTypes.string),
        players: PropTypes.arrayOf(PropTypes.object),
        teams: PropTypes.arrayOf(PropTypes.string),
        boards: PropTypes.arrayOf(PropTypes.object),
        player: PropTypes.string
    }),
    sprites: PropTypes.arrayOf(PropTypes.string),
    variables: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        kind: PropTypes.oneOf(['variable', 'list'])
    })).isRequired
};

GameSetupSheet.defaultProps = {
    sprites: []
};

export {GameSetupSheet};
export default injectIntl(GameSetupSheet);

import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {gameData} from '../../lib/libraries/extensions/squigglegamedata/index.js';
import {LIMITS} from '../../lib/libraries/extensions/squigglegamedata/store.js';
import {boardRows, statusKey, usage, valueRows} from './model.js';
import styles from './game-data-panel.css';

const messages = defineMessages({
    loading: {
        defaultMessage: 'Getting your saves.',
        description: 'Game data panel status while saves load',
        id: 'sq.gameData.status.loading'
    },
    saving: {
        defaultMessage: 'Saving to your account.',
        description: 'Game data panel status while a save is on its way',
        id: 'sq.gameData.status.saving'
    },
    saved: {
        defaultMessage: 'Saved to your account. Play on any device and they are there.',
        description: 'Game data panel status when saves are on the account',
        id: 'sq.gameData.status.saved'
    },
    offline: {
        defaultMessage: 'Squiggle is out of reach right now. Keep playing, your saves go up when it is back.',
        description: 'Game data panel status when the server cannot be reached',
        id: 'sq.gameData.status.offline'
    },
    full: {
        defaultMessage: 'Your game is full. Forget a save to make room for a new one.',
        description: 'Game data panel status when a player has too many saves',
        id: 'sq.gameData.status.full'
    },
    signedOut: {
        defaultMessage: 'Saves stay on this device. Sign in to keep them on every device.',
        description: 'Game data panel status for someone who is not signed in',
        id: 'sq.gameData.status.signedOut'
    },
    device: {
        defaultMessage: 'Saves stay on this device for now.',
        description: 'Game data panel status when saves are kept locally',
        id: 'sq.gameData.status.device'
    },
    unsaved: {
        defaultMessage: 'Save your game in a room to keep test saves on your account. Until then they stay here.',
        description: 'Game data panel status in an editor with no saved game',
        id: 'sq.gameData.status.unsaved'
    }
});

class GameDataPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleRefresh', 'handleAskReset', 'handleCancel', 'handleReset', 'handleAskClear', 'handleClear'
        ]);
        this.state = {snapshot: props.store.snapshot(), confirm: null, note: null};
    }
    componentDidMount () {
        this.off = this.props.store.onChange(this.handleRefresh);
    }
    componentWillUnmount () {
        if (this.off) this.off();
    }
    handleRefresh () {
        this.setState({snapshot: this.props.store.snapshot()});
    }
    handleAskReset () {
        this.setState({confirm: {kind: 'handleReset'}, note: null});
    }
    handleAskClear (event) {
        this.setState({confirm: {kind: 'handleClear', board: event.currentTarget.dataset.board}, note: null});
    }
    handleCancel () {
        this.setState({confirm: null});
    }
    handleReset () {
        this.setState({confirm: null});
        this.props.store.resetMine().then(ok => this.setState({note: ok ? 'handleReset' : 'failed'}));
    }
    handleClear () {
        const board = this.state.confirm && this.state.confirm.board;
        this.setState({confirm: null});
        this.props.store.clearBoard(board).then(ok => this.setState({note: ok ? 'cleared' : 'notMaker'}));
    }
    render () {
        const {intl} = this.props;
        const {snapshot, confirm, note} = this.state;
        const values = valueRows(snapshot);
        const boards = boardRows(snapshot);
        const {used} = usage(snapshot);
        return (
            <div
                className={styles.panel}
                data-game-data-panel
            >
                <p className={styles.intro}>
                    <FormattedMessage
                        defaultMessage="Test your game's saves here. Every player gets their own."
                        description="Intro line of the Game data panel"
                        id="sq.gameData.intro"
                    />
                </p>
                <p
                    className={styles.status}
                    aria-live="polite"
                    data-status={statusKey(snapshot)}
                >
                    {intl.formatMessage(messages[statusKey(snapshot)])}
                </p>

                <h3 className={styles.title}>
                    <FormattedMessage
                        defaultMessage="Your saves ({used} of {max})"
                        description="Heading over the list of saved values in the Game data panel"
                        id="sq.gameData.savesTitle"
                        values={{used, max: LIMITS.keys}}
                    />
                </h3>
                {values.length ? (
                    <ul className={styles.list}>
                        {values.map(row => (
                            <li
                                className={styles.row}
                                key={row.name}
                            >
                                <span className={styles.name}>{row.name}</span>
                                <span className={styles.value}>{row.text}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className={styles.empty}>
                        <FormattedMessage
                            defaultMessage="No saves yet. Use the save block in your game, then press the green flag."
                            description="Game data panel when the player has no saved values"
                            id="sq.gameData.noSaves"
                        />
                    </p>
                )}
                {confirm && confirm.kind === 'handleReset' ? (
                    <div className={styles.confirm}>
                        <span>
                            <FormattedMessage
                                defaultMessage="Forget all your saves for this game?"
                                description="Question before the Game data panel resets the maker's saves"
                                id="sq.gameData.resetAsk"
                            />
                        </span>
                        <button
                            className={styles.danger}
                            onClick={this.handleReset}
                        >
                            <FormattedMessage
                                defaultMessage="Yes, forget them"
                                description="Button that confirms resetting saves"
                                id="sq.gameData.resetYes"
                            />
                        </button>
                        <button
                            className={styles.button}
                            onClick={this.handleCancel}
                        >
                            <FormattedMessage
                                defaultMessage="Keep them"
                                description="Button that cancels resetting saves"
                                id="sq.gameData.keep"
                            />
                        </button>
                    </div>
                ) : (
                    <button
                        className={styles.button}
                        disabled={!values.length}
                        onClick={this.handleAskReset}
                    >
                        <FormattedMessage
                            defaultMessage="Reset my saves"
                            description="Button that starts resetting the maker's own saves"
                            id="sq.gameData.reset"
                        />
                    </button>
                )}

                <h3 className={styles.title}>
                    <FormattedMessage
                        defaultMessage="Boards"
                        description="Heading over the list of top 10 boards in the Game data panel"
                        id="sq.gameData.boardsTitle"
                    />
                </h3>
                {boards.length ? (
                    <ul className={styles.list}>
                        {boards.map(row => (
                            <li
                                className={styles.row}
                                key={row.board}
                            >
                                <span className={styles.name}>{row.board}</span>
                                <span className={styles.value}>
                                    <FormattedMessage
                                        defaultMessage="your best {best}"
                                        description="A maker's own best score on one board"
                                        id="sq.gameData.best"
                                        values={{best: row.best}}
                                    />
                                    {row.place ? (
                                        <React.Fragment>
                                            {', '}
                                            <FormattedMessage
                                                defaultMessage="place {place}"
                                                description="A maker's place on one board"
                                                id="sq.gameData.place"
                                                values={{place: row.place}}
                                            />
                                        </React.Fragment>
                                    ) : null}
                                </span>
                                {confirm && confirm.kind === 'handleClear' && confirm.board === row.board ? (
                                    <span className={styles.confirm}>
                                        <button
                                            className={styles.danger}
                                            onClick={this.handleClear}
                                        >
                                            <FormattedMessage
                                                defaultMessage="Yes, clear it"
                                                description="Button that confirms clearing a board"
                                                id="sq.gameData.clearYes"
                                            />
                                        </button>
                                        <button
                                            className={styles.button}
                                            onClick={this.handleCancel}
                                        >
                                            <FormattedMessage
                                                defaultMessage="Keep it"
                                                description="Button that cancels clearing a board"
                                                id="sq.gameData.keepBoard"
                                            />
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        className={styles.button}
                                        data-board={row.board}
                                        onClick={this.handleAskClear}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Clear board"
                                            description="Button that starts clearing every score on a board"
                                            id="sq.gameData.clear"
                                        />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className={styles.empty}>
                        <FormattedMessage
                            defaultMessage="No scores yet. Use post score in your game to start a top 10."
                            description="Game data panel when there are no boards"
                            id="sq.gameData.noBoards"
                        />
                    </p>
                )}
                {note ? (
                    <p
                        className={styles.note}
                        role="status"
                    >
                        {note === 'handleReset' && (
                            <FormattedMessage
                                defaultMessage="Your saves are gone. Press the green flag to start fresh."
                                description="After the maker's saves were reset"
                                id="sq.gameData.resetDone"
                            />
                        )}
                        {note === 'cleared' && (
                            <FormattedMessage
                                defaultMessage="The board is empty now."
                                description="After a board was cleared"
                                id="sq.gameData.clearDone"
                            />
                        )}
                        {note === 'notMaker' && (
                            <FormattedMessage
                                defaultMessage="Only the person who made this game can clear its boards."
                                description="When clearing a board was refused"
                                id="sq.gameData.notMaker"
                            />
                        )}
                        {note === 'failed' && (
                            <FormattedMessage
                                defaultMessage="That did not work. Try again in a moment."
                                description="When resetting saves failed"
                                id="sq.gameData.failed"
                            />
                        )}
                    </p>
                ) : null}
            </div>
        );
    }
}

GameDataPanel.propTypes = {
    intl: intlShape.isRequired,
    store: PropTypes.shape({
        snapshot: PropTypes.func,
        onChange: PropTypes.func,
        resetMine: PropTypes.func,
        clearBoard: PropTypes.func
    })
};

GameDataPanel.defaultProps = {
    store: gameData
};

export default injectIntl(GameDataPanel);

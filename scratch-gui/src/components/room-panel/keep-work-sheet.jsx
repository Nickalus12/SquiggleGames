import bindAll from 'lodash.bindall';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {MINE, THEIRS, setKeepWorkHandler} from '../../lib/collab/keep-work.js';
import styles from './keep-work-sheet.css';

const TITLE_ID = 'sq-keep-work-title';
const BODY_ID = 'sq-keep-work-body';

const messages = defineMessages({
    title: {
        id: 'sq.keepWork.title',
        defaultMessage: 'You and the room both changed things',
        description: 'Heading of the sheet shown when a reconnect finds the room moved on'
    },
    body: {
        id: 'sq.keepWork.body',
        defaultMessage: '{count, plural, =0 {While you were away the room changed too.} ' +
            'one {While you were away the room changed too. # of your changes has not reached it yet.} ' +
            'other {While you were away the room changed too. # of your changes have not reached it yet.}}',
        description: 'Explains the keep my work choice'
    },
    mine: {id: 'sq.keepWork.mine', defaultMessage: 'Keep my work', description: 'Re-applies your changes'},
    mineHelp: {
        id: 'sq.keepWork.mineHelp',
        defaultMessage: 'Your changes go on top of the room version. A copy of your version goes to your library too.',
        description: 'Explains keep my work'
    },
    theirs: {id: 'sq.keepWork.theirs', defaultMessage: 'Use the room\'s', description: 'Drops your changes'},
    theirsHelp: {
        id: 'sq.keepWork.theirsHelp',
        defaultMessage: 'Your changes are dropped. A copy goes to your library.',
        description: 'Explains use the room version'
    }
});

class KeepWorkSheet extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['ask', 'handleMine', 'handleTheirs', 'handleKeyDown', 'setMine', 'setRoot']);
        this.state = {open: false, pending: 0};
        this.resolve = null;
    }
    componentDidMount () {
        setKeepWorkHandler(this.ask);
    }
    componentDidUpdate (prev, prevState) {
        if (this.state.open && !prevState.open) {
            this.opener = document.activeElement;
            if (this.mine) this.mine.focus();
        }
    }
    componentWillUnmount () {
        setKeepWorkHandler(null);
        this.choose(THEIRS);
    }
    ask ({pending}) {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.setState({open: true, pending});
        });
    }
    choose (choice) {
        const resolve = this.resolve;
        this.resolve = null;
        if (resolve) resolve(choice);
    }
    close (choice) {
        this.choose(choice);
        this.setState({open: false});
        if (this.opener && document.contains(this.opener)) this.opener.focus();
        this.opener = null;
    }
    handleMine () {
        this.close(MINE);
    }
    handleTheirs () {
        this.close(THEIRS);
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (e.key !== 'Tab' || !this.root) return;
        const buttons = this.root.querySelectorAll('button');
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    setMine (el) {
        this.mine = el;
    }
    setRoot (el) {
        this.root = el;
    }
    render () {
        if (!this.state.open) return null;
        const {intl} = this.props;
        return (
            <div className={styles.scrim}>
                <div
                    aria-describedby={BODY_ID}
                    aria-labelledby={TITLE_ID}
                    aria-modal="true"
                    className={styles.sheet}
                    data-keep-work
                    ref={this.setRoot}
                    role="alertdialog"
                    onKeyDown={this.handleKeyDown}
                >
                    <h2
                        className={styles.title}
                        id={TITLE_ID}
                    >
                        {intl.formatMessage(messages.title)}
                    </h2>
                    <p
                        className={styles.body}
                        id={BODY_ID}
                    >
                        {intl.formatMessage(messages.body, {count: this.state.pending})}
                    </p>
                    <div className={styles.choices}>
                        <button
                            className={styles.primary}
                            data-keep-work-choice={MINE}
                            ref={this.setMine}
                            type="button"
                            onClick={this.handleMine}
                        >
                            <span className={styles.label}>{intl.formatMessage(messages.mine)}</span>
                            <span className={styles.help}>{intl.formatMessage(messages.mineHelp)}</span>
                        </button>
                        <button
                            className={styles.secondary}
                            data-keep-work-choice={THEIRS}
                            type="button"
                            onClick={this.handleTheirs}
                        >
                            <span className={styles.label}>{intl.formatMessage(messages.theirs)}</span>
                            <span className={styles.help}>{intl.formatMessage(messages.theirsHelp)}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

KeepWorkSheet.propTypes = {
    intl: intlShape.isRequired
};

export default injectIntl(KeepWorkSheet);

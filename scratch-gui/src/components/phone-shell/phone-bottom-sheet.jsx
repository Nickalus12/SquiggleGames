import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon';
import {closeSheet, getState, subscribe} from './phone-slots';

import styles from './phone-shell.css';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const messages = defineMessages({
    close: {
        id: 'sq.phone.sheet.close',
        defaultMessage: 'Close',
        description: 'Button that closes the bottom sheet on phones'
    },
    expand: {
        id: 'sq.phone.sheet.expand',
        defaultMessage: 'Make bigger',
        description: 'Handle that makes the bottom sheet taller on phones'
    },
    collapse: {
        id: 'sq.phone.sheet.collapse',
        defaultMessage: 'Make smaller',
        description: 'Handle that makes the bottom sheet shorter on phones'
    }
});

class PhoneBottomSheet extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleClose',
            'handleKeyDown',
            'handleToggleSize',
            'setSheet'
        ]);
        const sheet = getState().sheet;
        this.state = {sheet, full: !!(sheet && sheet.size === 'full')};
    }
    componentDidMount () {
        this.unsubscribe = subscribe(this.handleChange);
        if (this.state.sheet) this.focusSheet();
    }
    componentDidUpdate (prevProps, prevState) {
        const before = prevState.sheet && prevState.sheet.id;
        const after = this.state.sheet && this.state.sheet.id;
        if (before === after) return;
        if (after) {
            this.returnFocus = document.activeElement;
            this.focusSheet();
        } else if (this.returnFocus && this.returnFocus.isConnected) {
            this.returnFocus.focus();
            this.returnFocus = null;
        }
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
    }
    setSheet (el) {
        this.sheetEl = el;
    }
    focusSheet () {
        if (!this.sheetEl) return;
        const title = this.sheetEl.querySelector('[data-sheet-title]');
        const target = title || this.sheetEl.querySelector(FOCUSABLE);
        if (target) target.focus();
    }
    handleChange (next) {
        if (next.sheet === this.state.sheet) return;
        this.setState({sheet: next.sheet, full: !!(next.sheet && next.sheet.size === 'full')});
    }
    handleClose () {
        if (this.state.sheet) closeSheet(this.state.sheet.id);
    }
    handleKeyDown (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this.handleClose();
        }
    }
    handleToggleSize () {
        this.setState(prev => ({full: !prev.full}));
    }
    render () {
        const {intl} = this.props;
        const {sheet, full} = this.state;
        const open = !!sheet;
        const titleId = open ? `sq-sheet-title-${sheet.id}` : null;
        return (
            <section
                aria-hidden={open ? null : 'true'}
                aria-labelledby={titleId}
                className={classNames(styles.sheet, {
                    [styles.sheetOpen]: open,
                    [styles.sheetFull]: full
                })}
                data-phone-sheet={open ? sheet.id : ''}
                ref={this.setSheet}
                role={open ? 'dialog' : null}
                onKeyDown={this.handleKeyDown}
            >
                {open ? (
                    <React.Fragment>
                        <button
                            aria-label={intl.formatMessage(full ? messages.collapse : messages.expand)}
                            className={styles.sheetHandle}
                            type="button"
                            onClick={this.handleToggleSize}
                        >
                            <span className={styles.sheetGrip} />
                        </button>
                        <header className={styles.sheetHeader}>
                            <h2
                                className={styles.sheetTitle}
                                data-sheet-title
                                id={titleId}
                                tabIndex={-1}
                            >
                                {sheet.title}
                            </h2>
                            <button
                                aria-label={intl.formatMessage(messages.close)}
                                className={styles.iconButton}
                                type="button"
                                onClick={this.handleClose}
                            >
                                <SqIcon name="close" />
                            </button>
                        </header>
                        <div
                            className={styles.sheetBody}
                            data-sheet-body
                        >
                            {sheet.render()}
                        </div>
                    </React.Fragment>
                ) : null}
            </section>
        );
    }
}

PhoneBottomSheet.propTypes = {
    intl: intlShape.isRequired
};

export default injectIntl(PhoneBottomSheet);

import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';

import SqIcon from '../sq-icon/sq-icon.jsx';
import {fixLabel, itemText} from '../../lib/checker/messages';
import messages from './messages';
import styles from './checker-pill.css';

const GROUPS = Object.freeze(['error', 'warn', 'info']);

const SEVERITY_CLASS = {
    error: styles.error,
    warn: styles.warn,
    info: styles.info
};

class CheckerPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyDown',
            'handleClick',
            'setRoot'
        ]);
    }
    componentDidMount () {
        const first = this.root && this.root.querySelector('button');
        if (first) first.focus();
    }
    setRoot (element) {
        this.root = element;
    }
    handleKeyDown (event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.props.onClose(true);
        }
    }
    handleClick (event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const entry = this.props.items.find(found => found.key === button.getAttribute('data-key'));
        if (!entry) return;
        if (button.getAttribute('data-action') === 'fix') this.props.onFix(entry);
        else this.props.onShowMe(entry);
    }
    renderItem (entry) {
        const {busyKey, intl, targetName} = this.props;
        const fix = this.props.canFix(entry) ? fixLabel(intl, entry) : null;
        const where = targetName(entry.targetId);
        return (
            <li
                className={classNames(styles.item, SEVERITY_CLASS[entry.severity])}
                key={entry.key}
            >
                <span
                    aria-hidden="true"
                    className={styles.dot}
                />
                <div className={styles.itemBody}>
                    <p className={styles.itemText}>{itemText(intl, entry)}</p>
                    {where ? <p className={styles.itemWhere}>{where}</p> : null}
                    <div className={styles.actions}>
                        {entry.targetId ? (
                            <button
                                className={styles.action}
                                data-action="show"
                                data-key={entry.key}
                                disabled={busyKey === entry.key}
                                type="button"
                            >
                                {intl.formatMessage(messages.showMe)}
                            </button>
                        ) : null}
                        {fix ? (
                            <button
                                className={classNames(styles.action, styles.fix)}
                                data-action="fix"
                                data-key={entry.key}
                                disabled={busyKey === entry.key}
                                type="button"
                            >
                                {fix}
                            </button>
                        ) : null}
                    </div>
                </div>
            </li>
        );
    }
    render () {
        const {checked, id, intl, items, notice, onClose, onUndo} = this.props;
        const title = intl.formatMessage(messages.title);
        const headingId = `${id}-title`;
        return (
            <div
                aria-labelledby={headingId}
                className={styles.panel}
                id={id}
                onClick={this.handleClick}
                onKeyDown={this.handleKeyDown}
                ref={this.setRoot}
                role="dialog"
            >
                <div className={styles.header}>
                    <h2
                        className={styles.title}
                        id={headingId}
                    >
                        {title}
                    </h2>
                    <button
                        aria-label={intl.formatMessage(messages.close)}
                        className={styles.close}
                        onClick={onClose}
                        type="button"
                    >
                        <SqIcon
                            name="close"
                            size={16}
                        />
                    </button>
                </div>
                <div className={notice ? styles.noticeRow : null}>
                    <p
                        aria-live="polite"
                        className={notice ? styles.notice : styles.srOnly}
                        role="status"
                    >
                        {notice}
                    </p>
                    {notice && onUndo ? (
                        <button
                            className={styles.action}
                            onClick={onUndo}
                            type="button"
                        >
                            {intl.formatMessage(messages.undo)}
                        </button>
                    ) : null}
                </div>
                <div className={styles.scroll}>
                    {!checked || !items.length ? (
                        <p className={styles.empty}>
                            {intl.formatMessage(checked ? messages.empty : messages.checking)}
                        </p>
                    ) : GROUPS.map(severity => {
                        const group = items.filter(entry => entry.severity === severity);
                        if (!group.length) return null;
                        return (
                            <section
                                className={styles.group}
                                key={severity}
                            >
                                <h3 className={styles.groupTitle}>
                                    {intl.formatMessage(messages[severity])}
                                    <span className={styles.groupCount}>{group.length}</span>
                                </h3>
                                <ul className={styles.list}>
                                    {group.map(entry => this.renderItem(entry))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </div>
        );
    }
}

CheckerPanel.propTypes = {
    busyKey: PropTypes.string,
    canFix: PropTypes.func.isRequired,
    checked: PropTypes.bool,
    id: PropTypes.string.isRequired,
    intl: intlShape.isRequired,
    items: PropTypes.arrayOf(PropTypes.object).isRequired,
    notice: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onFix: PropTypes.func.isRequired,
    onShowMe: PropTypes.func.isRequired,
    onUndo: PropTypes.func,
    targetName: PropTypes.func.isRequired
};

export default injectIntl(CheckerPanel);

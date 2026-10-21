import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {touchLayoutFor} from '../../lib/touch-keys';

import styles from './touch-game-controls.css';

const messages = defineMessages({
    ArrowLeft: {
        id: 'gui.touchKeys.left',
        defaultMessage: 'Left arrow',
        description: 'On-screen game button that acts like the left arrow key'
    },
    ArrowUp: {
        id: 'gui.touchKeys.up',
        defaultMessage: 'Up arrow',
        description: 'On-screen game button that acts like the up arrow key'
    },
    ArrowDown: {
        id: 'gui.touchKeys.down',
        defaultMessage: 'Down arrow',
        description: 'On-screen game button that acts like the down arrow key'
    },
    ArrowRight: {
        id: 'gui.touchKeys.right',
        defaultMessage: 'Right arrow',
        description: 'On-screen game button that acts like the right arrow key'
    },
    space: {
        id: 'gui.touchKeys.space',
        defaultMessage: 'Space',
        description: 'On-screen game button that acts like the space bar'
    },
    shift: {
        id: 'sq.touchKeys.shift',
        defaultMessage: 'Shift',
        description: 'On-screen game button that acts like the Shift key'
    },
    enter: {
        id: 'sq.touchKeys.enter',
        defaultMessage: 'Enter',
        description: 'On-screen game button that acts like the Enter key'
    },
    letter: {
        id: 'sq.touchKeys.letter',
        defaultMessage: '{key} key',
        description: 'On-screen game button that acts like a letter or digit key, for example "E key"'
    }
});

const ARROW_PATHS = {
    up: 'M5 15l7-7 7 7',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    down: 'M5 9l7 7 7-7'
};

const ARROW_MESSAGES = {
    up: messages.ArrowUp,
    left: messages.ArrowLeft,
    right: messages.ArrowRight,
    down: messages.ArrowDown
};

const CELL_SLOTS = {
    up: styles.up,
    left: styles.left,
    right: styles.right,
    down: styles.down
};

const namesOf = el => {
    const value = el && el.getAttribute('data-touch-key');
    return value ? value.split(' ') : [];
};

class TouchGameControls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleActionDown',
            'handleContextMenu',
            'handlePadDown',
            'handlePadMove',
            'handlePointerEnd',
            'releaseAll',
            'setPad'
        ]);
        this.pointers = new Map();
        this.held = new Map();
        this.state = {down: {}};
    }
    componentDidMount () {
        window.addEventListener('blur', this.releaseAll);
    }
    componentWillUnmount () {
        window.removeEventListener('blur', this.releaseAll);
        this.releaseAll();
    }
    setPad (el) {
        this.pad = el;
    }
    press (name) {
        const count = (this.held.get(name) || 0) + 1;
        this.held.set(name, count);
        if (count > 1) return;
        this.props.onKey(name, true);
        this.setState(state => ({down: Object.assign({}, state.down, {[name]: true})}));
    }
    release (name) {
        const count = (this.held.get(name) || 0) - 1;
        if (count > 0) {
            this.held.set(name, count);
            return;
        }
        this.held.delete(name);
        this.props.onKey(name, false);
        this.setState(state => ({down: Object.assign({}, state.down, {[name]: false})}));
    }
    hold (pointerId, names) {
        const previous = this.pointers.get(pointerId) || [];
        if (previous.join(' ') === names.join(' ')) return;
        this.pointers.set(pointerId, names);
        names.forEach(name => this.press(name));
        previous.forEach(name => this.release(name));
    }
    drop (pointerId) {
        const previous = this.pointers.get(pointerId);
        if (!previous) return;
        this.pointers.delete(pointerId);
        previous.forEach(name => this.release(name));
    }
    releaseAll () {
        for (const name of this.held.keys()) this.props.onKey(name, false);
        this.held.clear();
        this.pointers.clear();
        this.setState({down: {}});
    }
    capture (e) {
        e.preventDefault();
        if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    }
    cellAt (x, y) {
        const hit = document.elementFromPoint(x, y);
        const el = hit && hit.closest && hit.closest('[data-touch-cell]');
        return el && this.pad && this.pad.contains(el) ? el : null;
    }
    handlePadDown (e) {
        if (this.pointers.has(e.pointerId)) return;
        const cell = e.target.closest ? e.target.closest('[data-touch-cell]') : null;
        this.capture(e);
        this.hold(e.pointerId, namesOf(cell));
    }
    handlePadMove (e) {
        if (!this.pointers.has(e.pointerId)) return;
        this.hold(e.pointerId, namesOf(this.cellAt(e.clientX, e.clientY)));
    }
    handleActionDown (e) {
        if (this.pointers.has(e.pointerId)) return;
        this.capture(e);
        this.hold(e.pointerId, namesOf(e.currentTarget));
    }
    handlePointerEnd (e) {
        this.drop(e.pointerId);
    }
    handleContextMenu (e) {
        e.preventDefault();
    }
    isDown (names) {
        return names.some(name => this.state.down[name]);
    }
    renderCell (cell) {
        const down = this.isDown(cell.names);
        const label = this.props.intl.formatMessage(ARROW_MESSAGES[cell.direction]);
        return (
            <button
                aria-label={label}
                aria-pressed={down}
                className={classNames(styles.key, CELL_SLOTS[cell.direction], {[styles.isDown]: down})}
                data-touch-cell={cell.direction}
                data-touch-key={cell.names.join(' ')}
                key={cell.direction}
                tabIndex={-1}
                type="button"
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                >
                    <path
                        d={ARROW_PATHS[cell.direction]}
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                    />
                </svg>
            </button>
        );
    }
    renderAction (name) {
        const down = this.isDown([name]);
        const {intl} = this.props;
        const named = messages[name];
        const text = named ? intl.formatMessage(named) : name.toUpperCase();
        const label = named ? text : intl.formatMessage(messages.letter, {key: text});
        return (
            <button
                aria-label={label}
                aria-pressed={down}
                className={classNames(styles.key, styles.action, {[styles.isDown]: down})}
                data-touch-key={name}
                key={name}
                tabIndex={-1}
                type="button"
                onContextMenu={this.handleContextMenu}
                onLostPointerCapture={this.handlePointerEnd}
                onPointerCancel={this.handlePointerEnd}
                onPointerDown={this.handleActionDown}
                onPointerUp={this.handlePointerEnd}
            >
                <span className={styles.keyLabel}>{text}</span>
            </button>
        );
    }
    render () {
        const {className, keys, layout} = this.props;
        const {pad, actions} = touchLayoutFor(keys);
        return (
            <div
                className={classNames(styles.controls, styles[layout], className)}
                data-touch-controls={layout}
                onContextMenu={this.handleContextMenu}
            >
                {pad.length ? (
                    <div
                        className={styles.pad}
                        data-touch-pad
                        ref={this.setPad}
                        onLostPointerCapture={this.handlePointerEnd}
                        onPointerCancel={this.handlePointerEnd}
                        onPointerDown={this.handlePadDown}
                        onPointerMove={this.handlePadMove}
                        onPointerUp={this.handlePointerEnd}
                    >
                        {pad.map(cell => this.renderCell(cell))}
                    </div>
                ) : null}
                {actions.length ? (
                    <div
                        className={classNames(styles.actions, {[styles.multi]: actions.length > 1})}
                        data-touch-actions={actions.length}
                    >
                        {actions.map(name => this.renderAction(name))}
                    </div>
                ) : null}
            </div>
        );
    }
}

TouchGameControls.propTypes = {
    className: PropTypes.string,
    intl: intlShape.isRequired,
    keys: PropTypes.arrayOf(PropTypes.string),
    layout: PropTypes.oneOf(['bottom', 'sides', 'overlay', 'stage']),
    onKey: PropTypes.func.isRequired
};

TouchGameControls.defaultProps = {
    layout: 'bottom'
};

export default injectIntl(TouchGameControls);

import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';

import SqIcon from '../sq-icon/sq-icon.jsx';
import messages from './messages';
import styles from './pip-stage.css';
import {clampPip, isFocusKey, nudge, resolvePip} from './geometry.js';
import {LAYOUT_MODES} from '../../lib/layout-mode.js';
import {exitFocusMode, movePip, toggleFocusMode} from '../../reducers/focus-mode.js';

const FOCUS_ATTRIBUTE = 'data-sq-focus';
const FALLBACK_SIZE = Object.freeze({width: 256, height: 228});

const viewport = () => ({width: window.innerWidth, height: window.innerHeight});

class PipStage extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyDown',
            'handleResize',
            'handlePointerDown',
            'handlePointerMove',
            'handlePointerUp',
            'handleHandleKey',
            'handleExit',
            'setPanel'
        ]);
        this.state = {drag: null, announce: ''};
        this.returnFocus = null;
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown, true);
        window.addEventListener('resize', this.handleResize);
        this.syncAttribute();
    }
    componentDidUpdate (prevProps) {
        if (this.props.active && this.props.isPhone) {
            this.props.onExit();
            return;
        }
        const shown = this.shown();
        const wasShown = prevProps.active && !prevProps.isPhone;
        if (shown === wasShown) return;
        this.syncAttribute();
        if (shown) this.enter();
        else this.leave();
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        window.removeEventListener('resize', this.handleResize);
        document.documentElement.removeAttribute(FOCUS_ATTRIBUTE);
    }
    enter () {
        this.returnFocus = document.activeElement;
        this.setState({announce: this.props.intl.formatMessage(messages.entered)});
    }
    leave () {
        const element = this.returnFocus;
        this.returnFocus = null;
        this.setState({drag: null, announce: ''});
        const inside = this.panel && this.panel.contains(document.activeElement);
        if ((inside || document.activeElement === document.body) && element && typeof element.focus === 'function' &&
            document.contains(element)) {
            element.focus();
        }
    }
    shown () {
        return !!this.props.active && !this.props.isPhone;
    }
    syncAttribute () {
        if (this.shown()) document.documentElement.setAttribute(FOCUS_ATTRIBUTE, 'on');
        else document.documentElement.removeAttribute(FOCUS_ATTRIBUTE);
    }
    size () {
        if (!this.panel) return FALLBACK_SIZE;
        const rect = this.panel.getBoundingClientRect();
        return rect.width && rect.height ? {width: rect.width, height: rect.height} : FALLBACK_SIZE;
    }
    position () {
        return this.state.drag ? this.state.drag.pos : resolvePip(this.props.pip, this.size(), viewport());
    }
    handleKeyDown (event) {
        if (!isFocusKey(event) || event.repeat || this.props.isPhone) return;
        event.preventDefault();
        event.stopPropagation();
        this.props.onToggle();
    }
    handleResize () {
        if (this.shown()) this.forceUpdate();
    }
    handlePointerDown (event) {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        const start = this.position();
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
        this.setState({
            drag: {
                pointerId: event.pointerId,
                dx: event.clientX - start.x,
                dy: event.clientY - start.y,
                pos: start
            }
        });
    }
    handlePointerMove (event) {
        const drag = this.state.drag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const pos = clampPip({x: event.clientX - drag.dx, y: event.clientY - drag.dy}, this.size(), viewport());
        this.setState({drag: Object.assign({}, drag, {pos})});
    }
    handlePointerUp (event) {
        const drag = this.state.drag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        this.setState({drag: null});
        this.props.onMove(drag.pos.x, drag.pos.y);
    }
    handleHandleKey (event) {
        const next = nudge(this.position(), event.key, event.shiftKey);
        if (!next) return;
        event.preventDefault();
        const pos = clampPip(next, this.size(), viewport());
        this.props.onMove(pos.x, pos.y);
    }
    handleExit () {
        this.props.onExit();
    }
    setPanel (element) {
        this.panel = element;
    }
    render () {
        const {intl} = this.props;
        const live = (
            <span
                aria-live="polite"
                className={styles.srOnly}
                role="status"
            >
                {this.state.announce}
            </span>
        );
        if (!this.shown()) return live;
        const pos = this.position();
        const moveLabel = intl.formatMessage(messages.move);
        return (
            <React.Fragment>
                {live}
                <section
                    aria-label={intl.formatMessage(messages.region)}
                    className={classNames(styles.pip, {[styles.dragging]: !!this.state.drag})}
                    ref={this.setPanel}
                    style={{transform: `translate(${pos.x}px, ${pos.y}px)`}}
                >
                    <div className={styles.bar}>
                        <button
                            aria-label={moveLabel}
                            className={styles.handle}
                            onKeyDown={this.handleHandleKey}
                            onPointerCancel={this.handlePointerUp}
                            onPointerDown={this.handlePointerDown}
                            onPointerMove={this.handlePointerMove}
                            onPointerUp={this.handlePointerUp}
                            title={moveLabel}
                            type="button"
                        >
                            <span
                                aria-hidden="true"
                                className={styles.grip}
                            />
                        </button>
                        <button
                            className={styles.exit}
                            onClick={this.handleExit}
                            type="button"
                        >
                            <SqIcon
                                name="focus"
                                size={16}
                            />
                            <span>{intl.formatMessage(messages.exit)}</span>
                        </button>
                    </div>
                    <div className={styles.stage}>
                        {this.props.children}
                    </div>
                </section>
            </React.Fragment>
        );
    }
}

PipStage.propTypes = {
    active: PropTypes.bool,
    children: PropTypes.node,
    intl: intlShape.isRequired,
    isPhone: PropTypes.bool,
    onExit: PropTypes.func.isRequired,
    onMove: PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired,
    pip: PropTypes.shape({
        x: PropTypes.number,
        y: PropTypes.number
    })
};

const mapStateToProps = state => {
    const focus = state.scratchGui.focusMode;
    const layout = state.scratchGui.layoutMode;
    return {
        active: !!(focus && focus.active),
        isPhone: !!(layout && layout.mode === LAYOUT_MODES.phone),
        pip: focus ? focus.pip : null
    };
};

const mapDispatchToProps = dispatch => ({
    onExit: () => dispatch(exitFocusMode()),
    onMove: (x, y) => dispatch(movePip(x, y)),
    onToggle: () => dispatch(toggleFocusMode())
});

export {FOCUS_ATTRIBUTE};
export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(PipStage));

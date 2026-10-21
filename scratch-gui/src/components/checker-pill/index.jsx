import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';

import CheckerPill from './checker-pill.jsx';
import messages from './messages';
import styles from './checker-pill.css';
import {createChecker} from '../../lib/checker/index.js';
import {createFixer} from '../../lib/checker/fixes.js';
import {closeCheckerPanel, setCheckerItems, topSeverity} from '../../reducers/checker.js';

const PORTAL_ID = 'sq-menu-right';
const PANEL_ID = 'sq-checker-panel';

const CheckerPanel = React.lazy(() => import(/* webpackChunkName: "checker-panel" */ './checker-panel.jsx'));

class CheckerPillContainer extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleResult',
            'handleToggle',
            'handleClose',
            'handleShowMe',
            'handleFix',
            'handleDocumentDown',
            'canFix',
            'targetName',
            'setWrap',
            'setButton'
        ]);
        this.state = {
            items: [],
            checked: false,
            open: false,
            busyKey: null,
            hidden: [],
            notice: '',
            host: null
        };
    }
    componentDidMount () {
        this.findHost();
        this.start(this.props.vm);
        document.addEventListener('mousedown', this.handleDocumentDown, true);
        document.addEventListener('touchstart', this.handleDocumentDown, true);
    }
    componentDidUpdate (prevProps) {
        if (this.props.requestOpen && !prevProps.requestOpen) this.openFromRequest();
        if (prevProps.vm !== this.props.vm) {
            this.stop();
            this.start(this.props.vm);
        }
    }
    componentWillUnmount () {
        this.stop();
        if (this.observer) this.observer.disconnect();
        document.removeEventListener('mousedown', this.handleDocumentDown, true);
        document.removeEventListener('touchstart', this.handleDocumentDown, true);
    }
    openFromRequest () {
        this.setState({open: true, notice: ''});
        this.props.onOpened();
    }
    start (vm) {
        if (!vm || !vm.runtime) return;
        this.checker = createChecker({vm, onResult: this.handleResult});
        this.fixer = createFixer({vm});
        this.checker.start();
    }
    stop () {
        if (this.checker) this.checker.stop();
        this.checker = null;
        this.fixer = null;
    }
    findHost () {
        if (this.props.inline) return;
        const host = document.getElementById(PORTAL_ID);
        if (host) {
            this.setState({host});
            return;
        }
        if (typeof MutationObserver === 'undefined') return;
        this.observer = new MutationObserver(() => {
            const found = document.getElementById(PORTAL_ID);
            if (!found) return;
            this.observer.disconnect();
            this.observer = null;
            this.setState({host: found});
        });
        this.observer.observe(document.body, {childList: true, subtree: true});
    }
    handleResult (items) {
        this.setState({items, checked: true, hidden: []});
        this.props.onItems(items);
    }
    handleToggle () {
        this.setState(state => ({open: !state.open, notice: ''}));
    }
    handleClose (returnFocus) {
        this.setState({open: false, notice: ''});
        if (returnFocus && this.button) this.button.focus();
    }
    handleDocumentDown (event) {
        if (!this.state.open || !this.wrap || this.wrap.contains(event.target)) return;
        this.setState({open: false, notice: ''});
    }
    canFix (entry) {
        return !!(this.fixer && this.fixer.canFix(entry));
    }
    handleShowMe (entry) {
        if (!this.fixer) return;
        this.setState({busyKey: entry.key});
        this.fixer.showMe(entry).then(found => {
            this.setState({
                busyKey: null,
                notice: found ? '' : this.props.intl.formatMessage(messages.notFound)
            });
        });
    }
    handleFix (entry) {
        if (!this.fixer) return;
        this.setState({busyKey: entry.key});
        this.fixer.applyFix(entry).then(done => {
            this.setState(state => ({
                busyKey: null,
                hidden: done ? state.hidden.concat(entry.key) : state.hidden,
                notice: this.props.intl.formatMessage(done ? messages.fixed : messages.fixFailed)
            }));
            if (done && this.checker) this.checker.schedule();
        });
    }
    targetName (targetId) {
        const target = targetId && this.props.vm && this.props.vm.runtime.getTargetById(targetId);
        if (!target) return '';
        return target.isStage ? this.props.intl.formatMessage(messages.stage) : target.getName();
    }
    setWrap (element) {
        this.wrap = element;
    }
    setButton (element) {
        this.button = element;
    }
    render () {
        const {checked, host, items, hidden, open} = this.state;
        if (!this.props.inline && !host) return null;
        const shown = hidden.length ? items.filter(entry => hidden.indexOf(entry.key) === -1) : items;
        const pill = (
            <div
                className={classNames(styles.wrap, {[styles.sheetWrap]: this.props.sheet})}
                ref={this.setWrap}
            >
                <CheckerPill
                    buttonRef={this.setButton}
                    count={shown.length}
                    onToggle={this.handleToggle}
                    open={open}
                    panelId={PANEL_ID}
                    severity={topSeverity(shown)}
                    sheet={this.props.sheet}
                />
                {open ? (
                    <React.Suspense fallback={null}>
                        <CheckerPanel
                            busyKey={this.state.busyKey}
                            canFix={this.canFix}
                            checked={checked}
                            id={PANEL_ID}
                            items={shown}
                            notice={this.state.notice}
                            onClose={this.handleClose}
                            onFix={this.handleFix}
                            onShowMe={this.handleShowMe}
                            targetName={this.targetName}
                        />
                    </React.Suspense>
                ) : null}
            </div>
        );
        return this.props.inline ? pill : ReactDOM.createPortal(pill, host);
    }
}

CheckerPillContainer.propTypes = {
    inline: PropTypes.bool,
    intl: intlShape.isRequired,
    onItems: PropTypes.func.isRequired,
    onOpened: PropTypes.func.isRequired,
    requestOpen: PropTypes.bool,
    sheet: PropTypes.bool,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    requestOpen: !!(state.scratchGui.checker && state.scratchGui.checker.open),
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onItems: items => dispatch(setCheckerItems(items)),
    onOpened: () => dispatch(closeCheckerPanel())
});

export {PORTAL_ID, PANEL_ID};
export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(CheckerPillContainer));

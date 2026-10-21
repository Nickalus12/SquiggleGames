import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';

import {listenForPaletteEvent, paletteKeyAction} from './keys.js';
import {uiMessages} from './messages';
import {createFixer} from '../../lib/checker/fixes.js';
import {getOutlineWorkspace} from '../../lib/annotations/workspace-ref.js';
import {openCheckerPanel} from '../../reducers/checker.js';
import {closeCommandPalette, openCommandPalette, toggleCommandPalette} from '../../reducers/command-palette.js';
import {toggleFocusMode} from '../../reducers/focus-mode.js';
import {
    activateTab,
    BLOCKS_TAB_INDEX,
    COSTUMES_TAB_INDEX,
    SOUNDS_TAB_INDEX
} from '../../reducers/editor-tab.js';

const TABS = Object.freeze({
    code: BLOCKS_TAB_INDEX,
    costumes: COSTUMES_TAB_INDEX,
    sounds: SOUNDS_TAB_INDEX
});

const CommandPalette = React.lazy(() => import(/* webpackChunkName: "command-palette" */ './command-palette.jsx'));
const loadSources = () => import(/* webpackChunkName: "command-palette" */ './sources.js');

class CommandPaletteContainer extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleKeyDown',
            'handlePaletteEvent',
            'isOpen',
            'handleClose',
            'handlePick',
            'targetName',
            'showMe',
            'reveal'
        ]);
        this.returnFocus = null;
        this.state = {items: null};
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown, true);
        this.stopListening = listenForPaletteEvent(typeof window === 'undefined' ? null : window, this.isOpen,
            this.handlePaletteEvent);
        if (this.props.open) this.collect();
    }
    componentDidUpdate (prevProps) {
        if (this.props.vm !== prevProps.vm) this.fixer = null;
        if (this.props.open && !prevProps.open) {
            if (!this.returnFocus) this.returnFocus = document.activeElement;
            this.collect();
        }
        if (!this.props.open && prevProps.open) this.forget();
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        this.stopListening();
        this.unmounted = true;
    }
    getFixer () {
        if (!this.fixer && this.props.vm) this.fixer = createFixer({vm: this.props.vm});
        return this.fixer;
    }
    forget () {
        this.setState({items: null});
    }
    collect () {
        const {intl, vm} = this.props;
        if (!vm) {
            this.setState({items: []});
            return;
        }
        const win = typeof window === 'undefined' ? null : window;
        const net = win && win.SquiggleNet;
        const env = {
            vm,
            win,
            intl,
            workspace: getOutlineWorkspace(),
            ScratchBlocks: win && win.ScratchBlocks,
            checkerItems: this.props.checkerItems,
            targetName: this.targetName,
            showMe: this.showMe,
            reveal: this.reveal,
            follow: net && typeof net.follow === 'function' ? name => net.follow(name) : null,
            actions: {
                openChecker: this.props.onOpenChecker,
                toggleFocus: this.props.onToggleFocus,
                showTab: tab => this.props.onShowTab(TABS[tab])
            }
        };
        loadSources().then(sources => {
            if (this.unmounted || !this.props.open) return;
            this.setState({items: sources.buildItems(env)});
        })
            .catch(error => {
                if (this.unmounted || !this.props.open) return;
                this.props.onError(error);
                this.setState({items: []});
            });
    }
    handleKeyDown (event) {
        const action = paletteKeyAction(event, this.props.open);
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'close') {
            this.handleClose();
            return;
        }
        this.returnFocus = document.activeElement;
        this.props.onToggle();
    }
    isOpen () {
        return !!this.props.open;
    }
    handlePaletteEvent (action) {
        if (action === 'close') {
            this.handleClose();
            return;
        }
        this.returnFocus = document.activeElement;
        this.props.onOpen();
    }
    restoreFocus () {
        const element = this.returnFocus;
        this.returnFocus = null;
        if (element && typeof element.focus === 'function' && document.contains(element)) element.focus();
    }
    handleClose () {
        this.props.onClose();
        this.restoreFocus();
    }
    handlePick (entry) {
        this.props.onClose();
        this.restoreFocus();
        if (typeof entry.run === 'function') {
            try {
                entry.run();
            } catch (e) {
                this.props.onError(e);
            }
        }
    }
    targetName (targetId) {
        const target = targetId && this.props.vm && this.props.vm.runtime.getTargetById(targetId);
        if (!target) return '';
        return target.isStage ? this.props.intl.formatMessage(uiMessages.stage) : target.getName();
    }
    showMe (item) {
        const fixer = this.getFixer();
        return fixer ? fixer.showMe(item) : Promise.resolve(false);
    }
    reveal (blockId) {
        return this.showMe({blockId});
    }
    render () {
        if (!this.props.open || !this.state.items || typeof document === 'undefined') return null;
        return ReactDOM.createPortal(
            <React.Suspense fallback={null}>
                <CommandPalette
                    initialQuery={this.props.query}
                    items={this.state.items}
                    onClose={this.handleClose}
                    onPick={this.handlePick}
                />
            </React.Suspense>,
            document.body
        );
    }
}

CommandPaletteContainer.propTypes = {
    checkerItems: PropTypes.arrayOf(PropTypes.object),
    intl: intlShape.isRequired,
    onClose: PropTypes.func.isRequired,
    onError: PropTypes.func,
    onOpen: PropTypes.func.isRequired,
    onOpenChecker: PropTypes.func.isRequired,
    onShowTab: PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired,
    onToggleFocus: PropTypes.func.isRequired,
    open: PropTypes.bool,
    query: PropTypes.string,
    vm: PropTypes.object
};

CommandPaletteContainer.defaultProps = {
    checkerItems: [],
    onError: () => {}
};

const mapStateToProps = state => {
    const palette = state.scratchGui.commandPalette;
    const checker = state.scratchGui.checker;
    return {
        checkerItems: checker ? checker.items : [],
        open: !!(palette && palette.open),
        query: palette ? palette.query : '',
        vm: state.scratchGui.vm
    };
};

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeCommandPalette()),
    onOpen: () => dispatch(openCommandPalette()),
    onOpenChecker: () => dispatch(openCheckerPanel()),
    onShowTab: index => dispatch(activateTab(index)),
    onToggle: () => dispatch(toggleCommandPalette()),
    onToggleFocus: () => dispatch(toggleFocusMode())
});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(CommandPaletteContainer));

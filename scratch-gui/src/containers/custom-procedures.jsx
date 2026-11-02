import bindAll from 'lodash.bindall';
import defaultsDeep from 'lodash.defaultsdeep';
import PropTypes from 'prop-types';
import React from 'react';
import CustomProceduresComponent from '../components/custom-procedures/custom-procedures.jsx';
import LazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import {describeProcedurePreview} from '../lib/workspace/custom-blocks';
import {connect} from 'react-redux';

class CustomProcedures extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAddLabel',
            'handleAddBoolean',
            'handleAddTextNumber',
            'handleToggleWarp',
            'handleToggleReturnsValue',
            'handleDocumentInput',
            'handleCancel',
            'handleOk',
            'setBlocks',
            'syncPreview'
        ]);
        const initialReturns = Boolean(
            props.mutator &&
            typeof props.mutator.getAttribute === 'function' &&
            props.mutator.getAttribute('returnsvalue') === 'true'
        );
        const isEditing = Boolean(
            props.mutator &&
            typeof props.mutator.getAttribute === 'function' &&
            props.mutator.getAttribute('isnew') === 'false'
        );
        this.state = {
            rtlOffset: 0,
            warp: false,
            returnsValue: initialReturns,
            isEditing,
            preview: describeProcedurePreview('do something', [], {
                warp: false,
                returnsValue: initialReturns
            })
        };
    }
    componentDidMount () {
        if (typeof document !== 'undefined') {
            document.addEventListener('input', this.handleDocumentInput, true);
            document.addEventListener('keyup', this.handleDocumentInput, true);
        }
    }
    componentWillUnmount () {
        if (typeof document !== 'undefined') {
            document.removeEventListener('input', this.handleDocumentInput, true);
            document.removeEventListener('keyup', this.handleDocumentInput, true);
        }
        if (this.workspace) {
            this.workspace.dispose();
        }
    }
    setBlocks (blocksRef) {
        if (!blocksRef) return;
        this.blocks = blocksRef;
        const workspaceConfig = defaultsDeep({},
            CustomProcedures.defaultOptions,
            this.props.options,
            {rtl: this.props.isRtl}
        );

        const ScratchBlocks = LazyScratchBlocks.get();
        const oldDefaultToolbox = ScratchBlocks.Blocks.defaultToolbox;
        ScratchBlocks.Blocks.defaultToolbox = null;
        this.workspace = ScratchBlocks.inject(this.blocks, workspaceConfig);
        ScratchBlocks.Blocks.defaultToolbox = oldDefaultToolbox;

        this.mutationRoot = this.workspace.newBlock('procedures_declaration');
        this.mutationRoot.setMovable(false);
        this.mutationRoot.setDeletable(false);
        this.mutationRoot.contextMenu = false;

        this.workspace.addChangeListener(() => {
            this.mutationRoot.onChangeFn();
            this.syncPreview();
            const metrics = this.workspace.getMetrics();
            const {x, y} = this.mutationRoot.getRelativeToSurfaceXY();
            const dy = (metrics.viewHeight / 2) - (this.mutationRoot.height / 2) - y;
            let dx;
            if (this.props.isRtl) {
                const ltrX = ((metrics.viewWidth / 2) - (this.mutationRoot.width / 2) + 25);
                const mirrorX = x - ((x - this.state.rtlOffset) * 2);
                if (mirrorX === ltrX) {
                    return;
                }
                dx = mirrorX - ltrX;
                const midPoint = metrics.viewWidth / 2;
                if (x === 0) {
                    if (this.mutationRoot.width < midPoint) {
                        dx = ltrX;
                    } else if (this.mutationRoot.width < metrics.viewWidth) {
                        dx = midPoint - ((metrics.viewWidth - this.mutationRoot.width) / 2);
                    } else {
                        dx = midPoint + (this.mutationRoot.width - metrics.viewWidth);
                    }
                    this.mutationRoot.moveBy(dx, dy);
                    this.setState({rtlOffset: this.mutationRoot.getRelativeToSurfaceXY().x});
                    return;
                }
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = dx + this.mutationRoot.width - metrics.viewWidth;
                }
            } else {
                dx = (metrics.viewWidth / 2) - (this.mutationRoot.width / 2) - x;
                if (this.mutationRoot.width > metrics.viewWidth) {
                    dx = metrics.viewWidth - this.mutationRoot.width - x;
                }
            }
            this.mutationRoot.moveBy(dx, dy);
        });
        this.mutationRoot.domToMutation(this.props.mutator);
        this.mutationRoot.initSvg();
        this.mutationRoot.render();
        const warp = this.mutationRoot.getWarp();
        this.setState({warp}, () => {
            this.syncPreview();
        });
        setTimeout(() => {
            if (this.mutationRoot) {
                this.mutationRoot.focusLastEditor_();
                this.syncPreview();
            }
        });
    }
    syncPreview (override = {}) {
        if (!this.mutationRoot) return;
        this.mutationRoot.onChangeFn();
        const warp = typeof override.warp === 'boolean' ? override.warp : this.state.warp;
        const returnsValue = typeof override.returnsValue === 'boolean' ?
            override.returnsValue :
            this.state.returnsValue;
        const preview = describeProcedurePreview(
            this.mutationRoot.procCode_,
            this.mutationRoot.displayNames_,
            {warp, returnsValue}
        );
        this.setState({preview});
    }
    handleDocumentInput () {
        this.syncPreview();
    }
    handleCancel () {
        this.props.onRequestClose();
    }
    handleOk () {
        const newMutation = this.mutationRoot ? this.mutationRoot.mutationToDom(true) : null;
        if (newMutation) {
            newMutation.setAttribute('returnsvalue', this.state.returnsValue ? 'true' : 'false');
        }
        this.props.onRequestClose(newMutation);
    }
    handleAddLabel () {
        if (this.mutationRoot) {
            this.mutationRoot.addLabelExternal();
            this.syncPreview();
        }
    }
    handleAddBoolean () {
        if (this.mutationRoot) {
            this.mutationRoot.addBooleanExternal();
            this.syncPreview();
        }
    }
    handleAddTextNumber () {
        if (this.mutationRoot) {
            this.mutationRoot.addStringNumberExternal();
            this.syncPreview();
        }
    }
    handleToggleWarp () {
        if (this.mutationRoot) {
            const newWarp = !this.mutationRoot.getWarp();
            this.mutationRoot.setWarp(newWarp);
            this.setState({warp: newWarp});
            this.syncPreview({warp: newWarp});
        }
    }
    handleToggleReturnsValue () {
        const nextReturns = !this.state.returnsValue;
        this.setState({returnsValue: nextReturns});
        this.syncPreview({returnsValue: nextReturns});
    }
    render () {
        return (
            <CustomProceduresComponent
                componentRef={this.setBlocks}
                isEditing={this.state.isEditing}
                preview={this.state.preview}
                returnsValue={this.state.returnsValue}
                warp={this.state.warp}
                onAddBoolean={this.handleAddBoolean}
                onAddLabel={this.handleAddLabel}
                onAddTextNumber={this.handleAddTextNumber}
                onCancel={this.handleCancel}
                onOk={this.handleOk}
                onToggleReturnsValue={this.handleToggleReturnsValue}
                onToggleWarp={this.handleToggleWarp}
            />
        );
    }
}

CustomProcedures.propTypes = {
    isRtl: PropTypes.bool,
    mutator: PropTypes.instanceOf(Element),
    onRequestClose: PropTypes.func.isRequired,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    })
};

CustomProcedures.defaultOptions = {
    zoom: {
        controls: false,
        wheel: false,
        startScale: 0.9
    },
    comments: false,
    collapse: false,
    scrollbars: true
};

CustomProcedures.defaultProps = {
    options: CustomProcedures.defaultOptions
};

const mapStateToProps = state => ({
    isRtl: state.locales.isRtl,
    mutator: state.scratchGui.customProcedures.mutator
});

export default connect(
    mapStateToProps
)(CustomProcedures);

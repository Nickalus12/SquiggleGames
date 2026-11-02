import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';

import ExplainSpriteComponent from '../components/explain-sprite/explain-sprite.jsx';
import {explainSprite} from '../lib/ai/explain.js';
import {spriteScriptText} from '../lib/ai/script-text.js';

class ExplainSprite extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClose']);
        this.state = {status: 'loading', summary: '', issue: '', suggestion: ''};
        this.mounted = false;
    }
    componentDidMount () {
        this.mounted = true;
        this.ask();
    }
    componentDidUpdate (prevProps) {
        if (prevProps.targetId !== this.props.targetId) this.ask();
    }
    componentWillUnmount () {
        this.mounted = false;
    }
    target () {
        const runtime = this.props.vm && this.props.vm.runtime;
        return runtime ? runtime.getTargetById(this.props.targetId) : null;
    }
    ask () {
        const target = this.target();
        if (!target) {
            this.setState({status: 'error'});
            return;
        }
        this.setState({status: 'loading', summary: '', issue: '', suggestion: ''});
        const targetId = this.props.targetId;
        const others = this.props.vm.runtime.targets.filter(t => t.isOriginal);
        explainSprite({
            name: target.getName(),
            kind: target.isStage ? 'stage' : 'sprite',
            script: spriteScriptText(target, {others})
        }).then(out => {
            if (!this.mounted || targetId !== this.props.targetId || out.reason === 'pending') return;
            if (out.reason === 'off') {
                this.props.onOff();
                return;
            }
            if (!out.ok) {
                this.setState({status: 'error'});
                return;
            }
            this.setState({status: 'done', summary: out.summary, issue: out.issue, suggestion: out.suggestion});
        });
    }
    handleClose () {
        this.props.onClose();
    }
    render () {
        const target = this.target();
        return (
            <ExplainSpriteComponent
                issue={this.state.issue}
                name={target ? target.getName() : ''}
                status={this.state.status}
                suggestion={this.state.suggestion}
                summary={this.state.summary}
                onClose={this.handleClose}
            />
        );
    }
}

ExplainSprite.propTypes = {
    onClose: PropTypes.func.isRequired,
    onOff: PropTypes.func.isRequired,
    targetId: PropTypes.string.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default ExplainSprite;

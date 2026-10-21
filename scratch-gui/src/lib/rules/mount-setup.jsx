import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';

import GameSetupSheet from './game-setup-sheet.jsx';

class SetupHost extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClose', 'handleSave']);
    }
    handleClose () {
        this.props.onDone(null);
    }
    handleSave (setup) {
        this.props.onDone(setup);
    }
    render () {
        return (
            <IntlProvider locale="en">
                <GameSetupSheet
                    setup={this.props.setup}
                    variables={this.props.variables}
                    onClose={this.handleClose}
                    onSave={this.handleSave}
                />
            </IntlProvider>
        );
    }
}

SetupHost.propTypes = {
    onDone: PropTypes.func.isRequired,
    setup: PropTypes.object,
    variables: PropTypes.arrayOf(PropTypes.object).isRequired
};

const mountSetup = ({setup, variables}) => new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const previous = document.activeElement;
    const finish = result => {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
        if (previous && typeof previous.focus === 'function') previous.focus();
        resolve(result);
    };
    ReactDOM.render(React.createElement(SetupHost, {setup, variables, onDone: finish}), host);
});

export {SetupHost};
export default mountSetup;

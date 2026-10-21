import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

class SheetHost extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['setHost']);
    }
    componentDidMount () {
        this.props.sheet.attach(this.host);
    }
    componentWillUnmount () {
        this.props.sheet.attach(null);
    }
    setHost (el) {
        this.host = el;
    }
    render () {
        return <div ref={this.setHost} />;
    }
}

SheetHost.propTypes = {
    sheet: PropTypes.shape({attach: PropTypes.func}).isRequired
};

export default SheetHost;

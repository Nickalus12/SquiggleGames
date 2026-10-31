import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {LAYOUT_MODES, PHONE_TABS} from '../../lib/layout-mode';
import PhoneAddButton, {itemShape} from './phone-add-button.jsx';
import {addTopBarItem} from './phone-slots';

const TOP_BAR_ID = 'sq-add-sprite';
const SHEET_ID = 'sq-add-sprite-sheet';

const messages = defineMessages({
    addSprite: {
        id: 'sq.phone.addSprite',
        defaultMessage: 'Add a sprite',
        description: 'Phone top bar button and sheet title for adding a sprite'
    }
});

const PhoneAddSpriteBarButton = ({intl, items, visible}) => {
    if (!visible) return null;
    const label = intl.formatMessage(messages.addSprite);
    return (
        <PhoneAddButton
            items={items}
            label={label}
            sheetId={SHEET_ID}
            sheetTitle={label}
            variant="bar"
        />
    );
};

PhoneAddSpriteBarButton.propTypes = {
    intl: intlShape.isRequired,
    items: PropTypes.arrayOf(itemShape).isRequired,
    visible: PropTypes.bool
};

const ConnectedBarButton = connect(state => ({
    visible: state.scratchGui.layoutMode.phoneTab === PHONE_TABS.code ||
        state.scratchGui.layoutMode.phoneTab === PHONE_TABS.sprites
}))(injectIntl(PhoneAddSpriteBarButton));

class PhoneAddSpriteSlot extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['renderTopBar']);
        this.removeTopBar = null;
    }
    componentDidMount () {
        this.sync();
    }
    componentDidUpdate () {
        this.sync();
    }
    componentWillUnmount () {
        if (this.removeTopBar) this.removeTopBar();
        this.removeTopBar = null;
    }
    sync () {
        if (this.props.isPhone && !this.removeTopBar) {
            this.removeTopBar = addTopBarItem({id: TOP_BAR_ID, order: 10, render: this.renderTopBar});
        } else if (!this.props.isPhone && this.removeTopBar) {
            this.removeTopBar();
            this.removeTopBar = null;
        }
    }
    renderTopBar () {
        return <ConnectedBarButton items={this.props.items} />;
    }
    render () {
        return null;
    }
}

PhoneAddSpriteSlot.propTypes = {
    isPhone: PropTypes.bool,
    items: PropTypes.arrayOf(itemShape).isRequired
};

export {SHEET_ID, TOP_BAR_ID, messages};
export default connect(state => ({
    isPhone: state.scratchGui.layoutMode.mode === LAYOUT_MODES.phone
}))(PhoneAddSpriteSlot);

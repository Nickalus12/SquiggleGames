import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import SqIcon from '../sq-icon';
import {addSheetItems, fileItems} from './add-sheet-items';
import PhoneAddSheetBody, {itemShape} from './phone-add-sheet.jsx';
import {closeSheet, openSheet} from './phone-slots';

import actionStyles from '../action-menu/action-menu.css';
import styles from './phone-shell.css';

class PhoneAddButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleOpen', 'handlePick', 'renderSheet']);
    }
    componentWillUnmount () {
        closeSheet(this.props.sheetId);
    }
    handlePick (item, e) {
        closeSheet(this.props.sheetId);
        if (item.onClick) item.onClick(e);
    }
    renderSheet () {
        return (
            <PhoneAddSheetBody
                items={this.props.items}
                onPick={this.handlePick}
            />
        );
    }
    handleOpen () {
        openSheet({
            id: this.props.sheetId,
            title: this.props.sheetTitle,
            render: this.renderSheet,
            size: 'half'
        });
    }
    render () {
        const {className, items, label, variant, withFileInputs} = this.props;
        const inputs = withFileInputs ? fileItems(items) : [];
        const bar = variant === 'bar';
        return (
            <div className={classNames(bar ? styles.addBarWrap : styles.addFabWrap, className)}>
                <button
                    aria-label={label}
                    className={bar ? styles.iconButton : styles.addFab}
                    data-phone-add-button={variant}
                    title={label}
                    type="button"
                    onClick={this.handleOpen}
                >
                    <SqIcon name="plus" />
                </button>
                {inputs.map((item, index) => {
                    const handleChange = item.fileChange;
                    return (
                        <input
                            accept={item.fileAccept}
                            className={classNames(styles.fileInput, actionStyles.fileInput)}
                            key={`file-${index}`}
                            multiple={item.fileMultiple}
                            ref={item.fileInput}
                            type="file"
                            onChange={handleChange}
                        />
                    );
                })}
            </div>
        );
    }
}

PhoneAddButton.propTypes = {
    className: PropTypes.string,
    items: PropTypes.arrayOf(itemShape).isRequired,
    label: PropTypes.string.isRequired,
    sheetId: PropTypes.string.isRequired,
    sheetTitle: PropTypes.node.isRequired,
    variant: PropTypes.oneOf(['fab', 'bar']),
    withFileInputs: PropTypes.bool
};

PhoneAddButton.defaultProps = {
    variant: 'fab',
    withFileInputs: false
};

export {addSheetItems, itemShape};
export default PhoneAddButton;

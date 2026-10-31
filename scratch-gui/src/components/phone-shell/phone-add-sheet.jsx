import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import SqIcon from '../sq-icon';

import styles from './phone-shell.css';

const itemShape = PropTypes.shape({
    img: PropTypes.string,
    title: PropTypes.node.isRequired,
    onClick: PropTypes.func,
    fileAccept: PropTypes.string,
    fileChange: PropTypes.func,
    fileInput: PropTypes.func,
    fileMultiple: PropTypes.bool
});

class PhoneAddSheetItem extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick (e) {
        this.props.onPick(this.props.item, e);
    }
    render () {
        const {img, title, onClick} = this.props.item;
        return (
            <li className={styles.addSheetRow}>
                <button
                    className={styles.addSheetItem}
                    data-phone-add-item
                    disabled={!onClick}
                    type="button"
                    onClick={this.handleClick}
                >
                    <span className={styles.addSheetIcon}>
                        {img ? (
                            <img
                                alt=""
                                draggable={false}
                                src={img}
                            />
                        ) : <SqIcon name="plus" />}
                    </span>
                    <span className={styles.addSheetLabel}>{title}</span>
                </button>
            </li>
        );
    }
}

PhoneAddSheetItem.propTypes = {
    item: itemShape.isRequired,
    onPick: PropTypes.func.isRequired
};

const PhoneAddSheetBody = ({items, onPick}) => (
    <ul
        className={styles.addSheetList}
        data-phone-add-sheet
    >
        {items.map((item, index) => (
            <PhoneAddSheetItem
                item={item}
                key={`${index}-${typeof item.title === 'string' ? item.title : ''}`}
                onPick={onPick}
            />
        ))}
    </ul>
);

PhoneAddSheetBody.propTypes = {
    items: PropTypes.arrayOf(itemShape).isRequired,
    onPick: PropTypes.func.isRequired
};

export {itemShape};
export default PhoneAddSheetBody;

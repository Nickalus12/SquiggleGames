import PropTypes from 'prop-types';
import React from 'react';

import {GRID, ICONS, STROKE} from './icons';

const SqIcon = ({className, name, size, title}) => {
    const shapes = ICONS[name];
    if (!shapes) return null;
    return (
        <svg
            aria-hidden={title ? null : 'true'}
            className={className}
            fill="none"
            focusable="false"
            height={size}
            role={title ? 'img' : null}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={STROKE}
            viewBox={`0 0 ${GRID} ${GRID}`}
            width={size}
        >
            {title ? <title>{title}</title> : null}
            {shapes.map(([tag, attrs], index) => React.createElement(tag, {key: index, ...attrs}))}
        </svg>
    );
};

SqIcon.propTypes = {
    className: PropTypes.string,
    name: PropTypes.oneOf(Object.keys(ICONS)).isRequired,
    size: PropTypes.number,
    title: PropTypes.string
};

SqIcon.defaultProps = {
    size: GRID
};

export default SqIcon;

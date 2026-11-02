import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {setProjectTitle} from '../reducers/project-title';
import {setAuthor, setDescription} from '../reducers/tw';

const getNoIndexTag = () => document.querySelector('meta[name="robots"][content="noindex"]');
const setIndexable = indexable => {
    if (indexable) {
        const tag = getNoIndexTag();
        if (tag) {
            tag.remove();
        }
    } else if (!getNoIndexTag()) {
        const tag = document.createElement('meta');
        tag.name = 'robots';
        tag.content = 'noindex';
        document.head.appendChild(tag);
    }
};

const TWProjectMetaFetcherHOC = function (WrappedComponent) {
    class ProjectMetaFetcherComponent extends React.Component {
        componentDidUpdate (prevProps) {
            // project title resetting is handled in titled-hoc.jsx
            if (this.props.reduxProjectId !== prevProps.reduxProjectId) {
                this.props.onSetAuthor('', '');
                this.props.onSetDescription('', '');
                const projectId = this.props.reduxProjectId;

                if (projectId !== '0') setIndexable(false);
            }
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxProjectId,
                onSetAuthor,
                onSetDescription,
                onSetProjectTitle,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    ProjectMetaFetcherComponent.propTypes = {
        reduxProjectId: PropTypes.string,
        onSetAuthor: PropTypes.func,
        onSetDescription: PropTypes.func,
        onSetProjectTitle: PropTypes.func
    };
    const mapStateToProps = state => ({
        reduxProjectId: state.scratchGui.projectState.projectId
    });
    const mapDispatchToProps = dispatch => ({
        onSetAuthor: (username, thumbnail) => dispatch(setAuthor({
            username,
            thumbnail
        })),
        onSetDescription: (instructions, credits) => dispatch(setDescription({
            instructions,
            credits
        })),
        onSetProjectTitle: title => dispatch(setProjectTitle(title))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(ProjectMetaFetcherComponent);
};

export {
    TWProjectMetaFetcherHOC as default
};

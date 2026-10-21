import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import overlay from '../../lib/collab/overlay';
import {toggleRoomPanel} from '../../reducers/room-panel';
import ChatToggle from '../collab-chat/chat-toggle.jsx';
import chatStyles from '../collab-chat/collab-chat.css';

const T = {
    good: '#34d399',
    warn: '#fbbf24'
};

const dot = (color, size) => ({
    display: 'inline-block',
    width: `${size || 10}px`,
    height: `${size || 10}px`,
    borderRadius: '50%',
    background: color,
    flexShrink: 0
});

class CollabPresence extends React.Component {
    constructor (props) {
        super(props);
        this.state = overlay.getState();
        this.handleChange = () => this.setState(overlay.getState());
        this.handleToggle = () => this.props.onToggleRoom();
        this.handleKeyDown = e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.props.onToggleRoom();
            }
        };
    }
    componentDidMount () {
        this.unsubscribe = overlay.subscribe(this.handleChange);
        this.handleChange();
    }
    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
    }
    render () {
        const {self, connected, peers} = this.state;
        const open = !!this.props.roomOpen;
        if (!self) return null;
        const roomName = self.title || self.room;

        const homeButton = (
            <a
                aria-label={'Home'}
                href={'/'}
                title={'Back to Squiggle'}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(0, 0, 0, 0.18)',
                    borderRadius: '15px',
                    padding: '3px 11px',
                    marginRight: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                }}
            >
                <svg
                    width={'15'}
                    height={'15'}
                    viewBox={'0 0 26 26'}
                >
                    <path
                        d={'M4 17c2.5 0 2.5-8 5-8s2.5 8 5 8 2.5-8 5-8'}
                        stroke={'#fff'}
                        strokeWidth={'2.6'}
                        fill={'none'}
                        strokeLinecap={'round'}
                    />
                </svg>
                <span className={this.props.phoneSheet ? null : chatStyles.homeLabel}>{'Home'}</span>
            </a>
        );

        const button = (
            <div
                aria-expanded={open}
                aria-haspopup="dialog"
                data-collab-people-toggle
                role="button"
                tabIndex={0}
                onClick={this.handleToggle}
                onKeyDown={this.handleKeyDown}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    cursor: 'pointer',
                    background: open ? 'rgba(124, 92, 255, 0.28)' : 'rgba(0, 0, 0, 0.18)',
                    border: `1px solid ${open ? 'rgba(124, 92, 255, 0.6)' : 'transparent'}`,
                    borderRadius: '15px',
                    padding: '3px 11px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                }}
                aria-label={`${roomName}: ${1 + peers.length}`}
                title={connected ? roomName : 'Reconnecting…'}
            >
                <span style={dot(connected ? T.good : T.warn, 8)} />
                <span style={{fontSize: '14px', lineHeight: 1}}>{'👥'}</span>
                <span>{1 + peers.length}</span>
                <span style={{opacity: 0.6, fontWeight: 'normal'}}>{'▾'}</span>
            </div>
        );

        return (
            <div style={{position: 'relative', display: 'flex', alignItems: 'center', padding: '0 8px'}}>
                {homeButton}
                {button}
                {this.props.phoneSheet ? null : <ChatToggle />}
            </div>
        );
    }
}

CollabPresence.propTypes = {
    onToggleRoom: PropTypes.func.isRequired,
    phoneSheet: PropTypes.bool,
    roomOpen: PropTypes.bool
};

const mapStateToProps = state => ({
    roomOpen: state.scratchGui.roomPanel.open
});

const mapDispatchToProps = dispatch => ({
    onToggleRoom: () => dispatch(toggleRoomPanel())
});

export default connect(mapStateToProps, mapDispatchToProps)(CollabPresence);

import React from 'react';

import {collabRoomName} from '../gui/collab-handle.js';
import {historySummary, restoreVersion, roomHistory} from '../../lib/collab/room-api.js';

const rowKey = v => (typeof v.v === 'number' ? `v${v.v}` : `f${v.file}`);

const T = {
    surface: '#161c36',
    card: 'rgba(255, 255, 255, 0.055)',
    line: 'rgba(255, 255, 255, 0.11)',
    lineHi: 'rgba(255, 255, 255, 0.22)',
    ink: '#f2f4fb',
    dim: '#a3abc8',
    faint: '#6d769a',
    accent: '#7c5cff',
    font: 'ui-rounded, "Segoe UI", Helvetica, Arial, sans-serif'
};

const ago = ts => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
    if (s < 86400) {
        const h = Math.floor(s / 3600);
        return h === 1 ? 'an hour ago' : `${h} hours ago`;
    }
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
};

class HistoryPanel extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            open: false,
            versions: [],
            details: {},
            loading: false,
            error: null,
            busy: null,
            confirming: null
        };
        this.handleToggle = this.handleToggle.bind(this);
        this.handleListClick = this.handleListClick.bind(this);
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleOpenRequest = this.handleOpenRequest.bind(this);
        this.rootRef = React.createRef();
    }

    componentDidMount () {
        document.addEventListener('mousedown', this.handleDocumentClick);
        window.addEventListener('sq:open-history', this.handleOpenRequest);
    }

    componentWillUnmount () {
        this.unmounted = true;
        document.removeEventListener('mousedown', this.handleDocumentClick);
        window.removeEventListener('sq:open-history', this.handleOpenRequest);
    }

    handleDocumentClick (e) {
        if (!this.state.open) return;
        if (this.rootRef.current && this.rootRef.current.contains(e.target)) return;
        this.setState({open: false, confirming: null});
    }

    room () {
        return collabRoomName() || '';
    }

    update (patch) {
        if (!this.unmounted) this.setState(patch);
    }

    load () {
        const room = this.room();
        if (!room) {
            this.setState({error: 'Open a room first.', versions: [], loading: false});
            return;
        }
        this.setState({loading: true, error: null});
        roomHistory(room)
            .then(d => this.update({versions: (d && d.versions) || [], details: {}, loading: false}))
            .catch(e => this.update({
                loading: false,
                error: e.friendly || 'Could not reach the server. Check your connection.'
            }));
    }

    loadDetail (v) {
        const key = rowKey(v);
        if (typeof v.v !== 'number' || this.state.details[key]) return;
        this.setState(s => ({details: Object.assign({}, s.details, {[key]: 'loading'})}));
        historySummary(this.room(), v.v)
            .then(d => d, () => 'failed')
            .then(d => {
                if (this.unmounted) return;
                this.setState(s => ({details: Object.assign({}, s.details, {[key]: d || 'failed'})}));
            });
    }

    handleOpenRequest () {
        if (this.state.open) return;
        this.setState({open: true, confirming: null});
        this.load();
    }

    handleToggle () {
        const open = !this.state.open;
        this.setState({open, confirming: null});
        if (open) this.load();
    }

    handleListClick (e) {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        const key = btn.dataset.key;
        const version = this.state.versions.find(v => rowKey(v) === key);
        if (!version) return;
        if (this.state.confirming !== key) {
            this.setState({confirming: key});
            this.loadDetail(version);
            return;
        }
        this.restore(version);
    }

    restore (v) {
        const key = rowKey(v);
        this.setState({busy: key, confirming: null, error: null});
        restoreVersion(this.room(), v)
            .then(() => this.update({busy: null, open: false}))
            .catch(e => this.update({
                busy: null,
                error: e.friendly || 'Could not put it back. Check your connection.'
            }));
    }

    describe (v) {
        if (typeof v.v !== 'number') return `${Math.max(1, Math.round((v.size || 0) / 1024))} KB`;
        const found = this.state.details[rowKey(v)];
        const d = found && typeof found === 'object' ? found : v;
        const parts = [d.by ? `by ${d.by}` : null, d.summary || null].filter(Boolean);
        if (found === 'loading' && !parts.length) return 'Looking…';
        return parts.length ? parts.join(' · ') : `Version ${v.v}`;
    }

    render () {
        const {open, versions, loading, error, busy, confirming} = this.state;
        return (
            <div
                ref={this.rootRef}
                style={{position: 'relative', fontFamily: T.font}}
            >
                <button
                    onClick={this.handleToggle}
                    title="Earlier versions of this room"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        height: '34px',
                        boxSizing: 'border-box',
                        padding: '0 12px',
                        borderRadius: 'var(--sq-radius-panel, 10px)',
                        cursor: 'pointer',
                        background: open ? 'var(--sq-menu-bar-control-active)' : 'var(--sq-menu-bar-control)',
                        border: '1px solid transparent',
                        color: 'var(--sq-menu-bar-text, #ffffff)',
                        font: 'inherit',
                        fontSize: 'var(--sq-text-sm, 14px)',
                        fontWeight: 700
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        style={{width: '15px', height: '15px', fill: 'currentColor'}}
                    >
                        <path d="M13 3a9 9 0 1 0 8.9 10.5l-2-.3A7 7 0 1 1 13 5v3l4.5-4L13 0z" />
                        <path d="M12 8h1.5v4.3l3.4 2-0.8 1.3L12 13z" />
                    </svg>
                    {'History'}
                </button>

                {open && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 8px)',
                            right: 0,
                            zIndex: 640,
                            width: '272px',
                            maxHeight: '330px',
                            overflowY: 'auto',
                            background: T.surface,
                            border: `1px solid ${T.lineHi}`,
                            borderRadius: '13px',
                            padding: '10px',
                            boxShadow: '0 18px 50px -12px rgba(0,0,0,.7)'
                        }}
                    >
                        <div
                            style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                letterSpacing: '0.7px',
                                textTransform: 'uppercase',
                                color: T.faint,
                                padding: '2px 4px 8px'
                            }}
                        >{'Earlier versions'}</div>

                        {loading && <div style={{color: T.dim, fontSize: '13px', padding: '6px'}}>
                            {'Looking…'}</div>}

                        {error && <div style={{color: '#fb7185', fontSize: '13px', padding: '6px'}}>
                            {error}</div>}

                        {!loading && !error && !versions.length && (
                            <div style={{color: T.faint, fontSize: '12.5px', padding: '6px', lineHeight: 1.5}}>
                                {'No earlier versions yet. One is kept every minute while people are ' +
                                 'building, so there will be some shortly.'}
                            </div>
                        )}

                        <div onClick={this.handleListClick}>
                            {versions.map(v => (
                                <div
                                    key={rowKey(v)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '7px 5px',
                                        borderTop: `1px solid ${T.line}`
                                    }}
                                >
                                    <div style={{flex: 1, minWidth: 0}}>
                                        <div style={{fontSize: '13px', fontWeight: 700, color: T.ink}}>
                                            {ago(v.at)}
                                        </div>
                                        <div style={{fontSize: '11px', color: T.faint}}>
                                            {this.describe(v)}
                                        </div>
                                        {confirming === rowKey(v) && (
                                            <div style={{fontSize: '11px', color: T.faint}}>
                                                {'Everyone here will see it change'}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        data-key={rowKey(v)}
                                        disabled={!!busy}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            background: confirming === rowKey(v) ?
                                                'rgba(124,92,255,.3)' : T.card,
                                            border: `1px solid ${confirming === rowKey(v) ?
                                                T.accent : T.line}`,
                                            color: T.ink,
                                            font: 'inherit',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            opacity: busy && busy !== rowKey(v) ? 0.5 : 1
                                        }}
                                    >{busy === rowKey(v) ? 'Putting back…' :
                                            (confirming === rowKey(v) ? 'Yes, put it back' : 'Put back')}</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

export default HistoryPanel;

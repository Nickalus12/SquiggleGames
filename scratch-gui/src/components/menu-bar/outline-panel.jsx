import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';

import {isSection, parse, summarize, typeInfo} from '../../lib/annotations';
import {revealComment} from '../../lib/annotations/workspace-ref';
import SqIcon from '../sq-icon';
import barStyles from './menu-bar.css';

const messages = defineMessages({
    outline: {
        id: 'sq.menuBar.outline',
        defaultMessage: 'Outline',
        description: 'Menu bar button that lists the notes and sections in this sprite'
    },
    outlineTitle: {
        id: 'sq.menuBar.outlineTitle',
        defaultMessage: 'Every note and section in this sprite',
        description: 'Tooltip on the Outline button'
    },
    searchPlaceholder: {
        id: 'sq.outline.searchPlaceholder',
        defaultMessage: 'Search notes',
        description: 'Placeholder for the note search input in the Outline panel'
    },
    noMatches: {
        id: 'sq.outline.noMatches',
        defaultMessage: 'Nothing matches that.',
        description: 'Shown when no notes match the search in the Outline panel'
    },
    empty: {
        id: 'sq.outline.empty',
        defaultMessage: 'No notes yet. Press and hold or right-click the code area to add a comment, then pick a type.',
        description: 'Device-neutral empty state in the Outline panel'
    }
});

const T = {
    surface: '#161c36',
    card: 'rgba(255, 255, 255, 0.055)',
    line: 'rgba(255, 255, 255, 0.11)',
    ink: '#f2f4fb',
    dim: '#a3abc8',
    faint: '#6d769a',
    font: 'ui-rounded, "Segoe UI", Helvetica, Arial, sans-serif'
};

const label = {
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: T.faint
};

const within = (section, c) => (
    c.x >= section.x && c.y >= section.y &&
    c.x <= section.x + section.width &&
    c.y <= section.y + section.height
);

const buildOutline = (comments, query) => {
    const all = Object.entries(comments || {}).map(([id, c]) => ({
        id,
        x: c.x || 0,
        y: c.y || 0,
        width: c.width || 0,
        height: c.height || 0,
        attached: !!c.blockId,
        parsed: parse(c.text)
    }));

    const q = query.trim().toLowerCase();
    const matches = e => !q ||
        summarize(e.parsed).toLowerCase()
            .includes(q) ||
        (e.parsed.body || '').toLowerCase().includes(q) ||
        e.parsed.type.includes(q);

    const sections = all.filter(e => isSection(e.parsed.type))
        .sort((a, b) => a.y - b.y || a.x - b.x);
    const rest = all.filter(e => !isSection(e.parsed.type))
        .sort((a, b) => a.y - b.y || a.x - b.x);

    const claimed = new Set();
    const groups = sections.map(s => {
        const children = rest.filter(e => {
            if (claimed.has(e.id) || !within(s, e)) return false;
            claimed.add(e.id);
            return true;
        });
        return {section: s, children: children.filter(matches)};
    }).filter(g => g.children.length || matches(g.section));

    const loose = rest.filter(e => !claimed.has(e.id)).filter(matches);
    return {groups, loose, total: all.length};
};

const Chip = ({type}) => {
    const info = typeInfo(type);
    return (
        <span
            style={{
                flex: '0 0 auto',
                width: '18px',
                height: '18px',
                borderRadius: '5px',
                background: info.color,
                color: '#fff',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            title={info.label}
        >
            {info.icon}
        </span>
    );
};

Chip.propTypes = {type: PropTypes.string};

const Row = ({entry, indent, onGo}) => {
    const text = summarize(entry.parsed) || typeInfo(entry.parsed.type).label;
    return (
        <div
            data-comment-id={entry.id}
            onClick={onGo}
            role="button"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                marginLeft: indent ? '14px' : 0,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
            }}
            tabIndex={0}
            title={entry.parsed.body || text}
        >
            <Chip type={entry.parsed.type} />
            <span
                style={{flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'}}
            >
                {text}
            </span>
            {entry.attached ? (
                <span
                    style={{color: T.faint, fontSize: '12px'}}
                    title={'Attached to a block'}
                >
                    {'⛓'}
                </span>
            ) : null}
        </div>
    );
};

Row.propTypes = {
    entry: PropTypes.object,
    indent: PropTypes.bool,
    onGo: PropTypes.func
};

class OutlinePanel extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false, query: '', tick: 0};
        this.handleToggle = this.handleToggle.bind(this);
        this.handleRefresh = this.handleRefresh.bind(this);
        this.handleQuery = this.handleQuery.bind(this);
        this.handleReveal = this.handleReveal.bind(this);
    }
    componentDidMount () {
        this.timer = setInterval(this.handleRefresh, 900);
    }
    componentWillUnmount () {
        clearInterval(this.timer);
    }
    handleQuery (e) {
        this.setState({query: e.target.value});
    }
    handleRefresh () {
        this.setState(s => ({tick: s.tick + 1}));
    }
    handleToggle () {
        this.setState(s => ({open: !s.open}));
    }
    handleReveal (e) {
        const id = e.currentTarget.getAttribute('data-comment-id');
        if (id) revealComment(id);
    }
    render () {
        const target = this.props.vm && this.props.vm.editingTarget;
        const {groups, loose, total} = buildOutline(target && target.comments, this.state.query);
        const {open} = this.state;
        const {intl} = this.props;

        return (
            <div style={{position: 'relative'}}>
                <button
                    aria-expanded={!!open}
                    className={classNames(barStyles.barPill, {[barStyles.barPillOpen]: open})}
                    title={intl.formatMessage(messages.outlineTitle)}
                    type="button"
                    onClick={this.handleToggle}
                >
                    <SqIcon
                        name="outline"
                        size={20}
                    />
                    <span>{intl.formatMessage(messages.outline)}</span>
                    {total ? (
                        <span className={barStyles.barPillCount}>{total}</span>
                    ) : null}
                </button>

                {open ? (
                    <div
                        style={{
                            position: 'fixed',
                            top: '52px',
                            right: '8px',
                            width: '286px',
                            maxHeight: '70vh',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            background: T.surface,
                            border: `1px solid ${T.line}`,
                            borderRadius: '16px',
                            boxShadow: '0 18px 50px -12px rgba(0,0,0,.7)',
                            zIndex: 1000,
                            color: T.ink,
                            fontFamily: T.font,
                            cursor: 'default'
                        }}
                    >
                        <div style={{padding: '13px 14px 11px', borderBottom: `1px solid ${T.line}`}}>
                            <div style={label}>{intl.formatMessage(messages.outline)}</div>
                            <input
                                onChange={this.handleQuery}
                                placeholder={intl.formatMessage(messages.searchPlaceholder)}
                                style={{
                                    width: '100%',
                                    marginTop: '8px',
                                    padding: '7px 10px',
                                    fontSize: '14px',
                                    color: T.ink,
                                    background: 'rgba(0,0,0,.3)',
                                    border: `1.5px solid ${T.line}`,
                                    borderRadius: '9px',
                                    outline: 'none',
                                    fontFamily: 'inherit'
                                }}
                                type="text"
                                value={this.state.query}
                            />
                        </div>

                        <div style={{padding: '8px 10px 12px'}}>
                            {groups.map(g => (
                                <div
                                    key={g.section.id}
                                    style={{marginBottom: '6px'}}
                                >
                                    <div
                                        data-comment-id={g.section.id}
                                        onClick={this.handleReveal}
                                        role="button"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '6px 8px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: 800,
                                            letterSpacing: '0.2px'
                                        }}
                                        tabIndex={0}
                                    >
                                        <Chip type={'section'} />
                                        <span
                                            style={{flex: 1,
                                                minWidth: 0,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'}}
                                        >
                                            {summarize(g.section.parsed) || 'Section'}
                                        </span>
                                        <span style={{color: T.faint, fontSize: '12px'}}>
                                            {g.children.length || ''}
                                        </span>
                                    </div>
                                    {g.children.map(e => (
                                        <Row
                                            entry={e}
                                            indent
                                            key={e.id}
                                            onGo={this.handleReveal}
                                        />
                                    ))}
                                </div>
                            ))}

                            {loose.map(e => (
                                <Row
                                    entry={e}
                                    key={e.id}
                                    onGo={this.handleReveal}
                                />
                            ))}

                            {!groups.length && !loose.length ? (
                                <div
                                    style={{fontSize: '14px',
                                        color: T.faint,
                                        padding: '6px 8px',
                                        lineHeight: 1.55}}
                                >
                                    {total ?
                                        intl.formatMessage(messages.noMatches) :
                                        intl.formatMessage(messages.empty)}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}

OutlinePanel.propTypes = {
    intl: intlShape,
    vm: PropTypes.object
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

export default injectIntl(connect(mapStateToProps)(OutlinePanel));

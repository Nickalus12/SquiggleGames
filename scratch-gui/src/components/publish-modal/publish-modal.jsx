import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import client from '../../lib/collab/client';
import overlay from '../../lib/collab/overlay';
import {listProjects, request} from '../../lib/collab/room-api.js';
import styles from './publish-modal.css';

const GENRE_TAGS = [
    {id: 'platformer', label: 'Platformer'},
    {id: 'multiplayer', label: 'Multiplayer'},
    {id: 'maze', label: 'Maze & 3D'},
    {id: 'puzzle', label: 'Puzzle'},
    {id: 'racing', label: 'Racing'},
    {id: 'story', label: 'Story'},
    {id: 'art', label: 'Art'},
    {id: 'music', label: 'Music'}
];

class PublishModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            title: props.projectTitle || 'Untitled Game',
            description: '',
            instructions: 'WASD or Arrows to move, Space to jump or act.',
            visibility: 'unlisted',
            tags: ['multiplayer'],
            projectId: props.projectId || '',
            saving: false,
            statusMessage: '',
            copied: false
        };
        this.handleBackdropMouseDown = this.handleBackdropMouseDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleSaveAndPublish = this.handleSaveAndPublish.bind(this);
        this.handleCopyLink = this.handleCopyLink.bind(this);
    }

    componentDidUpdate (prevProps) {
        if (this.props.isOpen && !prevProps.isOpen) {
            this.hydrateLatestProject();
        }
    }

    async hydrateLatestProject () {
        const nextTitle = this.props.projectTitle || this.state.title || 'Untitled Game';
        this.setState({title: nextTitle, statusMessage: '', copied: false});
        try {
            const projects = await listProjects();
            if (Array.isArray(projects) && projects.length > 0) {
                const match = projects.find(p => p.name === nextTitle) || projects[0];
                if (match && match.id) {
                    this.setState({
                        projectId: String(match.id),
                        visibility: match.visibility || 'unlisted'
                    });
                }
            }
        } catch (_e) {
        }
    }

    toggleTag (tagId) {
        this.setState(prev => {
            const exists = prev.tags.includes(tagId);
            if (exists) {
                return {tags: prev.tags.filter(t => t !== tagId)};
            }
            if (prev.tags.length >= 3) {
                return prev;
            }
            return {tags: prev.tags.concat(tagId)};
        });
    }

    async handleSaveAndPublish (e) {
        e.preventDefault();
        if (this.state.saving) return;
        const cleanTitle = String(this.state.title || '').trim() || 'Untitled Game';
        this.setState({saving: true, statusMessage: ''});
        try {
            const roomSelf = overlay.getState().self;
            if (roomSelf) {
                client.send({type: 'save-project', name: cleanTitle});
            }
            let targetId = this.state.projectId;
            if (!targetId) {
                const projects = await listProjects().catch(() => []);
                const found = projects.find(p => p.name === cleanTitle) || projects[0];
                if (found && found.id) targetId = String(found.id);
            }
            if (targetId) {
                const out = await request(`/api/projects/${encodeURIComponent(targetId)}/publish`, {
                    method: 'POST',
                    body: {
                        visibility: this.state.visibility,
                        description: this.state.description,
                        instructions: this.state.instructions,
                        tags: this.state.tags
                    }
                });
                this.setState({
                    saving: false,
                    projectId: targetId,
                    statusMessage: out && out.pendingApproval ?
                        'Saved! Waiting for a grown-up to approve public sharing.' :
                        'Published! Your play link is ready to share.'
                });
                return;
            }
            this.setState({
                saving: false,
                statusMessage: roomSelf ?
                    'Saved to your library! Open Your Games on the home page to share publicly.' :
                    'Game settings saved in project!'
            });
        } catch (err) {
            this.setState({
                saving: false,
                statusMessage: (err && err.friendly) || 'Saved locally in your project.'
            });
        }
    }

    handleCopyLink () {
        const {projectId} = this.state;
        const roomSelf = overlay.getState().self;
        const shareUrl = projectId ?
            `${window.location.origin}/play/${encodeURIComponent(projectId)}` :
            (roomSelf ? `${window.location.origin}/editor.html?room=${encodeURIComponent(roomSelf.room)}` : window.location.href);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(shareUrl).then(() => {
                this.setState({copied: true});
            })
                .catch(() => {});
        }
    }

    handleBackdropMouseDown (e) {
        if (e.target === e.currentTarget && typeof this.props.onRequestClose === 'function') {
            this.props.onRequestClose();
        }
    }

    handleKeyDown (e) {
        if (e.key === 'Escape' && typeof this.props.onRequestClose === 'function') {
            e.stopPropagation();
            this.props.onRequestClose();
        }
    }

    render () {
        if (!this.props.isOpen) return null;
        const {
            title,
            description,
            instructions,
            visibility,
            tags,
            projectId,
            saving,
            statusMessage,
            copied
        } = this.state;
        const roomSelf = overlay.getState().self;
        const shareUrl = projectId ?
            `${typeof window !== 'undefined' ? window.location.origin : ''}/play/${encodeURIComponent(projectId)}` :
            (roomSelf ? `${typeof window !== 'undefined' ? window.location.origin : ''}/editor.html?room=${encodeURIComponent(roomSelf.room)}` : '');

        return (
            <div
                className={styles.scrim}
                data-testid="publish-modal"
                onMouseDown={this.handleBackdropMouseDown}
                onKeyDown={this.handleKeyDown}
            >
                <form
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sq-publish-modal-title"
                    className={styles.sheet}
                    onSubmit={this.handleSaveAndPublish}
                >
                    <div className={styles.header}>
                        <div>
                            <h2
                                id="sq-publish-modal-title"
                                className={styles.title}
                            >
                                {'Publish & Share Game'}
                            </h2>
                            <p className={styles.subtitle}>
                                {'Save to your library, set how to play, and share a link with friends.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            className={styles.closeBtn}
                            aria-label="Close"
                            onClick={this.props.onRequestClose}
                        >
                            {'×'}
                        </button>
                    </div>

                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>{'Game title'}</span>
                        <input
                            type="text"
                            className={styles.input}
                            maxLength={60}
                            value={title}
                            onChange={e => this.setState({title: e.target.value})}
                        />
                    </label>

                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>{'Who can play it'}</span>
                        <div className={styles.visRow}>
                            {[
                                {id: 'private', label: 'Just me'},
                                {id: 'unlisted', label: 'Anyone with link'},
                                {id: 'public', label: 'Everyone in Explore'}
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    className={classNames(styles.visBtn, {[styles.visBtnActive]: visibility === opt.id})}
                                    aria-pressed={visibility === opt.id}
                                    onClick={() => this.setState({visibility: opt.id})}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>{'How do you play? (Controls & rules)'}</span>
                        <textarea
                            className={styles.textarea}
                            rows={2}
                            maxLength={600}
                            value={instructions}
                            onChange={e => this.setState({instructions: e.target.value})}
                        />
                    </label>

                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>{'About this game'}</span>
                        <textarea
                            className={styles.textarea}
                            rows={2}
                            maxLength={600}
                            placeholder="Tell players what makes your game fun…"
                            value={description}
                            onChange={e => this.setState({description: e.target.value})}
                        />
                    </label>

                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>{'Genre tags (pick up to 3)'}</span>
                        <div className={styles.tagRow}>
                            {GENRE_TAGS.map(tag => {
                                const active = tags.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        className={classNames(styles.tagChip, {[styles.tagChipActive]: active})}
                                        aria-pressed={active}
                                        onClick={() => this.toggleTag(tag.id)}
                                    >
                                        {tag.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {shareUrl && (
                        <div className={styles.shareBox}>
                            <input
                                type="text"
                                readOnly
                                className={styles.input}
                                value={shareUrl}
                            />
                            <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={this.handleCopyLink}
                            >
                                {copied ? 'Copied!' : 'Copy Link'}
                            </button>
                        </div>
                    )}

                    {statusMessage && (
                        <p
                            className={styles.statusMsg}
                            role="status"
                        >
                            {statusMessage}
                        </p>
                    )}

                    <div className={styles.footer}>
                        <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={this.props.onRequestClose}
                        >
                            {'Done'}
                        </button>
                        <button
                            type="submit"
                            className={styles.primaryBtn}
                            data-testid="publish-modal-submit"
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : 'Save & Publish'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }
}

PublishModal.propTypes = {
    isOpen: PropTypes.bool,
    projectId: PropTypes.string,
    projectTitle: PropTypes.string,
    onRequestClose: PropTypes.func
};

export default PublishModal;

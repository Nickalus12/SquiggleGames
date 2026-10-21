import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import styles from './scene-strip.css';

const messages = defineMessages({
    label: {
        id: 'sq.scenes.strip.label',
        defaultMessage: 'Scenes',
        description: 'Accessible name of the strip of scene thumbnails above the stage'
    },
    add: {
        id: 'sq.scenes.strip.add',
        defaultMessage: 'Add scene',
        description: 'Button that adds a scene from what is on the stage now'
    },
    rename: {
        id: 'sq.scenes.strip.rename',
        defaultMessage: 'Rename',
        description: 'Button that renames the selected scene'
    },
    update: {
        id: 'sq.scenes.strip.update',
        defaultMessage: 'Use stage',
        description: 'Button that saves where sprites are now as the start positions of the selected scene'
    },
    remove: {
        id: 'sq.scenes.strip.remove',
        defaultMessage: 'Delete',
        description: 'Button that deletes the selected scene'
    },
    confirm: {
        id: 'sq.scenes.strip.confirm',
        defaultMessage: 'Delete?',
        description: 'Second press needed to delete a scene'
    },
    moveLeft: {
        id: 'sq.scenes.strip.moveLeft',
        defaultMessage: 'Move left',
        description: 'Button that moves the selected scene earlier'
    },
    moveRight: {
        id: 'sq.scenes.strip.moveRight',
        defaultMessage: 'Move right',
        description: 'Button that moves the selected scene later'
    },
    nameField: {
        id: 'sq.scenes.strip.nameField',
        defaultMessage: 'Scene name',
        description: 'Text field for a scene name'
    },
    empty: {
        id: 'sq.scenes.strip.empty',
        defaultMessage: 'No scenes yet',
        description: 'Shown in the phone scene sheet when the project has no scenes'
    }
});

const readState = controller => ({
    scenes: controller.list(),
    currentId: controller.currentId()
});

class SceneStrip extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAdd',
            'handleChange',
            'handleDelete',
            'handleDragEnd',
            'handleDragOver',
            'handleDragStart',
            'handleDrop',
            'handleKeyDown',
            'handleMoveLeft',
            'handleMoveRight',
            'handleNameBlur',
            'handleNameChange',
            'handleNameKeyDown',
            'handlePick',
            'handleRename',
            'handleUpdate',
            'setList'
        ]);
        this.state = Object.assign(readState(props.controller), {
            focusId: '',
            editingId: '',
            draft: '',
            confirmId: '',
            dragId: ''
        });
    }
    componentDidMount () {
        const events = this.props.controller.events;
        this.disposers = [events.on('scenes', this.handleChange), events.on('current', this.handleChange)];
    }
    componentWillUnmount () {
        this.disposers.forEach(dispose => dispose());
    }
    handleChange () {
        this.setState(readState(this.props.controller));
    }
    selectedId () {
        const ids = this.state.scenes.map(scene => scene.id);
        if (ids.indexOf(this.state.focusId) !== -1) return this.state.focusId;
        if (ids.indexOf(this.state.currentId) !== -1) return this.state.currentId;
        return ids[0] || '';
    }
    focusScene (id) {
        this.setState({focusId: id, confirmId: ''}, () => {
            const el = this.list && this.list.querySelector(`[data-scene-id="${id}"]`);
            if (el) el.focus();
        });
    }
    handlePick (event) {
        const id = event.currentTarget.getAttribute('data-scene-id');
        this.props.controller.preview(id);
        this.setState({focusId: id, confirmId: ''});
        if (this.props.onPicked) this.props.onPicked(id);
    }
    handleAdd () {
        const scene = this.props.controller.add();
        if (scene) this.focusScene(scene.id);
    }
    handleRename () {
        const id = this.selectedId();
        const scene = this.state.scenes.find(s => s.id === id);
        if (scene) this.setState({editingId: id, draft: scene.name, confirmId: ''});
    }
    handleNameChange (event) {
        this.setState({draft: event.target.value});
    }
    commitName () {
        const id = this.state.editingId;
        if (id && this.state.draft.trim()) this.props.controller.rename(id, this.state.draft);
        this.setState({editingId: '', draft: ''}, () => this.focusScene(id));
    }
    handleNameKeyDown (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.commitName();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            const id = this.state.editingId;
            this.setState({editingId: '', draft: ''}, () => this.focusScene(id));
        }
    }
    handleNameBlur () {
        if (this.state.editingId) this.commitName();
    }
    handleUpdate () {
        const id = this.selectedId();
        if (!id) return;
        const fresh = this.props.controller.capture();
        this.props.controller.update(id, {backdrop: fresh.backdrop, level: fresh.level, spawns: fresh.spawns});
    }
    handleDelete () {
        const id = this.selectedId();
        if (!id) return;
        if (this.state.confirmId !== id) {
            this.setState({confirmId: id});
            return;
        }
        const at = this.state.scenes.findIndex(scene => scene.id === id);
        this.props.controller.remove(id);
        const rest = this.props.controller.list();
        const next = rest[Math.min(at, rest.length - 1)];
        this.setState({confirmId: '', focusId: next ? next.id : ''});
        if (next) this.focusScene(next.id);
    }
    move (delta) {
        const id = this.selectedId();
        const at = this.state.scenes.findIndex(scene => scene.id === id);
        if (at === -1) return;
        if (this.props.controller.move(id, at + delta)) this.focusScene(id);
    }
    handleMoveLeft () {
        this.move(-1);
    }
    handleMoveRight () {
        this.move(1);
    }
    handleKeyDown (event) {
        const id = event.currentTarget.getAttribute('data-scene-id');
        const ids = this.state.scenes.map(scene => scene.id);
        const at = ids.indexOf(id);
        const step = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[event.key];
        if (step && event.altKey && !this.props.compact) {
            event.preventDefault();
            this.setState({focusId: id}, () => this.move(step));
        } else if (step) {
            event.preventDefault();
            const next = ids[Math.max(0, Math.min(ids.length - 1, at + step))];
            if (next) this.focusScene(next);
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            this.focusScene(event.key === 'Home' ? ids[0] : ids[ids.length - 1]);
        } else if (event.key === 'F2' && !this.props.compact) {
            event.preventDefault();
            this.setState({focusId: id}, this.handleRename);
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && !this.props.compact) {
            event.preventDefault();
            this.setState({focusId: id}, this.handleDelete);
        }
    }
    handleDragStart (event) {
        const id = event.currentTarget.getAttribute('data-scene-id');
        this.setState({dragId: id});
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
        }
    }
    handleDragOver (event) {
        if (this.state.dragId) event.preventDefault();
    }
    handleDrop (event) {
        event.preventDefault();
        const to = this.state.scenes.findIndex(scene => scene.id === event.currentTarget.getAttribute('data-scene-id'));
        if (this.state.dragId && to !== -1) this.props.controller.move(this.state.dragId, to);
        this.setState({dragId: ''});
    }
    handleDragEnd () {
        this.setState({dragId: ''});
    }
    setList (el) {
        this.list = el;
    }
    renderScene (scene, index) {
        const {controller, compact, intl} = this.props;
        const selected = this.selectedId() === scene.id;
        const current = this.state.currentId === scene.id;
        const thumb = controller.thumbnail(scene);
        if (this.state.editingId === scene.id) {
            return (
                <li
                    className={classNames(styles.item, styles.editing)}
                    key={scene.id}
                >
                    <input
                        autoFocus
                        aria-label={intl.formatMessage(messages.nameField)}
                        className={styles.nameField}
                        maxLength={100}
                        value={this.state.draft}
                        onBlur={this.handleNameBlur}
                        onChange={this.handleNameChange}
                        onKeyDown={this.handleNameKeyDown}
                    />
                </li>
            );
        }
        return (
            <li
                className={classNames(styles.item, {[styles.dragging]: this.state.dragId === scene.id})}
                key={scene.id}
            >
                <button
                    aria-current={current ? 'true' : null}
                    className={classNames(styles.scene, {
                        [styles.current]: current,
                        [styles.compact]: compact
                    })}
                    data-scene-id={scene.id}
                    draggable={!compact}
                    tabIndex={selected ? 0 : -1}
                    title={scene.name}
                    onClick={this.handlePick}
                    onDragEnd={this.handleDragEnd}
                    onDragOver={this.handleDragOver}
                    onDragStart={this.handleDragStart}
                    onDrop={this.handleDrop}
                    onKeyDown={this.handleKeyDown}
                >
                    <span className={styles.thumb}>
                        {thumb ? (
                            <img
                                alt=""
                                className={styles.thumbImage}
                                draggable={false}
                                src={thumb}
                            />
                        ) : null}
                        <span className={styles.number}>{index + 1}</span>
                    </span>
                    <span className={styles.name}>{scene.name}</span>
                </button>
            </li>
        );
    }
    renderTools () {
        const {intl} = this.props;
        const selected = this.selectedId();
        const at = this.state.scenes.findIndex(scene => scene.id === selected);
        const confirming = this.state.confirmId && this.state.confirmId === selected;
        return (
            <div className={styles.tools}>
                <button
                    className={styles.tool}
                    disabled={at <= 0}
                    title={intl.formatMessage(messages.moveLeft)}
                    onClick={this.handleMoveLeft}
                >
                    <span aria-hidden="true">{'<'}</span>
                    <span className={styles.hidden}>{intl.formatMessage(messages.moveLeft)}</span>
                </button>
                <button
                    className={styles.tool}
                    disabled={at === -1 || at >= this.state.scenes.length - 1}
                    title={intl.formatMessage(messages.moveRight)}
                    onClick={this.handleMoveRight}
                >
                    <span aria-hidden="true">{'>'}</span>
                    <span className={styles.hidden}>{intl.formatMessage(messages.moveRight)}</span>
                </button>
                <button
                    className={styles.tool}
                    disabled={at === -1}
                    onClick={this.handleRename}
                >
                    {intl.formatMessage(messages.rename)}
                </button>
                <button
                    className={styles.tool}
                    disabled={at === -1}
                    onClick={this.handleUpdate}
                >
                    {intl.formatMessage(messages.update)}
                </button>
                <button
                    className={classNames(styles.tool, {[styles.danger]: confirming})}
                    disabled={at === -1}
                    onClick={this.handleDelete}
                >
                    {intl.formatMessage(confirming ? messages.confirm : messages.remove)}
                </button>
            </div>
        );
    }
    render () {
        const {compact, intl} = this.props;
        const label = intl.formatMessage(messages.label);
        return (
            <div
                aria-label={label}
                className={classNames(styles.strip, {[styles.sheet]: compact})}
                role="group"
            >
                {compact && !this.state.scenes.length ? (
                    <p className={styles.empty}>{intl.formatMessage(messages.empty)}</p>
                ) : null}
                <ul
                    className={styles.list}
                    ref={this.setList}
                >
                    {this.state.scenes.map((scene, index) => this.renderScene(scene, index))}
                    {compact ? null : (
                        <li className={styles.item}>
                            <button
                                className={classNames(styles.scene, styles.add)}
                                title={intl.formatMessage(messages.add)}
                                onClick={this.handleAdd}
                            >
                                <span
                                    aria-hidden="true"
                                    className={styles.plus}
                                >{'+'}</span>
                                <span className={styles.name}>{intl.formatMessage(messages.add)}</span>
                            </button>
                        </li>
                    )}
                </ul>
                {compact ? null : this.renderTools()}
            </div>
        );
    }
}

SceneStrip.propTypes = {
    compact: PropTypes.bool,
    controller: PropTypes.shape({
        add: PropTypes.func.isRequired,
        capture: PropTypes.func.isRequired,
        currentId: PropTypes.func.isRequired,
        events: PropTypes.shape({on: PropTypes.func.isRequired}).isRequired,
        list: PropTypes.func.isRequired,
        move: PropTypes.func.isRequired,
        preview: PropTypes.func.isRequired,
        remove: PropTypes.func.isRequired,
        rename: PropTypes.func.isRequired,
        thumbnail: PropTypes.func.isRequired,
        update: PropTypes.func.isRequired
    }).isRequired,
    intl: intlShape.isRequired,
    onPicked: PropTypes.func
};

SceneStrip.defaultProps = {
    compact: false
};

export {SceneStrip as PlainSceneStrip};
export default injectIntl(SceneStrip);

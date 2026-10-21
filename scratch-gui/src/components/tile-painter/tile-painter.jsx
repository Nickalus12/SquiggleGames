import bindAll from 'lodash.bindall';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {FLAGS} from '../../lib/world/tilemap.js';
import {
    FLAG_NAMES, PAINT_LAYERS, TOOLS, cellFromClient, cellToClient, createPainter
} from '../../lib/world/painter.js';
import {peekScenes} from '../../lib/world/scenes.js';
import {
    setPainterFlag, setPainterGrid, setPainterLayer, setPainterOpen, setPainterTile, setPainterTool
} from '../../reducers/world-ui';
import styles from './tile-painter.css';

const SHORTCUTS = {b: 'paint', e: 'erase', g: 'fill', r: 'rect', i: 'pick', f: 'flag', s: 'spawn', c: 'bounds'};
const KEY_OF = Object.keys(SHORTCUTS).reduce((map, key) => Object.assign(map, {[SHORTCUTS[key]]: key}), {});
const FLAG_COLORS = {solid: '#3a6ff0', oneway: '#2fa36b', hazard: '#e0483e', goal: '#e3a21a'};
const HELP_ID = 'sq-tile-painter-help';

const messages = defineMessages({
    toolbar: {
        id: 'sq.painter.toolbar',
        defaultMessage: 'Tile painter',
        description: 'Name of the tile painter toolbar'
    },
    canvas: {
        id: 'sq.painter.canvas',
        defaultMessage: 'Level grid',
        description: 'Accessible name of the stage area while painting tiles'
    },
    help: {
        id: 'sq.painter.help',
        defaultMessage: 'Arrow keys move the cursor. Enter uses the tool once. ' +
            'Hold Space and use the arrows to drag. ' +
            'Ctrl+Z undoes. Escape closes.',
        description: 'Keyboard help for the tile painter'
    },
    paint: {id: 'sq.painter.tool.paint', defaultMessage: 'Paint', description: 'Tile painter tool'},
    erase: {id: 'sq.painter.tool.erase', defaultMessage: 'Erase', description: 'Tile painter tool'},
    fill: {
        id: 'sq.painter.tool.fill',
        defaultMessage: 'Fill',
        description: 'Tile painter tool that floods an area'
    },
    rect: {id: 'sq.painter.tool.rect', defaultMessage: 'Box', description: 'Tile painter tool that fills a rectangle'},
    pick: {id: 'sq.painter.tool.pick', defaultMessage: 'Pick', description: 'Tile painter tool that picks a tile'},
    flag: {id: 'sq.painter.tool.flag', defaultMessage: 'Flag', description: 'Tile painter tool that marks cells'},
    spawn: {
        id: 'sq.painter.tool.spawn',
        defaultMessage: 'Spawn',
        description: 'Tile painter tool that sets where the selected sprite starts'
    },
    bounds: {
        id: 'sq.painter.tool.bounds',
        defaultMessage: 'Camera',
        description: 'Tile painter tool that draws the camera limits for the scene'
    },
    back: {id: 'sq.painter.layer.back', defaultMessage: 'Back', description: 'Tile layer behind sprites'},
    main: {id: 'sq.painter.layer.main', defaultMessage: 'Main', description: 'Tile layer sprites stand on'},
    front: {id: 'sq.painter.layer.front', defaultMessage: 'Front', description: 'Tile layer in front of sprites'},
    layer: {id: 'sq.painter.layer', defaultMessage: 'Layer', description: 'Label for the tile layer choice'},
    tiles: {id: 'sq.painter.tiles', defaultMessage: 'Tiles', description: 'Label for the tile palette'},
    flagKind: {
        id: 'sq.painter.flagKind',
        defaultMessage: 'Mark',
        description: 'Label for which flag the Flag tool sets'
    },
    solid: {id: 'sq.painter.flag.solid', defaultMessage: 'solid', description: 'Cell flag'},
    oneway: {id: 'sq.painter.flag.oneway', defaultMessage: 'one way', description: 'Cell flag'},
    hazard: {id: 'sq.painter.flag.hazard', defaultMessage: 'hazard', description: 'Cell flag'},
    goal: {id: 'sq.painter.flag.goal', defaultMessage: 'goal', description: 'Cell flag'},
    undo: {id: 'sq.painter.undo', defaultMessage: 'Undo', description: 'Undo the last tile stroke'},
    redo: {id: 'sq.painter.redo', defaultMessage: 'Redo', description: 'Redo a tile stroke'},
    grid: {id: 'sq.painter.grid', defaultMessage: 'Grid', description: 'Show or hide grid lines'},
    done: {id: 'sq.painter.done', defaultMessage: 'Done', description: 'Close the tile painter'},
    noLevel: {
        id: 'sq.painter.noLevel',
        defaultMessage: 'Add a level with the World blocks to paint tiles.',
        description: 'Shown when the project has no level'
    },
    noTiles: {
        id: 'sq.painter.noTiles',
        defaultMessage: 'Add costumes to the tileset to paint with them.',
        description: 'Shown when the tileset has no costumes'
    },
    at: {
        id: 'sq.painter.at',
        defaultMessage: 'Column {col}, row {row}',
        description: 'Announces the keyboard cursor cell'
    },
    picked: {id: 'sq.painter.picked', defaultMessage: 'Picked {name}', description: 'Announces a picked tile'},
    spawned: {
        id: 'sq.painter.spawned',
        defaultMessage: '{name} starts here',
        description: 'Announces a new spawn point'
    },
    framed: {
        id: 'sq.painter.framed',
        defaultMessage: 'Camera limits set',
        description: 'Announces new camera bounds'
    }
});

const tilesetOwner = (runtime, grid) => {
    const sprite = grid && grid.tileset ? runtime.getSpriteTargetByName(grid.tileset) : null;
    return sprite || runtime.getTargetForStage();
};

const paletteFor = (runtime, grid) => {
    const owner = grid ? tilesetOwner(runtime, grid) : null;
    if (!owner) return [];
    return owner.getCostumes().map(costume => {
        const lower = String(costume.name).toLowerCase();
        const at = grid.tiles.findIndex(tile => tile.name.toLowerCase() === lower);
        return {name: costume.name, value: at + 1, costume};
    });
};

const sameRect = (a, b) => a && b && a.left === b.left && a.top === b.top &&
    a.width === b.width && a.height === b.height;

class TilePainter extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleBlur',
            'handleClose',
            'handleFrame',
            'handleKeyDown',
            'handleKeyUp',
            'handleLayer',
            'handleFlag',
            'handlePointerDown',
            'handlePointerLeave',
            'handlePointerMove',
            'handlePointerUp',
            'handleRedo',
            'handleTile',
            'handleTool',
            'handleToggleGrid',
            'handleUndo',
            'handleWorldChange',
            'setCanvas'
        ]);
        this.painter = createPainter({world: props.world, onChange: this.handleWorldChange});
        this.thumbs = new Map();
        this.state = {
            rect: null,
            hover: null,
            cursor: null,
            announce: '',
            palette: [],
            version: 0
        };
        this.dirty = true;
    }
    componentDidMount () {
        const events = this.props.world.events;
        this.disposers = ['cells', 'level', 'levels'].map(name => events.on(name, this.handleWorldChange));
        this.props.runtime.on('PROJECT_CHANGED', this.handleWorldChange);
        if (this.props.open) this.start();
    }
    componentDidUpdate (prevProps) {
        if (this.props.open && !prevProps.open) this.start();
        if (!this.props.open && prevProps.open) this.stop();
        if (prevProps.showGrid !== this.props.showGrid || prevProps.tool !== this.props.tool) this.dirty = true;
    }
    componentWillUnmount () {
        this.disposers.forEach(dispose => dispose());
        this.props.runtime.removeListener('PROJECT_CHANGED', this.handleWorldChange);
        this.stop();
    }
    start () {
        this.refreshPalette();
        this.dirty = true;
        this.frame = this.props.win.requestAnimationFrame(this.handleFrame);
    }
    stop () {
        if (this.frame) this.props.win.cancelAnimationFrame(this.frame);
        this.frame = null;
        this.painter.cancel();
    }
    grid () {
        return this.painter.grid();
    }
    refreshPalette () {
        this.setState({palette: paletteFor(this.props.runtime, this.grid())});
    }
    handleWorldChange () {
        this.dirty = true;
        this.paletteStale = true;
        this.setState(state => ({version: state.version + 1}));
    }
    handleFrame () {
        this.frame = this.props.win.requestAnimationFrame(this.handleFrame);
        const renderer = this.props.runtime.renderer;
        const source = this.props.canvas || (renderer ? renderer.canvas : null);
        if (!source) return;
        const box = source.getBoundingClientRect();
        const rect = {left: box.left, top: box.top, width: box.width, height: box.height};
        const view = this.props.world.view();
        if (!sameRect(rect, this.state.rect)) {
            this.dirty = true;
            this.setState({rect});
        }
        if (view !== this.lastView) {
            this.lastView = view;
            this.dirty = true;
        }
        if (this.paletteStale) {
            this.paletteStale = false;
            this.refreshPalette();
        }
        if (this.dirty) this.draw(rect, view);
    }
    draw (rect, view) {
        const canvas = this.canvas;
        const grid = this.grid();
        if (!canvas) return;
        this.dirty = false;
        const ratio = this.props.win.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(rect.width * ratio));
        const h = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!grid) return;
        ctx.scale(ratio, ratio);
        const corner = cellToClient(grid, view, rect, 0, 0);
        const size = corner.width;
        const firstCol = Math.max(0, Math.floor(-corner.left / size));
        const lastCol = Math.min(grid.cols - 1, Math.ceil((rect.width - corner.left) / size));
        const firstRow = Math.max(0, Math.floor(-corner.top / size));
        const lastRow = Math.min(grid.rows - 1, Math.ceil((rect.height - corner.top) / size));
        if (this.props.showGrid && size >= 6) {
            ctx.beginPath();
            for (let c = firstCol; c <= lastCol + 1; c++) {
                const x = Math.round(corner.left + (c * size)) + 0.5;
                ctx.moveTo(x, corner.top + (firstRow * size));
                ctx.lineTo(x, corner.top + ((lastRow + 1) * size));
            }
            for (let r = firstRow; r <= lastRow + 1; r++) {
                const y = Math.round(corner.top + (r * size)) + 0.5;
                ctx.moveTo(corner.left + (firstCol * size), y);
                ctx.lineTo(corner.left + ((lastCol + 1) * size), y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.setLineDash([2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (this.props.tool === 'flag' || this.props.tool === 'bounds') {
            for (let r = firstRow; r <= lastRow; r++) {
                for (let c = firstCol; c <= lastCol; c++) {
                    const bits = grid.flags[(r * grid.cols) + c];
                    if (!bits) continue;
                    FLAG_NAMES.forEach((name, i) => {
                        if (!(bits & FLAGS[name])) return;
                        ctx.fillStyle = FLAG_COLORS[name];
                        ctx.globalAlpha = 0.45;
                        const x = corner.left + (c * size) + (i * size / 4);
                        ctx.fillRect(x, corner.top + (r * size), size / 4, size);
                    });
                }
            }
            ctx.globalAlpha = 1;
        }
        const box = this.painter.preview();
        if (box) {
            const a = cellToClient(grid, view, rect, Math.min(box.start.col, box.last.col),
                Math.min(box.start.row, box.last.row));
            const cols = Math.abs(box.start.col - box.last.col) + 1;
            const rows = Math.abs(box.start.row - box.last.row) + 1;
            ctx.fillStyle = box.tool === 'bounds' ? 'rgba(91, 110, 225, 0.18)' : 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(a.left, a.top, cols * size, rows * size);
            ctx.strokeStyle = '#5b6ee1';
            ctx.lineWidth = 2;
            ctx.strokeRect(a.left + 1, a.top + 1, (cols * size) - 2, (rows * size) - 2);
        }
        const marks = [[this.state.hover, '#ffffff', []], [this.state.cursor, '#ffbf1f', [4, 3]]];
        marks.forEach(([cell, color, dash]) => {
            if (!cell) return;
            const at = cellToClient(grid, view, rect, cell.col, cell.row);
            ctx.setLineDash(dash);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 3;
            ctx.strokeRect(at.left + 1, at.top + 1, at.width - 2, at.height - 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(at.left + 1, at.top + 1, at.width - 2, at.height - 2);
        });
        ctx.setLineDash([]);
    }
    settings () {
        return {layer: this.props.layer, tile: this.props.tile, flag: this.props.flag};
    }
    cellAt (event) {
        return cellFromClient(this.grid(), this.props.world.view(), this.state.rect, event.clientX, event.clientY);
    }
    finish (result) {
        if (!result) return;
        const {intl, runtime, world} = this.props;
        if (result.tool === 'pick' && result.value > 0) {
            this.props.onTile(result.value);
            const tile = this.grid().tiles[result.value - 1];
            this.say(intl.formatMessage(messages.picked, {name: tile ? tile.name : result.value}));
        } else if (result.tool === 'spawn') {
            const target = runtime.getEditingTarget();
            if (!target || target.isStage) return;
            target.setXY(result.point.x, result.point.y);
            const scenes = peekScenes(runtime);
            const now = scenes && scenes.current();
            if (now && now.scene) {
                const name = target.getName();
                const spawns = now.scene.spawns.filter(spawn => spawn.sprite.toLowerCase() !== name.toLowerCase())
                    .concat({sprite: name, x: Math.round(result.point.x), y: Math.round(result.point.y), shown: true});
                scenes.update(now.scene.id, {spawns});
            }
            this.say(intl.formatMessage(messages.spawned, {name: target.getName()}));
        } else if (result.tool === 'bounds') {
            const scenes = peekScenes(runtime);
            const now = scenes && scenes.current();
            if (now && now.scene) scenes.update(now.scene.id, {bounds: result.bounds});
            world.camera.setBounds(result.bounds);
            this.say(intl.formatMessage(messages.framed));
        }
        this.dirty = true;
    }
    say (text) {
        this.setState({announce: text});
    }
    handlePointerDown (event) {
        if (event.button !== 0) return;
        const cell = this.cellAt(event);
        if (!cell) return;
        event.preventDefault();
        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
        const started = this.painter.begin(this.props.tool, this.settings(), cell);
        if (started && (started.done || started.tool === 'pick')) this.finish(started);
        this.dirty = true;
    }
    handlePointerMove (event) {
        const cell = this.cellAt(event);
        const hover = this.state.hover;
        if (cell && hover && cell.col === hover.col && cell.row === hover.row) return;
        this.setState({hover: cell});
        if (this.painter.stroking()) this.painter.move(cell);
        this.dirty = true;
    }
    handlePointerUp (event) {
        if (!this.painter.stroking()) return;
        this.finish(this.painter.end(this.cellAt(event)));
    }
    handlePointerLeave () {
        this.setState({hover: null});
        this.dirty = true;
    }
    moveCursor (dc, dr) {
        const grid = this.grid();
        if (!grid) return;
        const from = this.state.cursor || this.state.hover || {col: 0, row: 0};
        const cursor = {
            col: Math.max(0, Math.min(grid.cols - 1, from.col + dc)),
            row: Math.max(0, Math.min(grid.rows - 1, from.row + dr))
        };
        const announce = this.props.intl.formatMessage(messages.at, {col: cursor.col + 1, row: cursor.row + 1});
        this.setState({cursor, announce});
        if (this.painter.stroking()) this.painter.move(cursor);
        this.dirty = true;
    }
    cycleTile (step) {
        const choices = this.state.palette.filter(item => item.value > 0);
        if (!choices.length) return;
        const at = choices.findIndex(item => item.value === this.props.tile);
        const next = choices[(at + step + choices.length) % choices.length];
        this.props.onTile(next.value);
    }
    handleKeyDown (event) {
        const key = event.key;
        const mod = event.ctrlKey || event.metaKey;
        if (mod && (key === 'z' || key === 'Z')) {
            event.preventDefault();
            if (event.shiftKey) this.handleRedo();
            else this.handleUndo();
            return;
        }
        if (mod && (key === 'y' || key === 'Y')) {
            event.preventDefault();
            this.handleRedo();
            return;
        }
        if (mod || event.altKey) return;
        const typing = event.target && (event.target.tagName === 'SELECT' || event.target.tagName === 'INPUT');
        if (key === 'Escape') {
            event.preventDefault();
            if (this.painter.stroking()) {
                this.painter.cancel();
                this.dirty = true;
                return;
            }
            this.handleClose();
            return;
        }
        if (typing) return;
        const lower = key.length === 1 ? key.toLowerCase() : '';
        if (SHORTCUTS[lower]) {
            event.preventDefault();
            this.props.onTool(SHORTCUTS[lower]);
            return;
        }
        if (key === '[' || key === ']') {
            event.preventDefault();
            this.cycleTile(key === '[' ? -1 : 1);
            return;
        }
        if (event.target !== this.canvas) return;
        const step = event.shiftKey ? 4 : 1;
        const arrows = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
        if (arrows[key]) {
            event.preventDefault();
            this.moveCursor(arrows[key][0], arrows[key][1]);
            return;
        }
        const cursor = this.state.cursor;
        if (!cursor) return;
        if (key === 'Enter') {
            event.preventDefault();
            const started = this.painter.begin(this.props.tool, this.settings(), cursor);
            if (started && (started.done || started.tool === 'pick')) this.finish(started);
            else if (started) this.finish(this.painter.end(cursor));
        } else if (key === ' ' && !event.repeat) {
            event.preventDefault();
            const started = this.painter.begin(this.props.tool, this.settings(), cursor);
            if (started && (started.done || started.tool === 'pick')) this.finish(started);
        }
        this.dirty = true;
    }
    handleKeyUp (event) {
        if (event.key !== ' ' || !this.painter.stroking()) return;
        event.preventDefault();
        this.finish(this.painter.end(this.state.cursor));
    }
    handleBlur () {
        if (this.painter.stroking()) this.finish(this.painter.end(this.state.cursor || this.state.hover));
    }
    handleTool (event) {
        this.props.onTool(event.currentTarget.getAttribute('data-tool'));
    }
    handleLayer (event) {
        this.props.onLayer(event.currentTarget.getAttribute('data-layer'));
    }
    handleFlag (event) {
        this.props.onFlag(event.target.value);
    }
    handleTile (event) {
        const name = event.currentTarget.getAttribute('data-name');
        const grid = this.grid();
        if (!grid) return;
        const value = this.props.world.addTile(grid.id, name, 0);
        if (value) this.props.onTile(value);
        this.refreshPalette();
    }
    handleUndo () {
        this.painter.undo();
        this.dirty = true;
    }
    handleRedo () {
        this.painter.redo();
        this.dirty = true;
    }
    handleToggleGrid () {
        this.props.onGrid(!this.props.showGrid);
    }
    handleClose () {
        this.painter.cancel();
        this.props.onClose();
    }
    setCanvas (el) {
        this.canvas = el;
        this.dirty = true;
    }
    thumbFor (item) {
        const costume = item.costume;
        const key = `${costume.assetId}`;
        if (!this.thumbs.has(key)) {
            let uri = '';
            try {
                uri = costume.asset ? costume.asset.encodeDataURI() : '';
            } catch (e) {
                uri = '';
            }
            this.thumbs.set(key, uri);
        }
        return this.thumbs.get(key);
    }
    renderTools () {
        const {intl, tool} = this.props;
        return (
            <div className={styles.group}>
                {TOOLS.map(name => (
                    <button
                        aria-keyshortcuts={KEY_OF[name].toUpperCase()}
                        aria-pressed={tool === name}
                        className={classNames(styles.button, {[styles.pressed]: tool === name})}
                        data-tool={name}
                        key={name}
                        title={`${intl.formatMessage(messages[name])} (${KEY_OF[name].toUpperCase()})`}
                        onClick={this.handleTool}
                    >
                        {intl.formatMessage(messages[name])}
                    </button>
                ))}
            </div>
        );
    }
    renderLayers () {
        const {intl, layer, tool} = this.props;
        if (tool === 'flag') {
            return (
                <label className={styles.group}>
                    <span className={styles.label}>{intl.formatMessage(messages.flagKind)}</span>
                    <select
                        className={styles.select}
                        value={this.props.flag}
                        onChange={this.handleFlag}
                    >
                        {FLAG_NAMES.map(name => (
                            <option
                                key={name}
                                value={name}
                            >{intl.formatMessage(messages[name])}</option>
                        ))}
                    </select>
                </label>
            );
        }
        return (
            <div
                aria-label={intl.formatMessage(messages.layer)}
                className={styles.group}
                role="group"
            >
                {PAINT_LAYERS.map(name => (
                    <button
                        aria-pressed={layer === name}
                        className={classNames(styles.button, {[styles.pressed]: layer === name})}
                        data-layer={name}
                        key={name}
                        onClick={this.handleLayer}
                    >
                        {intl.formatMessage(messages[name])}
                    </button>
                ))}
            </div>
        );
    }
    renderPalette () {
        const {intl, tile} = this.props;
        const grid = this.grid();
        const current = grid && grid.tiles[tile - 1] ? grid.tiles[tile - 1].name.toLowerCase() : '';
        if (!this.state.palette.length) return <p className={styles.note}>{intl.formatMessage(messages.noTiles)}</p>;
        return (
            <div
                aria-label={intl.formatMessage(messages.tiles)}
                className={styles.palette}
                role="group"
            >
                {this.state.palette.map(item => {
                    const selected = String(item.name).toLowerCase() === current;
                    const thumb = this.thumbFor(item);
                    return (
                        <button
                            aria-label={item.name}
                            aria-pressed={selected}
                            className={classNames(styles.swatch, {[styles.pressed]: selected})}
                            data-name={item.name}
                            key={`${item.costume.assetId}:${item.name}`}
                            title={item.name}
                            onClick={this.handleTile}
                        >
                            {thumb ? (
                                <img
                                    alt=""
                                    className={styles.swatchImage}
                                    draggable={false}
                                    src={thumb}
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        );
    }
    render () {
        const {intl, open, showGrid} = this.props;
        if (!open || !this.state.rect) return null;
        const rect = this.state.rect;
        const grid = this.grid();
        return (
            <div
                className={styles.root}
                onKeyDown={this.handleKeyDown}
                onKeyUp={this.handleKeyUp}
            >
                <canvas
                    aria-describedby={HELP_ID}
                    aria-label={intl.formatMessage(messages.canvas)}
                    className={classNames(styles.overlay, {[styles.inactive]: !grid})}
                    ref={this.setCanvas}
                    role="application"
                    style={{
                        left: `${rect.left}px`,
                        top: `${rect.top}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`
                    }}
                    tabIndex={grid ? 0 : -1}
                    onBlur={this.handleBlur}
                    onPointerDown={this.handlePointerDown}
                    onPointerLeave={this.handlePointerLeave}
                    onPointerMove={this.handlePointerMove}
                    onPointerUp={this.handlePointerUp}
                />
                <div
                    aria-label={intl.formatMessage(messages.toolbar)}
                    className={styles.toolbar}
                    role="toolbar"
                    style={{
                        left: `${Math.max(8, rect.left)}px`,
                        top: `${rect.top + rect.height + 8}px`,
                        width: `${Math.max(320, rect.width)}px`
                    }}
                >
                    {grid ? (
                        <React.Fragment>
                            <div className={styles.row}>
                                {this.renderTools()}
                            </div>
                            <div className={styles.row}>
                                {this.renderLayers()}
                                <div className={styles.group}>
                                    <button
                                        className={styles.button}
                                        disabled={!this.painter.canUndo()}
                                        onClick={this.handleUndo}
                                    >{intl.formatMessage(messages.undo)}</button>
                                    <button
                                        className={styles.button}
                                        disabled={!this.painter.canRedo()}
                                        onClick={this.handleRedo}
                                    >{intl.formatMessage(messages.redo)}</button>
                                    <button
                                        aria-pressed={showGrid}
                                        className={classNames(styles.button, {[styles.pressed]: showGrid})}
                                        onClick={this.handleToggleGrid}
                                    >{intl.formatMessage(messages.grid)}</button>
                                </div>
                            </div>
                            {this.props.tool === 'flag' ? null : this.renderPalette()}
                        </React.Fragment>
                    ) : <p className={styles.note}>{intl.formatMessage(messages.noLevel)}</p>}
                    <div className={styles.row}>
                        <p
                            className={styles.help}
                            id={HELP_ID}
                        >{intl.formatMessage(messages.help)}</p>
                        <button
                            className={classNames(styles.button, styles.done)}
                            onClick={this.handleClose}
                        >{intl.formatMessage(messages.done)}</button>
                    </div>
                </div>
                <div
                    aria-live="polite"
                    className={styles.hidden}
                >{this.state.announce}</div>
            </div>
        );
    }
}

TilePainter.propTypes = {
    canvas: PropTypes.shape({getBoundingClientRect: PropTypes.func}),
    flag: PropTypes.oneOf(FLAG_NAMES).isRequired,
    intl: intlShape.isRequired,
    layer: PropTypes.oneOf(PAINT_LAYERS).isRequired,
    onClose: PropTypes.func.isRequired,
    onFlag: PropTypes.func.isRequired,
    onGrid: PropTypes.func.isRequired,
    onLayer: PropTypes.func.isRequired,
    onTile: PropTypes.func.isRequired,
    onTool: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired,
    runtime: PropTypes.shape({
        getEditingTarget: PropTypes.func,
        on: PropTypes.func,
        removeListener: PropTypes.func,
        renderer: PropTypes.shape({canvas: PropTypes.shape({getBoundingClientRect: PropTypes.func})})
    }).isRequired,
    showGrid: PropTypes.bool.isRequired,
    tile: PropTypes.number.isRequired,
    tool: PropTypes.oneOf(TOOLS).isRequired,
    win: PropTypes.shape({
        cancelAnimationFrame: PropTypes.func,
        devicePixelRatio: PropTypes.number,
        requestAnimationFrame: PropTypes.func
    }).isRequired,
    world: PropTypes.shape({
        addTile: PropTypes.func,
        camera: PropTypes.shape({setBounds: PropTypes.func}),
        events: PropTypes.shape({on: PropTypes.func}),
        view: PropTypes.func
    }).isRequired
};

const mapStateToProps = state => {
    const ui = state.scratchGui.worldUi;
    return {
        open: ui.painterOpen,
        tool: ui.tool,
        tile: ui.tile,
        layer: ui.layer,
        flag: ui.flag,
        showGrid: ui.showGrid
    };
};

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(setPainterOpen(false)),
    onFlag: flag => dispatch(setPainterFlag(flag)),
    onGrid: show => dispatch(setPainterGrid(show)),
    onLayer: layer => dispatch(setPainterLayer(layer)),
    onTile: tile => dispatch(setPainterTile(tile)),
    onTool: tool => dispatch(setPainterTool(tool))
});

export {TilePainter as PlainTilePainter};
export default connect(mapStateToProps, mapDispatchToProps)(injectIntl(TilePainter));

import paper from '@turbowarp/paper';
import LazyScratchBlocks from '../tw-lazy-scratch-blocks';
import {activateTab} from '../../reducers/editor-tab';
import client from './client';
import {
    DRAG_MOVE_EVERY_MS,
    FIELD_TTL_MS,
    TABS,
    VIEWPORT_EVERY_MS,
    createFields,
    createFollow,
    createGate,
    createLocks,
    createStyleBook,
    initials
} from './presence.js';
import {bubbleFrame, createPhraseLimiter} from './quick-phrases.js';
import {
    bubbleElement,
    cursorElement,
    followPill,
    liveRegion,
    phraseLabel,
    ringElement,
    say,
    shapeSvg
} from './presence-dom.js';

const BUBBLE_MS = 3200;
const NOTICE_EVERY_MS = 1200;

const editorStore = () => {
    try {
        return window.ReduxStore || null;
    } catch (e) {
        return null;
    }
};

const editorVm = () => {
    const store = editorStore();
    const gui = store && store.getState().scratchGui;
    return gui && gui.vm ? gui.vm : null;
};

const activeTab = () => {
    const store = editorStore();
    const gui = store && store.getState().scratchGui;
    const index = gui && gui.editorTab ? gui.editorTab.activeTabIndex : 0;
    return TABS[index] || 'code';
};

const scratchBlocks = () => (LazyScratchBlocks.isLoaded() ? LazyScratchBlocks.get() : null);

const blockSvg = (workspace, blockId) => {
    try {
        const block = workspace && workspace.getBlockById(blockId);
        return block && block.getSvgRoot ? block.getSvgRoot() : null;
    } catch (e) {
        return null;
    }
};

class Overlay {
    constructor () {
        this.peers = new Map();
        this.self = null;
        this.selfId = null;
        this.connected = false;
        this.projects = [];
        this.cursorLayer = null;
        this.getWorkspace = () => null;
        this.localSpriteName = () => null;
        this._raf = null;
        this._subscribers = new Set();
        this.styles = createStyleBook();
        this.locks = createLocks();
        this.fields = createFields();
        this.follower = createFollow();
        this.phraseLimit = createPhraseLimiter();
        this._bookRoom = null;
        this._viewGate = createGate(VIEWPORT_EVERY_MS);
        this._dragGate = createGate(DRAG_MOVE_EVERY_MS);
        this._fieldGate = createGate(FIELD_TTL_MS / 2);
        this._noticeGate = createGate(NOTICE_EVERY_MS);
        this._local = {drag: null, field: null, view: null};
        this._rings = new Map();
        this._wired = false;
        this.follower.subscribe(() => {
            this._renderFollowPill();
            this._notify();
        });
    }

    subscribe (cb) {
        this._subscribers.add(cb);
        return () => this._subscribers.delete(cb);
    }

    getState () {
        return {
            self: this.self,
            selfStyle: this.selfId === null ? null : this.styles.get(this.selfId),
            connected: this.connected,
            projects: this.projects,
            following: this.follower.following,
            peers: [...this.peers.entries()].map(([id, p]) => ({
                id,
                name: p.name,
                color: p.color,
                status: p.status,
                sprite: p.sprite,
                tab: p.tab,
                role: p.role || null,
                style: this.styles.get(id),
                initials: initials(p.name),
                following: this.follower.following === id,
                userId: p.userId,
                handle: p.handle
            }))
        };
    }

    setProjects (projects) {
        this.projects = projects || [];
        this._notify();
    }

    _notify () {
        for (const cb of this._subscribers) {
            try {
                cb();
            } catch (e) {
                console.error('[collab] presence view error', e);
            }
        }
    }

    mount () {
        if (this.cursorLayer) return;
        this.cursorLayer = document.createElement('div');
        this.cursorLayer.setAttribute('data-sq-presence', '');
        this.cursorLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:450;overflow:hidden';
        document.body.appendChild(this.cursorLayer);

        const loop = () => {
            this._updateCursors();
            this._updateRings();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
        setInterval(() => this._updateSpriteBadges(), 700);
        setInterval(() => this._pollLocal(), 100);
        this._wire();
        this.exposeFollow();
        import('../../components/presence-bar/mount.jsx')
            .then(mod => mod.installPresenceBar({overlay: this}))
            .catch(e => console.error('[collab] presence bar', e));
    }

    _wire () {
        if (this._wired) return;
        this._wired = true;
        client.on('drag', msg => this.receiveDrag(msg));
        client.on('field', msg => this.receiveField(msg));
        client.on('viewport', msg => this.receiveViewport(msg));
        client.on('phrase', msg => this.receivePhrase(msg));
        client.on('disconnected', () => {
            this.locks.clear();
            this.fields.clear();
            this._local.drag = null;
            this._local.field = null;
        });
        const stopOnInput = kind => evt => {
            if (this.follower.following === null) return;
            if (evt && evt.isTrusted === false) return;
            if (kind === 'key' && evt.key === 'Escape') this.follower.input('escape');
            else if (kind !== 'key' || !evt.repeat) this.follower.input(kind);
        };
        document.addEventListener('keydown', stopOnInput('key'), true);
        document.addEventListener('pointerdown', stopOnInput('pointer'), true);
        document.addEventListener('wheel', stopOnInput('wheel'), {capture: true, passive: true});
        const guard = evt => this._guardPointer(evt);
        document.addEventListener('mousedown', guard, true);
        document.addEventListener('touchstart', guard, {capture: true, passive: false});
        window.addEventListener('SquiggleNetReady', () => this.exposeFollow());
    }

    exposeFollow () {
        const bridge = typeof window === 'undefined' ? null : window.SquiggleNet;
        if (!bridge || !Object.isExtensible(bridge) || bridge.follow === this._followByName) return false;
        if (!this._followByName) {
            this._followByName = name => {
                for (const [id, p] of this.peers) {
                    if (p.name === name) return this.startFollowing(id);
                }
                return false;
            };
        }
        bridge.follow = this._followByName;
        return true;
    }

    startFollowing (id) {
        const ok = this.follower.start(id, peer => this.peers.has(peer));
        if (ok) {
            const p = this.peers.get(id);
            if (p && p.view) this._applyView(p.view);
            else if (p && p.sprite) {
                const tab = TABS.indexOf(p.tab) === -1 ? 'code' : p.tab;
                this._applyView({targetId: p.sprite, tab, x: null, y: null});
            }
        }
        return ok;
    }

    stopFollowing () {
        return this.follower.stop('button');
    }

    _send (frame) {
        if (!client.connected || !this.peers.size) return false;
        return client.send(frame) !== false;
    }

    _updateSpriteBadges () {
        if (document.hidden) return;
        const nameEls = document.querySelectorAll('[class*="sprite-selector-item_sprite-name"]');
        if (!nameEls.length && !this._badges) return;
        const tileByName = new Map();
        for (const el of nameEls) {
            const tile = el.closest('[class*="sprite-selector-item_sprite-selector-item"]');
            if (tile) tileByName.set(el.textContent, tile);
        }
        this._badges = this._badges || new Map();
        const offsets = new Map();
        for (const [id, p] of this.peers) {
            const tile = p.sprite ? tileByName.get(p.sprite) : null;
            let badge = this._badges.get(id);
            if (!tile) {
                if (badge) {
                    badge.remove();
                    this._badges.delete(id);
                }
                continue;
            }
            const style = this.styles.get(id) || this.styles.assign(id);
            const stale = !badge || !badge.isConnected || badge.parentElement !== tile;
            if (stale || badge.dataset.slot !== String(style.slot)) {
                if (badge) badge.remove();
                badge = document.createElement('div');
                badge.dataset.slot = String(style.slot);
                badge.appendChild(shapeSvg(style, 14));
                this._badges.set(id, badge);
                tile.appendChild(badge);
            }
            const slot = offsets.get(tile) || 0;
            offsets.set(tile, slot + 1);
            badge.style.cssText = [
                'position:absolute', 'top:-5px', `right:${-5 + (slot * 15)}px`, 'width:14px', 'height:14px',
                'filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))', 'z-index:5', 'pointer-events:none'
            ].join(';');
            badge.title = say('here', {name: p.name});
        }
        for (const [id, badge] of this._badges) {
            if (!this.peers.has(id)) {
                badge.remove();
                this._badges.delete(id);
            }
        }
    }

    setSelf (name, color, room, extra) {
        this.self = Object.assign({name, color, room}, extra || {});
        this._notify();
    }

    setConnected (connected) {
        this.connected = connected;
        if (!connected) this.follower.stop('offline');
        this._notify();
    }

    _peerRecord (name, color, style, account) {
        return {
            name,
            color,
            style: style || 'arrow',
            status: 'here',
            sprite: null,
            tab: null,
            view: null,
            cursor: null,
            role: account && typeof account.role === 'string' ? account.role : null,
            userId: account && typeof account.userId === 'number' ? account.userId : null,
            handle: account && typeof account.handle === 'string' ? account.handle : null
        };
    }

    addPeer (id, name, color, style, account) {
        this.styles.assign(id);
        this.peers.set(id, this._peerRecord(name, color, style, account));
        this._notify();
    }

    removePeer (id) {
        const p = this.peers.get(id);
        if (p && p._cursorEl) p._cursorEl.remove();
        this.peers.delete(id);
        this.styles.release(id);
        this.locks.release(id);
        this.fields.release(id);
        this.phraseLimit.forget(`in:${id}`);
        this.follower.peerLeft(id);
        this._notify();
    }

    setPeers (list, selfId) {
        const room = this.self ? this.self.room : null;
        if (room !== this._bookRoom) {
            this.styles.reset();
            this._bookRoom = room;
        }
        for (const p of this.peers.values()) {
            if (p._cursorEl) p._cursorEl.remove();
        }
        const keep = new Set(list.map(p => p.id).concat([selfId]));
        for (const id of this.peers.keys()) {
            if (!keep.has(id)) this.styles.release(id);
        }
        if (this.selfId !== null && this.selfId !== selfId) this.styles.release(this.selfId);
        this.peers.clear();
        this.locks.clear();
        this.fields.clear();
        this.selfId = selfId;
        let selfSeen = false;
        list.forEach(p => {
            this.styles.assign(p.id);
            if (p.id === selfId) {
                selfSeen = true;
                return;
            }
            this.peers.set(p.id, this._peerRecord(p.name, p.color, p.cursor, p));
        });
        if (!selfSeen) this.styles.assign(selfId);
        if (this.follower.following !== null && !this.peers.has(this.follower.following)) this.follower.stop('left');
        this._notify();
    }

    updatePeerAppearance (id, {color, style, role}) {
        const p = this.peers.get(id);
        if (!p) return;
        if (color) p.color = color;
        if (style) p.style = style;
        if (role) p.role = role;
        if (p._cursorEl) {
            p._cursorEl.remove();
            p._cursorEl = null;
        }
        this._notify();
    }

    setPeerPresence (id, {status, sprite, tab}) {
        const p = this.peers.get(id);
        if (!p) return;
        if (typeof status !== 'undefined') p.status = status;
        if (typeof sprite !== 'undefined') p.sprite = sprite;
        if (TABS.indexOf(tab) !== -1) p.tab = tab;
        this._notify();
    }

    setPeerCursor (id, cursor) {
        const p = this.peers.get(id);
        if (p) p.cursor = cursor;
    }

    receiveDrag (msg) {
        if (!msg || msg.from === this.selfId || !this.peers.has(msg.from)) return;
        this.locks.apply(msg.from, msg);
    }

    receiveField (msg) {
        if (!msg || msg.from === this.selfId || !this.peers.has(msg.from)) return;
        this.fields.apply(msg.from, msg);
    }

    receiveViewport (msg) {
        if (!msg || msg.from === this.selfId) return;
        const p = this.peers.get(msg.from);
        if (!p) return;
        const view = this.follower.viewport(msg.from, msg);
        p.view = view || {
            targetId: typeof msg.targetId === 'string' ? msg.targetId : null,
            tab: TABS.indexOf(msg.tab) === -1 ? 'code' : msg.tab,
            x: msg.x,
            y: msg.y,
            zoom: msg.zoom
        };
        if (p.tab !== p.view.tab) {
            p.tab = p.view.tab;
            this._notify();
        }
        if (view) this._applyView(view);
    }

    receivePhrase (msg) {
        if (!msg || msg.from === this.selfId) return;
        const p = this.peers.get(msg.from);
        const text = phraseLabel(msg.id);
        if (!p || !text || !this.phraseLimit.allow(`in:${msg.from}`)) return;
        this._showBubble(msg.from, p, text, msg);
    }

    sendPhrase (id, place) {
        const frame = bubbleFrame(id, place || this._phrasePlace());
        if (!frame || !client.connected) return false;
        if (!this.phraseLimit.allow('self')) return false;
        return client.send(frame) !== false;
    }

    phraseWaitMs () {
        return this.phraseLimit.waitMs('self');
    }

    _phrasePlace () {
        const sprite = this.localSpriteName();
        return sprite ? {targetId: String(sprite).slice(0, 64)} : null;
    }

    _localTarget () {
        const sprite = this.localSpriteName();
        return sprite ? String(sprite).slice(0, 64) : null;
    }

    _pollLocal () {
        if (!this.cursorLayer || !this.peers.size || !client.connected) {
            this._local.drag = null;
            this._local.field = null;
            return;
        }
        const workspace = this.getWorkspace();
        const targetId = this._localTarget();
        this._pollDrag(workspace, targetId);
        this._pollField(scratchBlocks(), targetId);
        this._pollView(workspace, targetId);
    }

    _pollDrag (workspace, targetId) {
        let blockId = null;
        try {
            const gesture = workspace && workspace.currentGesture_;
            const dragger = gesture && gesture.isDraggingBlock_ ? gesture.blockDragger_ : null;
            if (dragger && dragger.draggingBlock_) blockId = dragger.draggingBlock_.id;
        } catch (e) {
            blockId = null;
        }
        const held = this._local.drag;
        if (held && (held.blockId !== blockId || held.targetId !== targetId)) {
            this._send({type: 'drag', targetId: held.targetId, blockId: held.blockId, phase: 'end'});
            this._local.drag = null;
        }
        if (!blockId || !targetId || (this.self && this.self.canEdit === false)) return;
        if (!this._local.drag) {
            this._local.drag = {targetId, blockId};
            this._dragGate.reset();
            this._dragGate.ready();
            this._send({type: 'drag', targetId, blockId, phase: 'start'});
        } else if (this._dragGate.ready()) {
            this._send({type: 'drag', targetId, blockId, phase: 'move'});
        }
    }

    _pollField (blocks, targetId) {
        let blockId = null;
        try {
            const widget = blocks && blocks.WidgetDiv;
            const owner = widget && widget.isVisible() ? widget.owner_ : null;
            const block = owner && owner.sourceBlock_;
            if (block && !block.isInFlyout && blocks.FieldTextInput && owner instanceof blocks.FieldTextInput) {
                blockId = block.id;
            }
        } catch (e) {
            blockId = null;
        }
        const held = this._local.field;
        if (held && (held.blockId !== blockId || held.targetId !== targetId)) {
            this._send({type: 'field', targetId: held.targetId, blockId: held.blockId, on: false});
            this._local.field = null;
        }
        if (!blockId || !targetId) return;
        if (!this._local.field) {
            this._local.field = {targetId, blockId};
            this._fieldGate.reset();
            this._fieldGate.ready();
            this._send({type: 'field', targetId, blockId, on: true});
        } else if (this._fieldGate.ready()) {
            this._send({type: 'field', targetId, blockId, on: true});
        }
    }

    _pollView (workspace, targetId) {
        if (!workspace || !targetId || !this._viewGate.ready()) return;
        let view = null;
        try {
            const metrics = workspace.getMetrics();
            const scale = workspace.scale;
            if (metrics && scale > 0 && metrics.viewWidth > 10) {
                view = {
                    targetId,
                    tab: activeTab(),
                    x: Math.round((metrics.viewLeft + (metrics.viewWidth / 2)) / scale),
                    y: Math.round((metrics.viewTop + (metrics.viewHeight / 2)) / scale),
                    zoom: Math.round(scale * 100) / 100
                };
            }
        } catch (e) {
            view = null;
        }
        const last = this._local.view;
        if (!view || (last && last.targetId === view.targetId && last.tab === view.tab &&
            last.x === view.x && last.y === view.y && last.zoom === view.zoom)) return;
        this._local.view = view;
        this._send(Object.assign({type: 'viewport'}, view));
    }

    _applyView (view) {
        const vm = editorVm();
        const store = editorStore();
        if (!vm || !view || !view.targetId) return;
        const target = vm.runtime.targets.find(t => t.isOriginal && t.getName() === view.targetId);
        if (!target) return;
        const switched = vm.editingTarget !== target;
        if (switched) vm.setEditingTarget(target.id);
        const index = TABS.indexOf(view.tab);
        const gui = store && store.getState().scratchGui;
        if (gui && index !== -1 && gui.editorTab.activeTabIndex !== index) store.dispatch(activateTab(index));
        if (view.tab !== 'code' || view.x === null || view.y === null) return;
        clearTimeout(this._viewTimer);
        this._viewTimer = setTimeout(() => this._scrollTo(view), switched ? 250 : 0);
    }

    _scrollTo (view) {
        if (this.follower.following === null) return;
        const workspace = this.getWorkspace();
        if (!workspace || !workspace.scrollbar) return;
        try {
            if (view.zoom && Math.abs(workspace.scale - view.zoom) > 0.01) workspace.setScale(view.zoom);
            const metrics = workspace.getMetrics();
            const scale = workspace.scale;
            workspace.scrollbar.set(
                (view.x * scale) - metrics.contentLeft - (metrics.viewWidth / 2),
                (view.y * scale) - metrics.contentTop - (metrics.viewHeight / 2)
            );
        } catch (e) {
            this._viewTimer = null;
        }
    }

    _guardPointer (evt) {
        if (!evt || evt.isTrusted === false) return;
        const workspace = this.getWorkspace();
        if (!workspace || !evt.target) return;
        const targetId = this._localTarget();
        for (const lock of this.locks.list()) {
            if (lock.targetId && lock.targetId !== targetId) continue;
            const svg = blockSvg(workspace, lock.blockId);
            if (svg && svg.contains(evt.target)) {
                evt.preventDefault();
                evt.stopPropagation();
                if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
                this._peerNotice('moving', lock.peer);
                return;
            }
        }
        for (const entry of this.fields.list()) {
            if (entry.targetId && entry.targetId !== targetId) continue;
            const svg = blockSvg(workspace, entry.blockId);
            if (svg && svg.contains(evt.target)) {
                this._peerNotice('editing', entry.peer);
                return;
            }
        }
    }

    _peerNotice (key, peer) {
        const p = this.peers.get(peer);
        const style = this.styles.get(peer);
        if (p && this._noticeGate.ready()) this.toast(say(key, {name: p.name}), style ? style.hex : null);
    }

    _updateRings () {
        if (!this.cursorLayer || document.hidden) return;
        const locks = this.locks.list();
        const fields = this.fields.list();
        if (!locks.length && !fields.length && !this._rings.size) return;
        const workspace = this.getWorkspace();
        const targetId = this._localTarget();
        const wanted = new Map();
        for (const lock of locks) wanted.set(`d:${lock.peer}`, {kind: 'moving', entry: lock});
        for (const entry of fields) {
            if (!wanted.has(`d:${entry.peer}`)) wanted.set(`f:${entry.peer}`, {kind: 'typing', entry});
        }
        let bounds = null;
        try {
            bounds = workspace ? workspace.getParentSvg().getBoundingClientRect() : null;
        } catch (e) {
            bounds = null;
        }
        for (const [key, want] of wanted) {
            const entry = want.entry;
            const p = this.peers.get(entry.peer);
            const style = this.styles.get(entry.peer);
            let rect = null;
            if (p && style && bounds && bounds.width > 10 && (!entry.targetId || entry.targetId === targetId)) {
                const svg = blockSvg(workspace, entry.blockId);
                const r = svg ? svg.getBoundingClientRect() : null;
                if (r && r.width && r.right > bounds.left && r.left < bounds.right &&
                    r.bottom > bounds.top && r.top < bounds.bottom) rect = r;
            }
            let el = this._rings.get(key);
            if (!rect) {
                if (el) el.remove();
                this._rings.delete(key);
                continue;
            }
            if (!el || el.dataset.slot !== String(style.slot)) {
                if (el) el.remove();
                el = ringElement(want.kind, p.name, style);
                this.cursorLayer.appendChild(el);
                this._rings.set(key, el);
            }
            el.style.transform = `translate(${Math.round(rect.left - 5)}px, ${Math.round(rect.top - 5)}px)`;
            el.style.width = `${Math.round(rect.width + 10)}px`;
            el.style.height = `${Math.round(rect.height + 10)}px`;
        }
        for (const [key, el] of this._rings) {
            if (!wanted.has(key)) {
                el.remove();
                this._rings.delete(key);
            }
        }
    }

    _renderFollowPill () {
        if (typeof document === 'undefined') return;
        const id = this.follower.following;
        if (id === null) {
            if (this._followPill) this._followPill.remove();
            this._followPill = null;
            return;
        }
        const p = this.peers.get(id);
        if (this._followPill) this._followPill.remove();
        const pill = followPill({
            name: p ? p.name : '',
            style: this.styles.get(id),
            top: 12 + this._topInset(),
            onStop: () => this.stopFollowing()
        });
        document.body.appendChild(pill);
        this._followPill = pill;
    }

    _showBubble (from, p, text, msg) {
        const style = this.styles.get(from);
        if (!this.cursorLayer || !style) return;
        const pos = this._bubblePos(p, msg);
        this._announce(say('says', {name: p.name, text}));
        if (!pos) {
            this.toast(say('says', {name: p.name, text}), style.hex);
            return;
        }
        const bubble = bubbleElement({name: p.name, text, style, x: pos.x, y: pos.y});
        this.cursorLayer.appendChild(bubble);
        requestAnimationFrame(() => (bubble.style.opacity = '1'));
        setTimeout(() => {
            bubble.style.opacity = '0';
            setTimeout(() => bubble.remove(), 250);
        }, BUBBLE_MS);
    }

    _bubblePos (p, msg) {
        const workspace = this.getWorkspace();
        const targetId = this._localTarget();
        const sameTarget = !msg.targetId || msg.targetId === targetId;
        if (workspace && sameTarget && typeof msg.blockId === 'string') {
            const svg = blockSvg(workspace, msg.blockId);
            const r = svg ? svg.getBoundingClientRect() : null;
            if (r && r.width) return {x: r.left, y: Math.max(8, r.top - 40)};
        }
        if (workspace && sameTarget && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
            try {
                const ctm = workspace.getCanvas().getScreenCTM();
                const pt = new DOMPoint(msg.x, msg.y).matrixTransform(ctm);
                return {x: pt.x, y: pt.y - 40};
            } catch (e) {
                return null;
            }
        }
        if (p._cursorEl && p._cursorEl._stVisible && typeof p._cx === 'number') return {x: p._cx + 16, y: p._cy - 36};
        return null;
    }

    _announce (text) {
        if (!this.cursorLayer) return;
        if (!this._live) {
            this._live = liveRegion();
            this.cursorLayer.appendChild(this._live);
        }
        this._live.textContent = text;
    }

    _updateCursors () {
        if (!this.cursorLayer) return;
        if (document.hidden) return;

        let anyCursor = false;
        for (const p of this.peers.values()) {
            if (p.cursor) {
                anyCursor = true;
                break;
            }
        }
        if (!anyCursor && !this._cursorCount) return;

        const workspace = this.getWorkspace();
        const localSprite = this.localSpriteName();

        let ctm = null;
        let svgRect = null;
        if (workspace) {
            try {
                const svg = workspace.getParentSvg();
                svgRect = svg.getBoundingClientRect();
                if (svgRect.width > 10 && svgRect.height > 10) {
                    ctm = workspace.getCanvas().getScreenCTM();
                }
            } catch (e) {
                ctm = null;
            }
        }

        const seen = new Set();
        for (const [id, p] of this.peers) {
            seen.add(id);
            const el = this._cursorEl(id, p);
            let visible = false;
            let tx = 0;
            let ty = 0;
            if (p.cursor && p.cursor.space === 'paint') {
                const pos = this._paintCursorPos(p.cursor, localSprite);
                if (pos) {
                    visible = true;
                    tx = pos.x;
                    ty = pos.y;
                }
            } else if (ctm && p.cursor && p.cursor.sprite === localSprite) {
                const pt = new DOMPoint(p.cursor.x, p.cursor.y).matrixTransform(ctm);
                if (pt.x >= svgRect.left && pt.x <= svgRect.right &&
                    pt.y >= svgRect.top && pt.y <= svgRect.bottom) {
                    visible = true;
                    tx = pt.x;
                    ty = pt.y;
                }
            }
            if (visible) {
                if (!el._stVisible || typeof p._cx === 'undefined') {
                    p._cx = tx;
                    p._cy = ty;
                } else {
                    p._cx += (tx - p._cx) * 0.35;
                    p._cy += (ty - p._cy) * 0.35;
                    if (Math.abs(tx - p._cx) < 0.5) p._cx = tx;
                    if (Math.abs(ty - p._cy) < 0.5) p._cy = ty;
                }
                el.style.transform = `translate(${p._cx}px, ${p._cy}px)`;
            }
            if (el._stVisible !== visible) {
                el._stVisible = visible;
                el.style.display = visible ? 'block' : 'none';
            }
        }
        let count = 0;
        for (const el of [...this.cursorLayer.querySelectorAll('[data-peer]')]) {
            const id = Number(el.dataset.peer);
            if (seen.has(id)) count++;
            else el.remove();
        }
        this._cursorCount = count;
    }

    _paintCursorPos (cursor, localSprite) {
        if (cursor.sprite !== localSprite) return null;
        try {
            if (!paper.view || !paper.view.element) return null;
            const rect = paper.view.element.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return null;
            const pt = paper.view.projectToView(new paper.Point(cursor.x, cursor.y));
            const x = rect.left + pt.x;
            const y = rect.top + pt.y;
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
            return {x, y};
        } catch (e) {
            return null;
        }
    }

    _cursorEl (id, p) {
        if (p._cursorEl && p._cursorEl.isConnected) return p._cursorEl;
        const old = this.cursorLayer.querySelector(`[data-peer="${Number(id)}"]`);
        if (old) old.remove();
        const el = cursorElement(id, p.style, p.name, this.styles.get(id) || this.styles.assign(id));
        this.cursorLayer.appendChild(el);
        p._cursorEl = el;
        return el;
    }

    banner (text, opts = {}) {
        if (this._banner) {
            this._banner.remove();
            this._banner = null;
        }
        if (!text) {
            this._offsetApp(0);
            return;
        }
        const bar = document.createElement('div');
        bar.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'display:flex', 'align-items:center', 'justify-content:center', 'gap:12px',
            `background:${opts.kind === 'busy' ? '#2f7fe0' : '#6f4bd8'}`,
            'color:#fff', 'padding:calc(8px + env(safe-area-inset-top, 0px)) 16px 8px',
            'font:600 13px ui-rounded,"Segoe UI",Helvetica,Arial,sans-serif',
            'box-shadow:0 2px 12px rgba(0,0,0,.35)'
        ].join(';');
        bar.appendChild(document.createTextNode(text));
        if (opts.actionLabel && opts.onAction) {
            const btn = document.createElement('button');
            btn.textContent = opts.actionLabel;
            btn.style.cssText = [
                'background:#fff', 'color:#241a4a', 'border:0', 'border-radius:8px',
                'padding:4px 12px', 'font:700 12px inherit', 'cursor:pointer'
            ].join(';');
            btn.addEventListener('click', opts.onAction);
            bar.appendChild(btn);
        }
        document.body.appendChild(bar);
        this._banner = bar;
        this._offsetApp(bar.offsetHeight);

        if (typeof ResizeObserver === 'function') {
            this._bannerRO = this._bannerRO || new ResizeObserver(() => {
                if (this._banner) this._offsetApp(this._banner.offsetHeight);
            });
            this._bannerRO.disconnect();
            this._bannerRO.observe(bar);
        }
    }

    _offsetApp (height) {
        const root = document.getElementById('app');
        if (!root || (!height && !this._appOffset)) return;
        if (!this._appOffset) {
            this._appOffset = {style: root.getAttribute('style')};
        }
        if (!height) {
            if (this._appOffset.style === null) root.removeAttribute('style');
            else root.setAttribute('style', this._appOffset.style);
            this._appOffset = null;
            if (this._bannerRO) this._bannerRO.disconnect();
            window.dispatchEvent(new Event('resize'));
            return;
        }
        root.style.position = 'fixed';
        root.style.top = `${height}px`;
        root.style.left = '0';
        root.style.right = '0';
        root.style.bottom = '0';
        window.dispatchEvent(new Event('resize'));
    }

    _topInset () {
        return this._banner ? this._banner.offsetHeight : 0;
    }


    toast (text, color) {
        const t = document.createElement('div');
        const dot = document.createElement('span');
        dot.style.cssText = [
            'width:9px', 'height:9px', 'border-radius:50%', 'flex:0 0 auto',
            `background:${color || '#7c5cff'}`
        ].join(';');
        t.appendChild(dot);
        t.appendChild(document.createTextNode(text));
        t.style.cssText = [
            'position:fixed', `top:calc(${60 + this._topInset()}px + env(safe-area-inset-top, 0px))`,
            'pointer-events:none',
            'left:50%', 'transform:translateX(-50%)', 'z-index:99998',
            'display:flex', 'align-items:center', 'gap:9px',
            'box-sizing:border-box', 'max-width:calc(100vw - 32px)', 'width:max-content',
            'background:#161c36', 'color:#f2f4fb', 'padding:10px 18px', 'border-radius:14px',
            'border:1px solid rgba(255,255,255,.11)',
            'font:600 13.5px ui-rounded,"Segoe UI",Helvetica,Arial,sans-serif',
            'box-shadow:0 18px 50px -12px rgba(0,0,0,.7)',
            'opacity:0', 'transition:opacity .25s'
        ].join(';');
        document.body.appendChild(t);
        requestAnimationFrame(() => (t.style.opacity = '1'));
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        }, 2600);
    }

}

export default new Overlay();

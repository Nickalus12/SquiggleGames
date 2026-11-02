const SVG_NS = 'http://www.w3.org/2000/svg';

const CONNECTION_INPUT_VALUE = 1;
const CONNECTION_OUTPUT_VALUE = 2;
const CONNECTION_NEXT_STATEMENT = 3;
const CONNECTION_PREVIOUS_STATEMENT = 4;
const SHAPE_HEXAGONAL = 1;

const NOTCH_EDGE_PATH =
    'M -26,0 H -20 c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2 H 22';

const STATEMENT_INPUT_EDGE_PATH =
    'M -24,6 v -2 a 4,4 0 0,1 4,-4 c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2 H 24';

const computeJointGlowOpacity = (distance, snapRadius, options = {}) => {
    const outerMultiplier = typeof options.outerMultiplier === 'number' ? options.outerMultiplier : 2;
    if (!Number.isFinite(distance) || !Number.isFinite(snapRadius) || snapRadius <= 0 || distance < 0) {
        return 0;
    }
    const outerRadius = snapRadius * outerMultiplier;
    if (distance >= outerRadius) {
        return 0;
    }
    if (distance <= snapRadius) {
        return 1;
    }
    const t = (outerRadius - distance) / (outerRadius - snapRadius);
    if (options.reducedMotion) {
        return Number(t.toFixed(4));
    }
    const eased = t * (2 - t);
    return Number(eased.toFixed(4));
};

const getConnectionShape = conn => {
    if (!conn) return 0;
    if (typeof conn.getOutputShape === 'function') {
        return conn.getOutputShape();
    }
    if (typeof conn.outputShape_ === 'number') {
        return conn.outputShape_;
    }
    const block = conn.sourceBlock_;
    if (block && typeof block.getOutputShape === 'function') {
        return block.getOutputShape();
    }
    return 0;
};

const classifyJointConnectionKind = (localConnection, targetConnection) => {
    if (!targetConnection) return null;
    const targetType = targetConnection.type;
    const localType = localConnection ? localConnection.type : 0;

    if (targetType === CONNECTION_INPUT_VALUE || localType === CONNECTION_OUTPUT_VALUE) {
        const targetShape = getConnectionShape(targetConnection);
        const localShape = getConnectionShape(localConnection);
        if (targetShape === SHAPE_HEXAGONAL || localShape === SHAPE_HEXAGONAL) {
            return 'boolean';
        }
        return 'value-input';
    }

    if (targetType === CONNECTION_PREVIOUS_STATEMENT) {
        return 'previous';
    }

    if (targetType === CONNECTION_NEXT_STATEMENT) {
        const targetBlock = targetConnection.sourceBlock_;
        if (targetConnection.isStatementInput) {
            return 'statement-input';
        }
        if (targetBlock) {
            if (typeof targetBlock.getInputWithConnection === 'function' &&
                targetBlock.getInputWithConnection(targetConnection)) {
                return 'statement-input';
            }
            if (targetBlock.nextConnection && targetBlock.nextConnection !== targetConnection) {
                return 'statement-input';
            }
        }
        return 'next';
    }

    return null;
};

const buildJointEdgePath = (kind, role, metrics = {}) => {
    if (kind === 'next' || kind === 'previous') {
        return NOTCH_EDGE_PATH;
    }
    if (kind === 'statement-input') {
        return role === 'target' ? STATEMENT_INPUT_EDGE_PATH : NOTCH_EDGE_PATH;
    }
    if (kind === 'value-input') {
        if (role === 'target') {
            const h = Math.max(24, Number(metrics.height) || 32);
            const w = Math.max(h + 8, Number(metrics.width) || 48);
            const r = h / 2;
            const horiz = Math.max(8, w - (2 * r));
            return `M ${r},${-r} h ${horiz} a ${r},${r} 0 0 1 0,${h} h ${-horiz} a ${r},${r} 0 0 1 0,${-h} z`;
        }
        const h = Math.max(24, Number(metrics.height) || 40);
        const r = h / 2;
        return `M ${r + 8},${-r} H ${r} a ${r},${r} 0 0 0 0,${h} H ${r + 8}`;
    }
    if (kind === 'boolean') {
        if (role === 'target') {
            const h = Math.max(24, Number(metrics.height) || 32);
            const w = Math.max(h + 8, Number(metrics.width) || 48);
            const r = h / 2;
            const horiz = Math.max(8, w - (2 * r));
            return `M ${r},${-r} h ${horiz} l ${r},${r} l ${-r},${r} h ${-horiz} l ${-r},${-r} l ${r},${-r} z`;
        }
        const h = Math.max(24, Number(metrics.height) || 40);
        const r = h / 2;
        return `M ${r + 8},${-r} H ${r} l ${-r},${r} l ${r},${r} H ${r + 8}`;
    }
    return '';
};

const isReducedMotionPreferred = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};

const createGlowGroup = role => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `sq-joint-glow-group sq-joint-glow-${role}`);
    group.setAttribute('pointer-events', 'none');
    group.style.display = 'none';

    const halo = document.createElementNS(SVG_NS, 'path');
    halo.setAttribute('class', 'sq-joint-glow-halo');
    const core = document.createElementNS(SVG_NS, 'path');
    core.setAttribute('class', 'sq-joint-glow-core');

    group.appendChild(halo);
    group.appendChild(core);
    return {group, halo, core, lastPath: '', lastTransform: '', lastKind: '', lastSnapped: ''};
};

const getTargetSlotMetrics = targetConnection => {
    const targetBlock = targetConnection && typeof targetConnection.targetBlock === 'function' ?
        targetConnection.targetBlock() :
        null;
    if (targetBlock && targetBlock.width && targetBlock.height) {
        return {
            width: targetBlock.width,
            height: targetBlock.height,
            rtl: Boolean(targetBlock.RTL)
        };
    }
    const sourceBlock = targetConnection ? targetConnection.sourceBlock_ : null;
    if (sourceBlock && typeof sourceBlock.getInputWithConnection === 'function') {
        const input = sourceBlock.getInputWithConnection(targetConnection);
        if (input && input.renderWidth && input.renderHeight) {
            return {
                width: input.renderWidth,
                height: Math.max(32, input.renderHeight - 8),
                rtl: Boolean(sourceBlock.RTL)
            };
        }
    }
    return {width: 48, height: 32, rtl: Boolean(sourceBlock && sourceBlock.RTL)};
};

const getDragEdgeMetrics = localConnection => {
    const block = localConnection ? localConnection.sourceBlock_ : null;
    if (!block) return {width: 48, height: 40, rtl: false};
    return {
        width: block.width || 48,
        height: block.height || 40,
        rtl: Boolean(block.RTL)
    };
};

const findClosestForGlow = (manager, dxy, searchRadius) => {
    const available = manager.availableConnections_;
    if (!available || !available.length) {
        return {closest: null, local: null, radius: searchRadius};
    }
    let bestRadius = searchRadius;
    let bestClosest = null;
    let bestLocal = null;
    for (let i = 0; i < available.length; i++) {
        const myConn = available[i];
        if (!myConn || typeof myConn.closest !== 'function') continue;
        const neighbour = myConn.closest(bestRadius, dxy);
        if (neighbour && neighbour.connection) {
            bestClosest = neighbour.connection;
            bestLocal = myConn;
            bestRadius = neighbour.radius;
        }
    }
    return {
        closest: bestClosest,
        local: bestLocal,
        radius: bestRadius
    };
};

const ensureManagerGlowState = manager => {
    if (manager.sqJointGlow_) return manager.sqJointGlow_;
    if (typeof document === 'undefined') return null;
    const targetNode = createGlowGroup('target');
    const dragNode = createGlowGroup('drag');
    const canvas = manager.workspace_ && typeof manager.workspace_.getCanvas === 'function' ?
        manager.workspace_.getCanvas() :
        null;
    if (canvas) {
        canvas.appendChild(targetNode.group);
    }
    manager.sqJointGlow_ = {
        targetNode,
        dragNode,
        activeState: null
    };
    return manager.sqJointGlow_;
};

const hideManagerGlow = manager => {
    const state = manager && manager.sqJointGlow_;
    if (!state) return;
    state.targetNode.group.style.display = 'none';
    state.dragNode.group.style.display = 'none';
    state.activeState = null;
};

const disposeManagerGlow = manager => {
    const state = manager && manager.sqJointGlow_;
    if (!state) return;
    if (state.targetNode.group.parentNode) {
        state.targetNode.group.parentNode.removeChild(state.targetNode.group);
    }
    if (state.dragNode.group.parentNode) {
        state.dragNode.group.parentNode.removeChild(state.dragNode.group);
    }
    manager.sqJointGlow_ = null;
};

const updateNodeGeometry = (node, pathStr, tx, ty, kind, snapped, opacity, reducedMotion) => {
    if (node.lastPath !== pathStr) {
        node.halo.setAttribute('d', pathStr);
        node.core.setAttribute('d', pathStr);
        node.lastPath = pathStr;
    }
    const transformStr = `translate(${Number(tx.toFixed(2))}, ${Number(ty.toFixed(2))})`;
    if (node.lastTransform !== transformStr) {
        node.group.setAttribute('transform', transformStr);
        node.lastTransform = transformStr;
    }
    if (node.lastKind !== kind) {
        node.group.setAttribute('data-kind', kind);
        node.lastKind = kind;
    }
    const snappedStr = snapped ? 'true' : 'false';
    if (node.lastSnapped !== snappedStr) {
        node.group.setAttribute('data-snapped', snappedStr);
        node.lastSnapped = snappedStr;
    }
    node.group.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
    node.group.style.opacity = String(opacity);
    node.group.style.display = '';
};

const updateJointGlowForDrag = (manager, dxy, SB) => {
    if (!manager || !dxy || manager.wouldDeleteBlock_) {
        hideManagerGlow(manager);
        return;
    }
    const baseSnapRadius = typeof manager.getBaseSnapRadius_ === 'function' ?
        manager.getBaseSnapRadius_() :
        (SB.SNAP_RADIUS || 48);
    const outerRadius = baseSnapRadius * 2;

    let local = manager.localConnection_ || null;
    let closest = manager.closestConnection_ || null;
    let distance = Infinity;

    if (local && closest) {
        const origin = manager.sqPreviewOrigin_;
        const targetX = (origin && origin.conn === closest) ? origin.x : closest.x_;
        const targetY = (origin && origin.conn === closest) ? origin.y : closest.y_;
        const dx = (local.x_ + dxy.x) - targetX;
        const dy = (local.y_ + dxy.y) - targetY;
        distance = Math.hypot(dx, dy);
    } else {
        const found = findClosestForGlow(manager, dxy, outerRadius);
        if (found.closest && found.local) {
            local = found.local;
            closest = found.closest;
            distance = found.radius;
        }
    }

    if (!local || !closest || distance >= outerRadius) {
        hideManagerGlow(manager);
        return;
    }

    const reducedMotion = isReducedMotionPreferred();
    const opacity = computeJointGlowOpacity(distance, baseSnapRadius, {reducedMotion});
    if (opacity <= 0) {
        hideManagerGlow(manager);
        return;
    }

    const kind = classifyJointConnectionKind(local, closest);
    if (!kind) {
        hideManagerGlow(manager);
        return;
    }

    const glow = ensureManagerGlowState(manager);
    if (!glow) return;

    const canvas = manager.workspace_ && typeof manager.workspace_.getCanvas === 'function' ?
        manager.workspace_.getCanvas() :
        null;
    if (canvas && glow.targetNode.group.parentNode !== canvas) {
        canvas.appendChild(glow.targetNode.group);
    }

    const dragBlockRoot = local.sourceBlock_ && typeof local.sourceBlock_.getSvgRoot === 'function' ?
        local.sourceBlock_.getSvgRoot() :
        null;
    if (dragBlockRoot && glow.dragNode.group.parentNode !== dragBlockRoot) {
        dragBlockRoot.appendChild(glow.dragNode.group);
    }

    const snapped = Boolean(manager.closestConnection_ && manager.localConnection_) || distance <= baseSnapRadius;
    const targetMetrics = getTargetSlotMetrics(closest);
    const dragMetrics = getDragEdgeMetrics(local);
    const targetPath = buildJointEdgePath(kind, 'target', targetMetrics);
    const dragPath = buildJointEdgePath(kind, 'drag', dragMetrics);

    const origin = manager.sqPreviewOrigin_;
    const targetX = (origin && origin.conn === closest && kind === 'previous' && manager.markerConnection_) ?
        origin.x :
        closest.x_;
    const targetY = (origin && origin.conn === closest && kind === 'previous' && manager.markerConnection_) ?
        origin.y :
        closest.y_;

    const localOffset = local.offsetInBlock_ || {x: 0, y: 0};

    updateNodeGeometry(
        glow.targetNode,
        targetPath,
        targetX,
        targetY,
        kind,
        snapped,
        opacity,
        reducedMotion
    );
    updateNodeGeometry(
        glow.dragNode,
        dragPath,
        localOffset.x,
        localOffset.y,
        kind,
        snapped,
        opacity,
        reducedMotion
    );

    glow.activeState = {
        kind,
        distance: Number(distance.toFixed(2)),
        snapRadius: Number(baseSnapRadius.toFixed(2)),
        opacity,
        snapped,
        reducedMotion
    };
};

const patchJointGlow = SB => {
    if (!SB || !SB.InsertionMarkerManager || SB.InsertionMarkerManager.prototype.sqJointGlowPatched_) {
        return;
    }
    const mgrProto = SB.InsertionMarkerManager.prototype;
    mgrProto.sqJointGlowPatched_ = true;

    const origUpdate = mgrProto.update;
    const origShowPreview = mgrProto.showPreview_;
    const origHidePreview = mgrProto.hidePreview_;
    const origDispose = mgrProto.dispose;

    mgrProto.showPreview_ = function () {
        if (this.closestConnection_) {
            this.sqPreviewOrigin_ = {
                conn: this.closestConnection_,
                x: this.closestConnection_.x_,
                y: this.closestConnection_.y_
            };
        }
        return origShowPreview.call(this);
    };

    mgrProto.hidePreview_ = function () {
        this.sqPreviewOrigin_ = null;
        return origHidePreview.call(this);
    };

    mgrProto.update = function (dxy, deleteArea) {
        const res = origUpdate.call(this, dxy, deleteArea);
        updateJointGlowForDrag(this, dxy, SB);
        return res;
    };

    mgrProto.dispose = function () {
        disposeManagerGlow(this);
        this.sqPreviewOrigin_ = null;
        return origDispose.call(this);
    };

    if (SB.BlockSvg && SB.BlockSvg.prototype && !SB.BlockSvg.prototype.sqJointHighlightPatched_) {
        const blockProto = SB.BlockSvg.prototype;
        blockProto.sqJointHighlightPatched_ = true;

        blockProto.highlightForReplacement = function (add) {
            if (!this.svgGroup_) return;
            if (this.svgPath_) {
                this.svgPath_.removeAttribute('filter');
            }
            if (add) {
                SB.utils.addClass(this.svgGroup_, 'blocklyReplaceable');
                SB.utils.addClass(this.svgGroup_, 'sq-joint-replaceable');
            } else {
                SB.utils.removeClass(this.svgGroup_, 'blocklyReplaceable');
                SB.utils.removeClass(this.svgGroup_, 'sq-joint-replaceable');
            }
        };

        blockProto.highlightShapeForInput = function (conn, add) {
            const input = this.getInputWithConnection(conn);
            if (!input || !input.outlinePath) return;
            input.outlinePath.removeAttribute('filter');
            if (add) {
                SB.utils.addClass(input.outlinePath, 'sq-joint-input-active');
                if (this.svgGroup_) {
                    SB.utils.addClass(this.svgGroup_, 'blocklyReplaceable');
                    SB.utils.addClass(this.svgGroup_, 'sq-joint-replaceable');
                }
            } else {
                SB.utils.removeClass(input.outlinePath, 'sq-joint-input-active');
                if (this.svgGroup_) {
                    SB.utils.removeClass(this.svgGroup_, 'blocklyReplaceable');
                    SB.utils.removeClass(this.svgGroup_, 'sq-joint-replaceable');
                }
            }
        };
    }
};

export {
    computeJointGlowOpacity,
    classifyJointConnectionKind,
    buildJointEdgePath,
    patchJointGlow
};

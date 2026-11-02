import {computeApproachStartRadius} from './snap-policy.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CONNECTION_INPUT_VALUE = 1;
const CONNECTION_OUTPUT_VALUE = 2;
const CONNECTION_NEXT_STATEMENT = 3;
const CONNECTION_PREVIOUS_STATEMENT = 4;
const SHAPE_HEXAGONAL = 1;
const SHAPE_SQUARE = 3;

const APPROACH_COLOR = '#22d3ee';
const COMMIT_COLOR = '#34d399';
const DEFAULT_MARKER_COLOR = '#c7cce6';
const DEFAULT_MARKER_OPACITY = 0.2;
const ACTIVE_MARKER_COLOR = '#22d3ee';
const ACTIVE_MARKER_OPACITY = 0.22;
const PEAK_APPROACH_ALPHA = 0.85;
const REDUCED_MOTION_ALPHA = 0.7;
const COMMIT_HOLD_ALPHA = 0.9;
const REPLACEMENT_FADE_OPACITY = '0.55';

const NOTCH_PATH_LEFT =
    'c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2';
const INPUT_SHAPE_ROUND =
    'M 16,0 h 16 a 16 16 0 0 1 0 32 h -16 a 16 16 0 0 1 0 -32 z';
const INPUT_SHAPE_HEXAGONAL =
    'M 16,0 h 16 l 16,16 l -16,16 h -16 l -16,-16 l 16,-16 z';
const INPUT_SHAPE_SQUARE =
    'M 4,0 h 32 a 4 4 0 0 1 4 4 v 24 a 4 4 0 0 1 -4 4 h -32 a 4 4 0 0 1 -4 -4 v -24 a 4 4 0 0 1 4 -4 z';

const computeJointGlowStrokeWidth = (scale = 1) => {
    const safeScale = (Number.isFinite(scale) && scale > 0) ? scale : 1;
    const raw = 2.5 / safeScale;
    const clamped = Math.min(3.5, Math.max(1.75, raw));
    return Number(clamped.toFixed(4));
};

const computeJointGlowOpacity = (distance, snapRadius = 48, options = {}) => {
    if (!Number.isFinite(distance) || !Number.isFinite(snapRadius) || snapRadius <= 0 || distance < 0) {
        return 0;
    }
    const scale = (Number.isFinite(options.scale) && options.scale > 0) ? options.scale : 1;
    const outerRadius = (Number.isFinite(options.outerRadius) && options.outerRadius > snapRadius) ?
        options.outerRadius :
        computeApproachStartRadius(scale, snapRadius);

    if (options.reducedMotion) {
        return distance > outerRadius ? 0 : REDUCED_MOTION_ALPHA;
    }
    if (distance >= outerRadius) {
        return 0;
    }
    if (distance <= snapRadius) {
        return PEAK_APPROACH_ALPHA;
    }
    const t = Math.max(0, Math.min(1, (outerRadius - distance) / (outerRadius - snapRadius)));
    const alpha = PEAK_APPROACH_ALPHA * t * t * (3 - (2 * t));
    return Number(alpha.toFixed(3));
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
    const notchPath = metrics.notchPathLeft || NOTCH_PATH_LEFT;
    if (kind === 'previous') {
        const y = (role === 'drag' && Number.isFinite(metrics.offsetY)) ? metrics.offsetY : 0;
        return `M 12,${y} ${notchPath}`;
    }
    if (kind === 'next') {
        const y = Number.isFinite(metrics.offsetY) ? metrics.offsetY : 0;
        return `M 12,${y} ${notchPath}`;
    }
    if (kind === 'statement-input') {
        const y = Number.isFinite(metrics.offsetY) ? metrics.offsetY : 0;
        return `M 12,${y} ${notchPath}`;
    }
    if (kind === 'value-input') {
        if (role === 'target') {
            if (metrics.shape === SHAPE_SQUARE) {
                return metrics.inputShapeSquare || INPUT_SHAPE_SQUARE;
            }
            return metrics.inputShapeRound || INPUT_SHAPE_ROUND;
        }
        const h = Math.max(24, Number(metrics.height) || 40);
        const r = h / 2;
        return `M ${r},0 a ${r} ${r} 0 0 0 0 ${h}`;
    }
    if (kind === 'boolean') {
        if (role === 'target') {
            return metrics.inputShapeHexagonal || INPUT_SHAPE_HEXAGONAL;
        }
        const h = Math.max(24, Number(metrics.height) || 32);
        const r = h / 2;
        return `M ${r},0 l ${-r},${r} l ${r},${r}`;
    }
    return '';
};

const isReducedMotionPreferred = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    return Boolean(mq && mq.matches);
};

const createGlowPathNode = role => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `sq-joint-glow-path sq-joint-glow-${role}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', APPROACH_COLOR);
    path.setAttribute('stroke-width', '3.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('opacity', '0');
    path.setAttribute('pointer-events', 'none');
    return {
        path,
        lastD: '',
        lastTransform: '',
        lastStroke: APPROACH_COLOR,
        lastStrokeWidth: '3.5',
        lastOpacity: '0',
        lastKind: '',
        lastSnapped: ''
    };
};

const detachPathNode = node => {
    if (!node || !node.path) return;
    if (node.lastOpacity !== '0') {
        node.path.setAttribute('opacity', '0');
        node.lastOpacity = '0';
    }
    if (node.path.parentNode) {
        node.path.parentNode.removeChild(node.path);
    }
};

const ensureManagerGlowState = manager => {
    if (manager.sqJointGlow_) return manager.sqJointGlow_;
    if (typeof document === 'undefined') return null;
    manager.sqJointGlow_ = {
        targetNode: createGlowPathNode('target'),
        dragNode: createGlowPathNode('drag'),
        activeState: null
    };
    return manager.sqJointGlow_;
};

const hideManagerGlow = manager => {
    const state = manager && manager.sqJointGlow_;
    if (!state) return;
    detachPathNode(state.targetNode);
    detachPathNode(state.dragNode);
    state.activeState = null;
};

const disposeManagerGlow = manager => {
    const state = manager && manager.sqJointGlow_;
    if (!state) return;
    detachPathNode(state.targetNode);
    detachPathNode(state.dragNode);
    manager.sqJointGlow_ = null;
};

const setPathNodeAttributes = (node, dStr, transformStr, strokeWidthStr, opacityStr, kind, snapped) => {
    const el = node.path;
    if (el.hasAttribute('filter')) {
        el.removeAttribute('filter');
    }
    if (node.lastD !== dStr) {
        el.setAttribute('d', dStr);
        node.lastD = dStr;
    }
    if (node.lastTransform !== transformStr) {
        if (transformStr) {
            el.setAttribute('transform', transformStr);
        } else {
            el.removeAttribute('transform');
        }
        node.lastTransform = transformStr;
    }
    if (node.lastStroke !== APPROACH_COLOR) {
        el.setAttribute('stroke', APPROACH_COLOR);
        node.lastStroke = APPROACH_COLOR;
    }
    if (node.lastStrokeWidth !== strokeWidthStr) {
        el.setAttribute('stroke-width', strokeWidthStr);
        node.lastStrokeWidth = strokeWidthStr;
    }
    if (node.lastOpacity !== opacityStr) {
        el.setAttribute('opacity', opacityStr);
        node.lastOpacity = opacityStr;
    }
    if (node.lastKind !== kind) {
        el.setAttribute('data-kind', kind);
        node.lastKind = kind;
    }
    const snappedStr = snapped ? 'true' : 'false';
    if (node.lastSnapped !== snappedStr) {
        el.setAttribute('data-snapped', snappedStr);
        node.lastSnapped = snappedStr;
    }
};

const computeConnectionPathAndTransform = (conn, kind, role, SB) => {
    const block = conn ? conn.sourceBlock_ : null;
    const notchPathLeft = (SB && SB.BlockSvg && SB.BlockSvg.NOTCH_PATH_LEFT) || NOTCH_PATH_LEFT;
    const inputShapeRound = (SB && SB.BlockSvg && SB.BlockSvg.INPUT_SHAPE_ROUND) || INPUT_SHAPE_ROUND;
    const inputShapeHex = (SB && SB.BlockSvg && SB.BlockSvg.INPUT_SHAPE_HEXAGONAL) || INPUT_SHAPE_HEXAGONAL;
    const inputShapeSquare = (SB && SB.BlockSvg && SB.BlockSvg.INPUT_SHAPE_SQUARE) || INPUT_SHAPE_SQUARE;

    if (role === 'drag') {
        const offsetY = (conn && conn.type === CONNECTION_NEXT_STATEMENT && conn.offsetInBlock_) ?
            conn.offsetInBlock_.y :
            0;
        const height = (block && block.height) || (kind === 'boolean' ? 32 : 40);
        const dStr = buildJointEdgePath(kind, 'drag', {
            offsetY,
            height,
            localType: conn ? conn.type : 0,
            notchPathLeft
        });
        const tx = (conn && conn.type !== CONNECTION_OUTPUT_VALUE && conn.offsetInBlock_) ?
            (conn.offsetInBlock_.x - 32) :
            0;
        const transformStr = tx ? `translate(${tx}, 0)` : '';
        return {
            dStr,
            transformStr,
            parentGroup: block && typeof block.getSvgRoot === 'function' ? block.getSvgRoot() : null,
            referenceNode: null
        };
    }

    if (conn && conn.type === CONNECTION_INPUT_VALUE && block) {
        const input = typeof block.getInputWithConnection === 'function' ?
            block.getInputWithConnection(conn) :
            null;
        const outlinePath = input && input.outlinePath ? input.outlinePath : null;
        let transformStr = outlinePath ? (outlinePath.getAttribute('transform') || '') : '';
        if (!transformStr && conn.offsetInBlock_) {
            transformStr = `translate(${conn.offsetInBlock_.x}, ${conn.offsetInBlock_.y - 16})`;
        }
        const dStr = buildJointEdgePath(kind, 'target', {
            shape: getConnectionShape(conn),
            inputShapeRound,
            inputShapeHexagonal: inputShapeHex,
            inputShapeSquare
        });
        return {
            dStr,
            transformStr,
            parentGroup: typeof block.getSvgRoot === 'function' ? block.getSvgRoot() : null,
            referenceNode: outlinePath ? outlinePath.nextSibling : null
        };
    }

    const offsetY = (conn && conn.offsetInBlock_) ? conn.offsetInBlock_.y : 0;
    const offsetX = (conn && conn.offsetInBlock_) ? conn.offsetInBlock_.x : 32;
    const dStr = buildJointEdgePath(kind, 'target', {
        offsetY,
        offsetX,
        notchPathLeft
    });
    const tx = offsetX - 32;
    const transformStr = tx ? `translate(${tx}, 0)` : '';
    return {
        dStr,
        transformStr,
        parentGroup: block && typeof block.getSvgRoot === 'function' ? block.getSvgRoot() : null,
        referenceNode: null
    };
};

const attachNodeToParent = (node, parentGroup, referenceNode) => {
    if (!node || !node.path || !parentGroup) return;
    if (referenceNode && referenceNode.parentNode === parentGroup) {
        if (node.path.parentNode !== parentGroup || node.path.nextSibling !== referenceNode) {
            parentGroup.insertBefore(node.path, referenceNode);
        }
        return;
    }
    if (node.path.parentNode !== parentGroup) {
        parentGroup.appendChild(node.path);
    }
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
        if (myConn.dbOpposite_ && Array.isArray(myConn.dbOpposite_) && myConn.dbOpposite_.length === 0) {
            continue;
        }
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

const updateJointGlowForDrag = (manager, dxy, SB) => {
    if (!manager || !dxy || manager.wouldDeleteBlock_) {
        hideManagerGlow(manager);
        return;
    }
    const scale = (manager.workspace_ && typeof manager.workspace_.scale === 'number') ?
        manager.workspace_.scale :
        1;
    const baseSnapRadius = typeof manager.getBaseSnapRadius_ === 'function' ?
        manager.getBaseSnapRadius_() :
        (SB.SNAP_RADIUS || 48);
    const outerRadius = typeof manager.getApproachStartRadius_ === 'function' ?
        manager.getApproachStartRadius_() :
        computeApproachStartRadius(scale, baseSnapRadius);

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

    const reducedMotion = isReducedMotionPreferred();
    if (!local || !closest || (reducedMotion ? distance > outerRadius : distance >= outerRadius)) {
        hideManagerGlow(manager);
        return;
    }

    const hasPreview = Boolean(manager.closestConnection_ && manager.localConnection_);
    const snapped = hasPreview || distance <= baseSnapRadius;
    const effectiveDistance = snapped ? Math.min(distance, baseSnapRadius) : distance;
    const opacity = computeJointGlowOpacity(effectiveDistance, baseSnapRadius, {
        scale,
        outerRadius,
        reducedMotion
    });
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

    const strokeWidth = computeJointGlowStrokeWidth(scale);
    const strokeWidthStr = String(strokeWidth);
    const opacityStr = String(opacity);

    let targetConnForGlow = closest;
    let targetKindForGlow = kind;
    const isMarkerInsertion = Boolean(
        snapped &&
        manager.markerConnection_ &&
        typeof manager.shouldReplace_ === 'function' &&
        !manager.shouldReplace_()
    );
    if (isMarkerInsertion) {
        const markerBlock = manager.markerConnection_.sourceBlock_;
        if (markerBlock && typeof markerBlock.getMatchingConnection === 'function') {
            const markerMatch = markerBlock.getMatchingConnection(local.sourceBlock_, local);
            if (markerMatch) {
                targetConnForGlow = markerMatch;
                targetKindForGlow = markerMatch.type === CONNECTION_PREVIOUS_STATEMENT ?
                    'previous' :
                    'next';
            }
        }
    }

    const targetSpec = computeConnectionPathAndTransform(targetConnForGlow, targetKindForGlow, 'target', SB);
    const dragSpec = computeConnectionPathAndTransform(local, kind, 'drag', SB);

    if (targetSpec.parentGroup) {
        attachNodeToParent(glow.targetNode, targetSpec.parentGroup, targetSpec.referenceNode);
        setPathNodeAttributes(
            glow.targetNode,
            targetSpec.dStr,
            targetSpec.transformStr,
            strokeWidthStr,
            opacityStr,
            kind,
            snapped
        );
    } else {
        detachPathNode(glow.targetNode);
    }

    if (dragSpec.parentGroup) {
        attachNodeToParent(glow.dragNode, dragSpec.parentGroup, dragSpec.referenceNode);
        setPathNodeAttributes(
            glow.dragNode,
            dragSpec.dStr,
            dragSpec.transformStr,
            strokeWidthStr,
            opacityStr,
            kind,
            snapped
        );
    } else {
        detachPathNode(glow.dragNode);
    }

    glow.activeState = {
        kind,
        distance: Number(distance.toFixed(2)),
        snapRadius: Number(baseSnapRadius.toFixed(2)),
        outerRadius: Number(outerRadius.toFixed(2)),
        strokeWidth,
        opacity,
        snapped,
        isMarkerInsertion,
        reducedMotion
    };
};

const runCommitFlash = (manager, local, closest, SB) => {
    if (typeof document === 'undefined' || isReducedMotionPreferred()) {
        return;
    }
    if (!local || !closest) return;
    const kind = classifyJointConnectionKind(local, closest);
    if (!kind) return;

    const scale = (manager && manager.workspace_ && typeof manager.workspace_.scale === 'number') ?
        manager.workspace_.scale :
        1;
    const strokeWidthStr = String(computeJointGlowStrokeWidth(scale));
    const spec = computeConnectionPathAndTransform(closest, kind, 'target', SB);
    if (!spec.parentGroup || !spec.dStr) return;

    const commitPath = document.createElementNS(SVG_NS, 'path');
    commitPath.setAttribute('class', 'sq-joint-glow-path sq-joint-glow-commit');
    commitPath.setAttribute('fill', 'none');
    commitPath.setAttribute('stroke', COMMIT_COLOR);
    commitPath.setAttribute('stroke-width', strokeWidthStr);
    commitPath.setAttribute('stroke-linecap', 'round');
    commitPath.setAttribute('stroke-linejoin', 'round');
    commitPath.setAttribute('opacity', String(COMMIT_HOLD_ALPHA));
    commitPath.setAttribute('pointer-events', 'none');
    commitPath.setAttribute('d', spec.dStr);
    if (spec.transformStr) {
        commitPath.setAttribute('transform', spec.transformStr);
    }
    spec.parentGroup.appendChild(commitPath);

    setTimeout(() => {
        commitPath.style.transition = 'opacity 100ms cubic-bezier(0.2, 0, 0, 1)';
        commitPath.setAttribute('opacity', '0');
        commitPath.style.opacity = '0';
    }, 120);

    setTimeout(() => {
        if (commitPath.parentNode) {
            commitPath.parentNode.removeChild(commitPath);
        }
    }, 225);
};

const restoreInsertionMarkerColours = (manager, SB) => {
    if (!SB || !SB.Colours) return;
    SB.Colours.insertionMarker = (manager && manager.sqSavedMarkerColour_) || DEFAULT_MARKER_COLOR;
    SB.Colours.insertionMarkerOpacity = (manager && typeof manager.sqSavedMarkerOpacity_ === 'number') ?
        manager.sqSavedMarkerOpacity_ :
        DEFAULT_MARKER_OPACITY;
};

const activateInsertionMarkerColours = (manager, SB) => {
    if (!SB || !SB.Colours) return;
    if (manager && !manager.sqSavedMarkerColour_) {
        manager.sqSavedMarkerColour_ = SB.Colours.insertionMarker || DEFAULT_MARKER_COLOR;
        manager.sqSavedMarkerOpacity_ = typeof SB.Colours.insertionMarkerOpacity === 'number' ?
            SB.Colours.insertionMarkerOpacity :
            DEFAULT_MARKER_OPACITY;
    }
    SB.Colours.insertionMarker = ACTIVE_MARKER_COLOR;
    SB.Colours.insertionMarkerOpacity = ACTIVE_MARKER_OPACITY;
};

const styleMarkerBlockSvg = markerBlock => {
    if (!markerBlock) return;
    if (markerBlock.svgPath_) {
        markerBlock.svgPath_.setAttribute('fill', ACTIVE_MARKER_COLOR);
        markerBlock.svgPath_.setAttribute('fill-opacity', String(ACTIVE_MARKER_OPACITY));
        markerBlock.svgPath_.style.fill = ACTIVE_MARKER_COLOR;
        markerBlock.svgPath_.style.fillOpacity = String(ACTIVE_MARKER_OPACITY);
    }
};

const stripWhiteReplacementFilterFromDefs = workspace => {
    if (!workspace || typeof workspace.getParentSvg !== 'function') return;
    const svg = workspace.getParentSvg();
    if (!svg || typeof svg.querySelectorAll !== 'function') return;
    const filters = svg.querySelectorAll('filter[id*="blocklyReplacementGlowFilter"]');
    for (let i = 0; i < filters.length; i++) {
        const filterNode = filters[i];
        if (filterNode.parentNode) {
            filterNode.parentNode.removeChild(filterNode);
        }
    }
};

const patchJointGlow = SB => {
    if (!SB || !SB.InsertionMarkerManager || SB.InsertionMarkerManager.prototype.sqJointGlowPatched_) {
        return;
    }
    const OrigManager = SB.InsertionMarkerManager;
    const mgrProto = OrigManager.prototype;
    mgrProto.sqJointGlowPatched_ = true;

    const LazyInsertionMarkerManager = function (block) {
        this.topBlock_ = SB.selected = block;
        this.workspace_ = block.workspace;
        this.lastMarker_ = null;
        this.lastOnStack_ = null;
        this.firstMarker_ = null;
        this.localConnection_ = null;
        this.closestConnection_ = null;
        this.wouldDeleteBlock_ = false;
        this.markerConnection_ = null;
        this.highlightingBlock_ = false;
        this.highlightedBlock_ = null;
        this.availableConnections_ = this.initAvailableConnections_();
        stripWhiteReplacementFilterFromDefs(this.workspace_);
    };
    LazyInsertionMarkerManager.prototype = mgrProto;
    LazyInsertionMarkerManager.prototype.constructor = LazyInsertionMarkerManager;
    SB.InsertionMarkerManager = LazyInsertionMarkerManager;

    mgrProto.initAvailableConnections_ = function () {
        const available = this.topBlock_.getConnections_(false);
        const lastOnStack = this.topBlock_.lastConnectionInStack();
        if (lastOnStack && lastOnStack !== this.topBlock_.nextConnection) {
            available.push(lastOnStack);
            this.lastOnStack_ = lastOnStack;
        }
        return available.filter(conn => {
            if (!conn) return false;
            if (conn.type === SB.INPUT_VALUE) return false;
            if (conn.type === SB.NEXT_STATEMENT && conn.targetConnection) return false;
            return true;
        });
    };

    mgrProto.connectMarker_ = function () {
        const local = this.localConnection_;
        const closest = this.closestConnection_;
        const isLastInStack = Boolean(this.lastOnStack_ && local === this.lastOnStack_);
        activateInsertionMarkerColours(this, SB);
        let imBlock;
        if (isLastInStack) {
            if (!this.lastMarker_) {
                this.lastMarker_ = this.createMarkerBlock_(this.lastOnStack_.sourceBlock_);
            }
            imBlock = this.lastMarker_;
        } else {
            if (!this.firstMarker_) {
                this.firstMarker_ = this.createMarkerBlock_(this.topBlock_);
            }
            imBlock = this.firstMarker_;
        }
        styleMarkerBlockSvg(imBlock);
        const imConn = imBlock.getMatchingConnection(local.sourceBlock_, local);
        if (!imBlock.rendered) {
            imBlock.render(false);
            imBlock.rendered = true;
        }
        styleMarkerBlockSvg(imBlock);
        imBlock.getSvgRoot().setAttribute('visibility', 'visible');
        imBlock.positionNewBlock(imBlock, imConn, closest);
        imConn.connect(closest);
        this.markerConnection_ = imConn;
    };

    const origDisconnectMarker = mgrProto.disconnectMarker_;
    mgrProto.disconnectMarker_ = function () {
        const res = origDisconnectMarker.call(this);
        restoreInsertionMarkerColours(this, SB);
        return res;
    };

    const origUpdate = mgrProto.update;
    const origShowPreview = mgrProto.showPreview_;
    const origHidePreview = mgrProto.hidePreview_;
    const origApplyConnections = mgrProto.applyConnections;
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
        const res = origHidePreview.call(this);
        restoreInsertionMarkerColours(this, SB);
        return res;
    };

    mgrProto.update = function (dxy, deleteArea) {
        const res = origUpdate.call(this, dxy, deleteArea);
        updateJointGlowForDrag(this, dxy, SB);
        return res;
    };

    mgrProto.applyConnections = function () {
        const local = this.localConnection_;
        const closest = this.closestConnection_;
        hideManagerGlow(this);
        const res = origApplyConnections.call(this);
        restoreInsertionMarkerColours(this, SB);
        if (local && closest) {
            runCommitFlash(this, local, closest, SB);
        }
        return res;
    };

    mgrProto.dispose = function () {
        disposeManagerGlow(this);
        this.sqPreviewOrigin_ = null;
        restoreInsertionMarkerColours(this, SB);
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
                this.svgGroup_.style.opacity = REPLACEMENT_FADE_OPACITY;
                this.svgGroup_.setAttribute('opacity', REPLACEMENT_FADE_OPACITY);
                if (this.svgPath_) {
                    this.svgPath_.setAttribute('opacity', REPLACEMENT_FADE_OPACITY);
                }
            } else {
                SB.utils.removeClass(this.svgGroup_, 'blocklyReplaceable');
                SB.utils.removeClass(this.svgGroup_, 'sq-joint-replaceable');
                this.svgGroup_.style.opacity = '';
                this.svgGroup_.removeAttribute('opacity');
                if (this.svgPath_) {
                    this.svgPath_.removeAttribute('opacity');
                }
            }
        };

        blockProto.highlightShapeForInput = function (conn, add) {
            const input = this.getInputWithConnection(conn);
            if (!input || !input.outlinePath) return;
            input.outlinePath.removeAttribute('filter');
            if (add) {
                SB.utils.addClass(input.outlinePath, 'sq-joint-input-active');
            } else {
                SB.utils.removeClass(input.outlinePath, 'sq-joint-input-active');
            }
        };
    }
};

export {
    computeJointGlowOpacity,
    computeJointGlowStrokeWidth,
    classifyJointConnectionKind,
    buildJointEdgePath,
    patchJointGlow
};

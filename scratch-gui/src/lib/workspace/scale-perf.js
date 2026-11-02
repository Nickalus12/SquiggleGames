import {syncAllProcedureHatCaptions} from './custom-blocks.js';

const MAX_TEXT_WIDTH_CACHE = 6000;
const DRAG_VISIBLE_STATEMENT_LIMIT = 16;

const computeZoomScrollTranslation = (scrollX, scrollY, absoluteLeft, absoluteTop, x, y, scaleChange) => {
    const curX = Number(scrollX) || 0;
    const curY = Number(scrollY) || 0;
    const absLeft = Number(absoluteLeft) || 0;
    const absTop = Number(absoluteTop) || 0;
    const centerX = Number(x) || 0;
    const centerY = Number(y) || 0;
    const factor = 1 - (Number(scaleChange) || 1);
    const canvasX = curX + absLeft;
    const canvasY = curY + absTop;
    return {
        scrollX: curX + ((centerX - canvasX) * factor),
        scrollY: curY + ((centerY - canvasY) * factor)
    };
};

const isToolboxXmlChanged = (nextXml, currentPropsXml, renderedXml) => {
    if (!nextXml) return false;
    return nextXml !== currentPropsXml || nextXml !== renderedXml;
};

const bumpWorkspaceGeom = ws => {
    if (!ws) return;
    ws.sqGeomRev_ = (ws.sqGeomRev_ || 0) + 1;
};

const restoreBlockTailCull = topBlock => {
    if (!topBlock || !topBlock.sqCulledTails_) return;
    const tails = topBlock.sqCulledTails_;
    for (let i = 0; i < tails.length; i++) {
        const tail = tails[i];
        const root = tail && typeof tail.getSvgRoot === 'function' ? tail.getSvgRoot() : null;
        if (root && root.style.display === 'none' && tail.intersects_ !== false) {
            root.style.display = '';
        }
    }
    topBlock.sqCulledTails_ = null;
};

const reconcileBlockTailCull = (topBlock, nextCulled) => {
    if (!topBlock) return;
    const prev = topBlock.sqCulledTails_;
    if (prev && prev.length) {
        for (let i = 0; i < prev.length; i++) {
            const tail = prev[i];
            if (!nextCulled || nextCulled.indexOf(tail) === -1) {
                const root = tail && typeof tail.getSvgRoot === 'function' ? tail.getSvgRoot() : null;
                if (root && root.style.display === 'none' && tail.intersects_ !== false) {
                    root.style.display = '';
                }
            }
        }
    }
    topBlock.sqCulledTails_ = nextCulled && nextCulled.length ? nextCulled : null;
};

const cullSpineBelowY = (startBlock, maxWorkspaceY, culledList) => {
    const queue = [startBlock];
    let steps = 0;
    while (queue.length && steps < 6000) {
        let cur = queue.pop();
        while (cur && steps < 6000) {
            steps += 1;
            const prevConn = cur.previousConnection;
            if (prevConn && cur.parentBlock_ && prevConn.y_ > maxWorkspaceY) {
                const root = typeof cur.getSvgRoot === 'function' ? cur.getSvgRoot() : null;
                if (root) {
                    if (root.style.display !== 'none') {
                        root.style.display = 'none';
                    }
                    culledList.push(cur);
                }
                break;
            }
            if (cur.inputList) {
                for (let i = 0; i < cur.inputList.length; i++) {
                    const input = cur.inputList[i];
                    if (input && input.type === 3 && input.connection) {
                        const subTarget = input.connection.targetBlock();
                        if (subTarget) {
                            queue.push(subTarget);
                        }
                    }
                }
            }
            cur = typeof cur.getNextBlock === 'function' ? cur.getNextBlock() : null;
        }
    }
};

const hideLongDragStackTail = rootBlock => {
    if (!rootBlock) return [];
    const hidden = [];
    const walkSpine = (start, limit) => {
        let cur = start;
        let depth = 0;
        while (cur) {
            depth += 1;
            if (depth > limit && cur.parentBlock_) {
                const svg = typeof cur.getSvgRoot === 'function' ? cur.getSvgRoot() : null;
                if (svg && svg.style.display !== 'none') {
                    svg.style.display = 'none';
                    hidden.push(svg);
                }
                return;
            }
            if (cur.inputList) {
                for (let i = 0; i < cur.inputList.length; i++) {
                    const input = cur.inputList[i];
                    if (input && input.type === 3 && input.connection) {
                        const sub = input.connection.targetBlock();
                        if (sub) {
                            walkSpine(sub, Math.max(4, limit - depth));
                        }
                    }
                }
            }
            cur = typeof cur.getNextBlock === 'function' ? cur.getNextBlock() : null;
        }
    };
    walkSpine(rootBlock, DRAG_VISIBLE_STATEMENT_LIMIT);
    return hidden;
};

const restoreDragStackTail = block => {
    if (!block || !block.sqDragHiddenNodes_) return;
    const nodes = block.sqDragHiddenNodes_;
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]) {
            nodes[i].style.display = '';
        }
    }
    block.sqDragHiddenNodes_ = null;
};

const patchFieldTextWidthCache = SB => {
    if (!SB.Field || SB.Field.sqWidthCachePatched_) return;
    SB.Field.sqWidthCachePatched_ = true;
    const persistentWidths = new Map();
    const origGetCachedWidth = SB.Field.getCachedWidth;

    SB.Field.getCachedWidth = function (textElement) {
        if (!textElement) return 0;
        const classVal = textElement.className && textElement.className.baseVal ?
            textElement.className.baseVal :
            '';
        const key = `${textElement.textContent}\n${classVal}`;
        const hit = persistentWidths.get(key);
        if (typeof hit === 'number') {
            return hit;
        }
        const width = origGetCachedWidth.call(SB.Field, textElement);
        if (Number.isFinite(width) && width > 0) {
            if (persistentWidths.size >= MAX_TEXT_WIDTH_CACHE) {
                persistentWidths.clear();
            }
            persistentWidths.set(key, width);
        }
        return width;
    };
};

const computeBlockStackHeightWidth = (startBlock, SB) => {
    const ws = startBlock.workspace;
    const rev = ws ? (ws.sqGeomRev_ || 0) : -1;
    if (rev >= 0 && startBlock.sqHWRev_ === rev && startBlock.sqHW_) {
        return {
            height: startBlock.sqHW_.height,
            width: startBlock.sqHW_.width
        };
    }

    const chain = [];
    let cur = startBlock;
    while (cur) {
        if (rev >= 0 && cur.sqHWRev_ === rev && cur.sqHW_) {
            break;
        }
        chain.push(cur);
        cur = typeof cur.getNextBlock === 'function' ? cur.getNextBlock() : null;
    }

    const notchHeight = (SB.BlockSvg && SB.BlockSvg.NOTCH_HEIGHT) || 8;
    let accHeight = cur && cur.sqHW_ ? cur.sqHW_.height : 0;
    let accWidth = cur && cur.sqHW_ ? cur.sqHW_.width : 0;
    let hasBelow = Boolean(cur);

    for (let i = chain.length - 1; i >= 0; i--) {
        const blk = chain[i];
        const ownH = Number(blk.height) || 0;
        const ownW = Number(blk.width) || 0;
        if (hasBelow) {
            accHeight = ownH + accHeight - notchHeight;
            accWidth = Math.max(ownW, accWidth);
        } else {
            accHeight = ownH;
            accWidth = ownW;
            hasBelow = true;
        }
        if (rev >= 0) {
            blk.sqHW_ = {height: accHeight, width: accWidth};
            blk.sqHWRev_ = rev;
        }
    }

    return {height: accHeight, width: accWidth};
};

const bubbleRenderToEnclosingParent = (block, SB) => {
    let cur = block;
    let parent = cur.getParent();
    while (parent) {
        parent.sqHWRev_ = -1;
        const isLinearNext = Boolean(
            parent.nextConnection &&
            cur.previousConnection &&
            parent.nextConnection.targetConnection === cur.previousConnection
        );
        if (!isLinearNext) {
            parent.render(true);
            return;
        }
        if (typeof parent.nextConnection.tighten_ === 'function') {
            parent.nextConnection.tighten_();
        }
        cur = parent;
        parent = cur.getParent();
    }
    if (block.workspace) {
        SB.resizeSvgContents(block.workspace);
    }
};

const alignConnectedChildLocally = conn => {
    if (!conn || !conn.isConnected()) return;
    const targetConn = conn.targetConnection;
    const childBlock = conn.targetBlock();
    if (!targetConn || !childBlock) return;
    const svgRoot = childBlock.getSvgRoot();
    if (!svgRoot) return;
    const lx = (conn.offsetInBlock_ ? conn.offsetInBlock_.x : 0) -
        (targetConn.offsetInBlock_ ? targetConn.offsetInBlock_.x : 0);
    const ly = (conn.offsetInBlock_ ? conn.offsetInBlock_.y : 0) -
        (targetConn.offsetInBlock_ ? targetConn.offsetInBlock_.y : 0);
    childBlock.sqXY_ = {x: lx, y: ly};
    svgRoot.setAttribute('transform', `translate(${lx},${ly})`);
};

const propagateTreeConnectionCoords = (rootBlock, SB) => {
    if (!rootBlock) return;
    const rootXY = rootBlock.getRelativeToSurfaceXY();
    rootBlock.sqAbsX_ = rootXY.x;
    rootBlock.sqAbsY_ = rootXY.y;
    const stack = [rootBlock];
    while (stack.length) {
        const blk = stack.pop();
        if (!blk || !blk.rendered) continue;
        const ax = blk.sqAbsX_ || 0;
        const ay = blk.sqAbsY_ || 0;
        const pos = {x: ax, y: ay};
        if (blk.previousConnection) blk.previousConnection.moveToOffset(pos);
        if (blk.outputConnection) blk.outputConnection.moveToOffset(pos);
        if (blk.inputList) {
            for (let i = 0; i < blk.inputList.length; i++) {
                const conn = blk.inputList[i].connection;
                if (conn) conn.moveToOffset(pos);
            }
        }
        if (blk.nextConnection) blk.nextConnection.moveToOffset(pos);
        const icons = blk.getIcons();
        for (let i = 0; i < icons.length; i++) {
            icons[i].computeIconLocation();
        }
        const children = blk.childBlocks_;
        if (children) {
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (!child) continue;
                let cxy = child.sqXY_;
                if (!cxy) {
                    const svg = child.getSvgRoot();
                    cxy = svg && SB && SB.utils ? SB.utils.getRelativeXY(svg) : {x: 0, y: 0};
                    child.sqXY_ = {x: cxy.x, y: cxy.y};
                }
                child.sqAbsX_ = ax + cxy.x;
                child.sqAbsY_ = ay + cxy.y;
                stack.push(child);
            }
        }
    }
};

const runBlockRender = (block, optBubble, SB) => {
    const ws = block.workspace;
    if ((ws && (ws.sqSuppressRender_ || ws.isClearing)) || block.sqDisposing_) {
        return;
    }
    SB.Field.startCache();
    block.rendered = true;

    let cursorX = SB.BlockSvg.SEP_SPACE_X;
    if (block.RTL) {
        cursorX = -cursorX;
    }
    const icons = block.getIcons();
    let scratchCommentIcon = null;
    for (let i = 0; i < icons.length; i++) {
        if (SB.ScratchBlockComment && icons[i] instanceof SB.ScratchBlockComment) {
            scratchCommentIcon = icons[i];
        } else {
            cursorX = icons[i].renderIcon(cursorX);
        }
    }
    cursorX += block.RTL ? SB.BlockSvg.SEP_SPACE_X : -SB.BlockSvg.SEP_SPACE_X;

    if (block.isScratchExtension && block.outputConnection) {
        cursorX += block.RTL ? -SB.BlockSvg.GRID_UNIT : SB.BlockSvg.GRID_UNIT;
    }

    const inputRows = block.renderCompute_(cursorX);
    block.renderDraw_(cursorX, inputRows);

    if (ws && ws.sqBatchDomRender_) {
        for (let i = 0; i < block.inputList.length; i++) {
            const conn = block.inputList[i].connection;
            if (conn && conn.isConnected()) {
                alignConnectedChildLocally(conn);
            }
        }
        if (block.nextConnection && block.nextConnection.isConnected()) {
            alignConnectedChildLocally(block.nextConnection);
        }
    } else {
        block.renderMoveConnections_();
    }

    block.renderClassify_();

    if (scratchCommentIcon && inputRows[0]) {
        const iconX = block.RTL ? -inputRows.rightEdge : inputRows.rightEdge;
        const inputMarginY = inputRows[0].height / 2;
        scratchCommentIcon.renderIcon(iconX, inputMarginY);
    }

    bumpWorkspaceGeom(ws);

    if (optBubble !== false && !(ws && ws.sqBatchDomRender_)) {
        bubbleRenderToEnclosingParent(block, SB);
    }
    SB.Field.stopCache();

    if (!ws || (!ws.sqBatchLoading_ && !ws.sqBatchDomRender_) || !block.getParent()) {
        block.updateIntersectionObserver();
    }
};

const patchBlockSvgGeometryAndRender = SB => {
    if (!SB.BlockSvg || SB.BlockSvg.prototype.sqScalePatched_) return;
    const proto = SB.BlockSvg.prototype;
    proto.sqScalePatched_ = true;

    const origTranslate = proto.translate;
    proto.translate = function (x, y) {
        const self = this;
        self.sqXY_ = {x: Number(x) || 0, y: Number(y) || 0};
        bumpWorkspaceGeom(self.workspace);
        return origTranslate.call(self, x, y);
    };

    const origClearTransform = proto.clearTransformAttributes_;
    proto.clearTransformAttributes_ = function () {
        const self = this;
        self.sqXY_ = null;
        return origClearTransform.call(self);
    };

    const origGetRelativeXY = proto.getRelativeToSurfaceXY;
    proto.getRelativeToSurfaceXY = function () {
        const self = this;
        if (!self.useDragSurface_) {
            let x = 0;
            let y = 0;
            let cur = self;
            let valid = true;
            while (cur) {
                if (cur.useDragSurface_) {
                    valid = false;
                    break;
                }
                if (!cur.sqXY_) {
                    const svg = cur.getSvgRoot();
                    if (!svg) {
                        valid = false;
                        break;
                    }
                    const parsed = SB.utils.getRelativeXY(svg);
                    cur.sqXY_ = {x: parsed.x, y: parsed.y};
                }
                x += cur.sqXY_.x;
                y += cur.sqXY_.y;
                cur = cur.parentBlock_;
            }
            if (valid) {
                return new SB.goog.math.Coordinate(x, y);
            }
        }
        const coord = origGetRelativeXY.call(self);
        if (!self.parentBlock_ && !self.useDragSurface_ && coord) {
            self.sqXY_ = {x: coord.x, y: coord.y};
        }
        return coord;
    };

    proto.getHeightWidth = function () {
        return computeBlockStackHeightWidth(this, SB);
    };

    const origSetParent = proto.setParent;
    proto.setParent = function (newParent) {
        const self = this;
        const oldParent = self.parentBlock_;
        if (newParent === oldParent) {
            return;
        }
        if (newParent) {
            self.sqXY_ = null;
        }
        bumpWorkspaceGeom(self.workspace);
        if (!self.rendered && self.workspace && !self.workspace.isClearing) {
            SB.Field.startCache();
            SB.BlockSvg.superClass_.setParent.call(self, newParent);
            SB.Field.stopCache();
            const svgRoot = self.getSvgRoot();
            if (svgRoot) {
                if (newParent) {
                    newParent.getSvgRoot().appendChild(svgRoot);
                    if (self.isShadow()) {
                        self.setColour(
                            self.getColour(),
                            self.getColourSecondary(),
                            newParent.getColourTertiary(),
                            self.getColourQuaternary()
                        );
                    }
                } else if (oldParent) {
                    self.workspace.getCanvas().appendChild(svgRoot);
                }
            }
            return;
        }
        origSetParent.call(self, newParent);
    };

    proto.moveConnections_ = function (dx, dy) {
        if (!this.rendered) return;
        const stack = [this];
        while (stack.length) {
            const blk = stack.pop();
            if (!blk || !blk.rendered) continue;
            const conns = blk.getConnections_(false);
            for (let i = 0; i < conns.length; i++) {
                conns[i].moveBy(dx, dy);
            }
            const icons = blk.getIcons();
            for (let i = 0; i < icons.length; i++) {
                icons[i].computeIconLocation();
            }
            const children = blk.childBlocks_;
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    stack.push(children[i]);
                }
            }
        }
    };

    proto.setDragging = function (adding) {
        if (adding) {
            SB.draggingConnections_ = [];
            const stack = [this];
            let count = 0;
            while (stack.length) {
                const blk = stack.pop();
                if (!blk) continue;
                count += 1;
                blk.sqIsDragging_ = true;
                const svg = blk.getSvgRoot();
                if (svg) {
                    svg.translate_ = '';
                    svg.skew_ = '';
                    if (count <= 32 && svg.style.display !== 'none' && blk.svgGroup_) {
                        SB.utils.addClass(blk.svgGroup_, 'blocklyDragging');
                        blk.sqHasDragClass_ = true;
                    }
                }
                const conns = blk.getConnections_(true);
                for (let i = 0; i < conns.length; i++) {
                    SB.draggingConnections_.push(conns[i]);
                }
                const children = blk.childBlocks_;
                if (children) {
                    for (let i = 0; i < children.length; i++) {
                        stack.push(children[i]);
                    }
                }
            }
        } else {
            SB.draggingConnections_ = [];
            const stack = [this];
            while (stack.length) {
                const blk = stack.pop();
                if (!blk) continue;
                blk.sqIsDragging_ = false;
                if (blk.sqHasDragClass_ && blk.svgGroup_) {
                    SB.utils.removeClass(blk.svgGroup_, 'blocklyDragging');
                    blk.sqHasDragClass_ = false;
                }
                const children = blk.childBlocks_;
                if (children) {
                    for (let i = 0; i < children.length; i++) {
                        stack.push(children[i]);
                    }
                }
            }
        }
    };

    proto.bumpNeighbours_ = function () {
        const ws = this.workspace;
        if (!ws || ws.isDragging()) return;
        const root = this.getRootBlock();
        if (root.isInFlyout) return;
        if (ws.topBlocks_ && ws.topBlocks_.length <= 1) return;

        const stack = [this];
        let visited = 0;
        while (stack.length && visited < 80) {
            const blk = stack.pop();
            if (!blk) continue;
            visited += 1;
            const conns = blk.getConnections_(false);
            for (let i = 0; i < conns.length; i++) {
                const conn = conns[i];
                if (conn.isConnected() && conn.isSuperior()) {
                    stack.push(conn.targetBlock());
                }
                const neighbours = conn.neighbours_(SB.SNAP_RADIUS);
                for (let j = 0; j < neighbours.length; j++) {
                    const other = neighbours[j];
                    if (conn.isConnected() && other.isConnected()) {
                        continue;
                    }
                    if (other.getSourceBlock().getRootBlock() !== root) {
                        if (conn.isSuperior()) {
                            other.bumpAwayFrom_(conn);
                        } else {
                            conn.bumpAwayFrom_(other);
                        }
                    }
                }
            }
        }
    };

    const origDispose = proto.dispose;
    proto.dispose = function (healStack, animate) {
        const self = this;
        const ws = self.workspace;
        self.sqDisposing_ = true;
        bumpWorkspaceGeom(ws);
        const prevSuppress = Boolean(ws && ws.sqSuppressRender_);
        if (ws && !healStack) {
            ws.sqSuppressRender_ = true;
        }
        try {
            return origDispose.call(self, healStack, animate);
        } finally {
            if (ws && !healStack) {
                ws.sqSuppressRender_ = prevSuppress;
            }
        }
    };

    proto.render = function (optBubble) {
        runBlockRender(this, optBubble, SB);
    };

    if (SB.RenderedConnection && SB.RenderedConnection.prototype) {
        const rcProto = SB.RenderedConnection.prototype;
        rcProto.tighten_ = function () {
            const self = this;
            const dx = self.targetConnection.x_ - self.x_;
            const dy = self.targetConnection.y_ - self.y_;
            if (dx !== 0 || dy !== 0) {
                const block = self.targetBlock();
                const svgRoot = block.getSvgRoot();
                if (!svgRoot) {
                    throw new Error('block is not rendered.');
                }
                const xy = block.sqXY_ || SB.utils.getRelativeXY(svgRoot);
                const nx = xy.x - dx;
                const ny = xy.y - dy;
                block.sqXY_ = {x: nx, y: ny};
                svgRoot.setAttribute('transform', `translate(${nx},${ny})`);
                block.moveConnections_(-dx, -dy);
            }
        };

        const origConnect = rcProto.connect_;
        rcProto.connect_ = function (childConnection) {
            const self = this;
            const parentBlock = self.getSourceBlock();
            const childBlock = childConnection ? childConnection.getSourceBlock() : null;
            if (
                parentBlock &&
                childBlock &&
                parentBlock.rendered &&
                childBlock.rendered &&
                self === parentBlock.nextConnection &&
                childConnection === childBlock.previousConnection
            ) {
                SB.RenderedConnection.superClass_.connect_.call(self, childConnection);
                parentBlock.updateDisabled();
                childBlock.updateDisabled();
                alignConnectedChildLocally(self);
                const parentXY = parentBlock.getRelativeToSurfaceXY();
                const targetX = parentXY.x + (self.offsetInBlock_ ? self.offsetInBlock_.x : 0);
                const targetY = parentXY.y + (self.offsetInBlock_ ? self.offsetInBlock_.y : 0);
                self.x_ = targetX;
                self.y_ = targetY;
                const dx = childConnection.x_ - targetX;
                const dy = childConnection.y_ - targetY;
                if (dx !== 0 || dy !== 0) {
                    childBlock.moveConnections_(-dx, -dy);
                }
                bumpWorkspaceGeom(parentBlock.workspace);
                bubbleRenderToEnclosingParent(parentBlock, SB);
                return;
            }
            origConnect.call(self, childConnection);
        };

        const origDisconnectInternal = rcProto.disconnectInternal_;
        rcProto.disconnectInternal_ = function (parentBlock, childBlock) {
            const self = this;
            const ws = parentBlock && parentBlock.workspace;
            if ((ws && (ws.isClearing || ws.sqSuppressRender_)) ||
                (parentBlock && parentBlock.sqDisposing_) ||
                (childBlock && childBlock.sqDisposing_)) {
                SB.RenderedConnection.superClass_.disconnectInternal_.call(self, parentBlock, childBlock);
                return;
            }
            if (
                parentBlock &&
                childBlock &&
                parentBlock.rendered &&
                childBlock.rendered &&
                self === parentBlock.nextConnection
            ) {
                SB.RenderedConnection.superClass_.disconnectInternal_.call(self, parentBlock, childBlock);
                childBlock.updateDisabled();
                bumpWorkspaceGeom(ws);
                bubbleRenderToEnclosingParent(parentBlock, SB);
                return;
            }
            origDisconnectInternal.call(self, parentBlock, childBlock);
        };
    }

    if (SB.Block && SB.Block.prototype) {
        const blockProto = SB.Block.prototype;

        blockProto.setConnectionsHidden = function (hidden) {
            const stack = [this];
            while (stack.length) {
                const blk = stack.pop();
                if (!blk) continue;
                if (!hidden && blk.isCollapsed()) {
                    if (blk.outputConnection) blk.outputConnection.setHidden(hidden);
                    if (blk.previousConnection) blk.previousConnection.setHidden(hidden);
                    if (blk.nextConnection) {
                        blk.nextConnection.setHidden(hidden);
                        const child = blk.nextConnection.targetBlock();
                        if (child) stack.push(child);
                    }
                } else {
                    const conns = blk.getConnections_(true);
                    for (let i = 0; i < conns.length; i++) {
                        const conn = conns[i];
                        conn.setHidden(hidden);
                        if (conn.isSuperior()) {
                            const target = conn.targetBlock();
                            if (target) stack.push(target);
                        }
                    }
                }
            }
        };

        const origUnplug = blockProto.unplug;
        blockProto.unplug = function (optHealStack) {
            const self = this;
            const ws = self.workspace;
            if (optHealStack && ws && !self.outputConnection && self.previousConnection) {
                const prevTarget = self.previousConnection.isConnected() ?
                    self.previousConnection.targetConnection :
                    null;
                const nextBlock = self.getNextBlock();
                const nextTarget = nextBlock && self.nextConnection ?
                    self.nextConnection.targetConnection :
                    null;
                if (prevTarget && nextTarget) {
                    const prevSuppress = Boolean(ws.sqSuppressRender_);
                    ws.sqSuppressRender_ = true;
                    try {
                        self.previousConnection.disconnect();
                        nextTarget.disconnect();
                    } finally {
                        ws.sqSuppressRender_ = prevSuppress;
                    }
                    if (prevTarget.checkType_(nextTarget)) {
                        prevTarget.connect(nextTarget);
                    } else if (prevTarget.sourceBlock_ && prevTarget.sourceBlock_.rendered) {
                        prevTarget.sourceBlock_.render();
                    }
                    if (self.rendered) {
                        self.render(false);
                    }
                    return;
                }
            }
            origUnplug.call(self, optHealStack);
        };
    }
};

const computeCachedWorkspaceBBox = (ws, origGetBBox, SB) => {
    const rev = ws.sqGeomRev_ || 0;
    const tabWidth = SB.BlockSvg ? SB.BlockSvg.TAB_WIDTH : 0;
    const topBlocksLen = ws.topBlocks_ ? ws.topBlocks_.length : 0;
    const topCommentsLen = ws.topComments_ ? ws.topComments_.length : 0;
    const cached = ws.sqBBoxCache_;
    if (
        cached &&
        cached.rev === rev &&
        cached.tabWidth === tabWidth &&
        cached.topBlocksLen === topBlocksLen &&
        cached.topCommentsLen === topCommentsLen
    ) {
        return {
            x: cached.box.x,
            y: cached.box.y,
            width: cached.box.width,
            height: cached.box.height
        };
    }
    const box = origGetBBox.call(ws);
    ws.sqBBoxCache_ = {
        rev,
        tabWidth,
        topBlocksLen,
        topCommentsLen,
        box: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
        }
    };
    return box;
};

const runFastZoom = (ws, x, y, amount, SB) => {
    const speed = ws.options.zoomOptions.scaleSpeed;
    const metrics = ws.getMetrics();
    let scaleChange = Math.pow(speed, amount);
    const newScale = ws.scale * scaleChange;
    if (newScale > ws.options.zoomOptions.maxScale) {
        scaleChange = ws.options.zoomOptions.maxScale / ws.scale;
    } else if (newScale < ws.options.zoomOptions.minScale) {
        scaleChange = ws.options.zoomOptions.minScale / ws.scale;
    }
    if (ws.scale === newScale) {
        return;
    }
    if (ws.scrollbar && metrics) {
        const nextScroll = computeZoomScrollTranslation(
            ws.scrollX,
            ws.scrollY,
            metrics.absoluteLeft,
            metrics.absoluteTop,
            x,
            y,
            scaleChange
        );
        ws.scrollX = nextScroll.scrollX;
        ws.scrollY = nextScroll.scrollY;
    }
    ws.setScale(ws.scale * scaleChange);
    SB.WidgetDiv.hide(true);
    SB.DropDownDiv.hideWithoutAnimation();
    if (ws.intersectionObserver) {
        ws.intersectionObserver.checkForIntersections();
    }
};

const runFastScrollbarPairResize = pair => {
    const ws = pair.workspace_;
    const hostMetrics = ws ? ws.getMetrics() : null;
    if (!hostMetrics) {
        return;
    }

    let resizeH = false;
    let resizeV = false;
    const old = pair.oldHostMetrics_;
    if (
        !old ||
        old.viewWidth !== hostMetrics.viewWidth ||
        old.viewHeight !== hostMetrics.viewHeight ||
        old.absoluteTop !== hostMetrics.absoluteTop ||
        old.absoluteLeft !== hostMetrics.absoluteLeft
    ) {
        resizeH = true;
        resizeV = true;
    } else {
        if (
            old.contentWidth !== hostMetrics.contentWidth ||
            old.viewLeft !== hostMetrics.viewLeft ||
            old.contentLeft !== hostMetrics.contentLeft
        ) {
            resizeH = true;
        }
        if (
            old.contentHeight !== hostMetrics.contentHeight ||
            old.viewTop !== hostMetrics.viewTop ||
            old.contentTop !== hostMetrics.contentTop
        ) {
            resizeV = true;
        }
    }

    const origHScroll = pair.hScroll.onScroll_;
    const origVScroll = pair.vScroll.onScroll_;
    pair.hScroll.onScroll_ = function () {};
    pair.vScroll.onScroll_ = function () {};
    try {
        if (resizeH) {
            pair.hScroll.resize(hostMetrics);
        }
        if (resizeV) {
            pair.vScroll.resize(hostMetrics);
        }
    } finally {
        pair.hScroll.onScroll_ = origHScroll;
        pair.vScroll.onScroll_ = origVScroll;
    }

    if (resizeH || resizeV) {
        const xyRatio = {};
        if (resizeH) {
            const hRatio = pair.hScroll.handlePosition_ / pair.hScroll.scrollViewSize_;
            xyRatio.x = Number.isNaN(hRatio) ? 0 : hRatio;
        }
        if (resizeV) {
            const vRatio = pair.vScroll.handlePosition_ / pair.vScroll.scrollViewSize_;
            xyRatio.y = Number.isNaN(vRatio) ? 0 : vRatio;
        }
        ws.sqCachedHostMetrics_ = hostMetrics;
        try {
            ws.setMetrics(xyRatio);
        } finally {
            ws.sqCachedHostMetrics_ = null;
        }
    }

    if (!old || old.viewWidth !== hostMetrics.viewWidth || old.absoluteLeft !== hostMetrics.absoluteLeft) {
        pair.corner_.setAttribute('x', pair.vScroll.position_.x);
    }
    if (!old || old.viewHeight !== hostMetrics.viewHeight || old.absoluteTop !== hostMetrics.absoluteTop) {
        pair.corner_.setAttribute('y', pair.hScroll.position_.y);
    }
    pair.oldHostMetrics_ = hostMetrics;
};

const patchWorkspaceMetricsAndZoom = SB => {
    if (!SB.WorkspaceSvg || SB.WorkspaceSvg.prototype.sqZoomPatched_) return;
    const wsProto = SB.WorkspaceSvg.prototype;
    wsProto.sqZoomPatched_ = true;

    const origGetBBox = wsProto.getBlocksBoundingBox;
    wsProto.getBlocksBoundingBox = function () {
        return computeCachedWorkspaceBBox(this, origGetBBox, SB);
    };

    const origGetTopMetrics = SB.WorkspaceSvg.getTopLevelWorkspaceMetrics_;
    if (typeof origGetTopMetrics === 'function') {
        SB.WorkspaceSvg.getTopLevelWorkspaceMetrics_ = function () {
            const self = this;
            if (self.sqCachedHostMetrics_) {
                return self.sqCachedHostMetrics_;
            }
            return origGetTopMetrics.call(self);
        };
    }

    wsProto.zoom = function (x, y, amount) {
        runFastZoom(this, x, y, amount, SB);
    };

    const origClear = wsProto.clear;
    wsProto.clear = function () {
        const self = this;
        if (self.intersectionObserver) {
            self.intersectionObserver.observing = [];
            if (self.intersectionObserver.observingSet_) {
                self.intersectionObserver.observingSet_.clear();
            }
        }
        self.sqLastSyncedXml_ = null;
        self.sqTopBlockXmlMap_ = null;
        bumpWorkspaceGeom(self);
        self.sqSuppressRender_ = true;
        try {
            return origClear.call(self);
        } finally {
            self.sqSuppressRender_ = false;
        }
    };

    if (SB.ScrollbarPair && SB.ScrollbarPair.prototype) {
        SB.ScrollbarPair.prototype.resize = function () {
            runFastScrollbarPairResize(this);
        };
    }
};

const runFastIntersectionCheck = (observer, SB) => {
    observer.intersectionCheckQueued = false;
    const workspace = observer.workspace;
    if (!workspace) return;

    const workspaceScale = workspace.scale || 1;
    const rtl = workspace.RTL;
    const parentSvg = workspace.getParentSvg();
    if (!parentSvg) return;

    const svgSize = SB.svgSize(parentSvg);
    const workspaceHeight = svgSize.height || (parentSvg.height && parentSvg.height.baseVal.value) || 800;
    const workspaceWidth = svgSize.width || (parentSvg.width && parentSvg.width.baseVal.value) || 1000;

    const canvasPos = workspace.isDragSurfaceActive_ && workspace.workspaceDragSurface_ ?
        SB.utils.getRelativeXY(workspace.workspaceDragSurface_.SVG_) :
        {
            x: (workspace.scrollX || 0) + (workspace.toolbox_ && !rtl ? workspace.toolbox_.getWidth() : 0),
            y: workspace.scrollY || 0
        };

    const margin = 16 * workspaceScale;
    const maxWorkspaceY = (workspaceHeight - canvasPos.y + margin) / workspaceScale;
    const observing = observer.observing;

    for (let i = 0; i < observing.length; i++) {
        const block = observing[i];
        if (!block || !block.workspace) continue;

        const blockXY = block.getRelativeToSurfaceXY();
        let posX = blockXY.x;
        const posY = blockXY.y;
        let blockSize = null;

        if (rtl) {
            blockSize = block.getHeightWidth();
            posX -= blockSize.width;
        }
        const screenX = canvasPos.x + (posX * workspaceScale);
        const screenY = canvasPos.y + (posY * workspaceScale);

        let visible = true;
        if (screenY - margin > workspaceHeight || screenX - margin > workspaceWidth) {
            visible = false;
            reconcileBlockTailCull(block, null);
        } else {
            if (!blockSize) {
                blockSize = block.getHeightWidth();
            }
            const scaledW = blockSize.width * workspaceScale;
            const scaledH = blockSize.height * workspaceScale;
            if (screenX + scaledW + margin < 0 || screenY + scaledH + margin < 0) {
                visible = false;
                reconcileBlockTailCull(block, null);
            } else if (screenY + scaledH - margin > workspaceHeight) {
                const culled = [];
                cullSpineBelowY(block, maxWorkspaceY, culled);
                reconcileBlockTailCull(block, culled);
            } else {
                reconcileBlockTailCull(block, null);
            }
        }

        block.setIntersects(visible);
    }
};

const patchIntersectionObserver = SB => {
    if (!SB.IntersectionObserver || SB.IntersectionObserver.prototype.sqScalePatched_) return;
    const ioProto = SB.IntersectionObserver.prototype;
    ioProto.sqScalePatched_ = true;

    ioProto.queueIntersectionCheck = function () {
        const self = this;
        if (self.intersectionCheckQueued) return;
        self.intersectionCheckQueued = true;
        queueMicrotask(() => {
            if (!self.intersectionCheckQueued) return;
            self.checkForIntersections();
        });
    };

    ioProto.observe = function (block) {
        const self = this;
        if (!self.observingSet_) {
            self.observingSet_ = new Set(self.observing);
        }
        if (!self.observingSet_.has(block)) {
            self.observingSet_.add(block);
            self.observing.push(block);
        }
    };

    ioProto.unobserve = function (block) {
        const self = this;
        restoreBlockTailCull(block);
        if (!self.observingSet_) {
            self.observingSet_ = new Set(self.observing);
        }
        if (self.observingSet_.has(block)) {
            self.observingSet_.delete(block);
            const idx = self.observing.indexOf(block);
            if (idx !== -1) {
                self.observing.splice(idx, 1);
            }
        }
    };

    const origDispose = ioProto.dispose;
    ioProto.dispose = function () {
        const self = this;
        if (self.observingSet_) {
            self.observingSet_.clear();
        }
        return origDispose.call(self);
    };

    ioProto.checkForIntersections = function () {
        runFastIntersectionCheck(this, SB);
    };
};

const patchDragSurfaceAndConnections = SB => {
    if (SB.BlockDragSurfaceSvg && !SB.BlockDragSurfaceSvg.prototype.sqScalePatched_) {
        const bdsProto = SB.BlockDragSurfaceSvg.prototype;
        bdsProto.sqScalePatched_ = true;

        const origCreateDom = bdsProto.createDom;
        bdsProto.createDom = function () {
            const self = this;
            const res = origCreateDom.call(self);
            if (self.dragGroup_) {
                self.dragGroup_.removeAttribute('filter');
            }
            if (self.SVG_) {
                self.SVG_.style.willChange = 'transform';
            }
            return res;
        };

        const origSetBlocksAndShow = bdsProto.setBlocksAndShow;
        bdsProto.setBlocksAndShow = function (blocks) {
            const self = this;
            if (self.dragGroup_ && self.dragGroup_.hasAttribute('filter')) {
                self.dragGroup_.removeAttribute('filter');
            }
            return origSetBlocksAndShow.call(self, blocks);
        };

        bdsProto.translateSurfaceInternal_ = function () {
            const self = this;
            const x = Math.round(self.surfaceXY_.x);
            const y = Math.round(self.surfaceXY_.y);
            if (self.SVG_.style.display !== 'block') {
                self.SVG_.style.display = 'block';
            }
            SB.utils.setCssTransform(self.SVG_, `translate3d(${x}px, ${y}px, 0px)`);
        };
    }

    if (SB.BlockDragger && !SB.BlockDragger.prototype.sqScalePatched_) {
        const draggerProto = SB.BlockDragger.prototype;
        draggerProto.sqScalePatched_ = true;

        const origStartDrag = draggerProto.startBlockDrag;
        draggerProto.startBlockDrag = function (currentDragDeltaXY) {
            const self = this;
            if (self.draggingBlock_) {
                const root = self.draggingBlock_.getRootBlock();
                if (root && root !== self.draggingBlock_) {
                    restoreBlockTailCull(root);
                }
                restoreBlockTailCull(self.draggingBlock_);
                self.draggingBlock_.sqDragHiddenNodes_ = hideLongDragStackTail(self.draggingBlock_);
            }
            const res = origStartDrag.call(self, currentDragDeltaXY);
            if (self.workspace_ && self.workspace_.svgBlockCanvas_) {
                self.workspace_.svgBlockCanvas_.style.pointerEvents = 'none';
            }
            return res;
        };

        const origEndDrag = draggerProto.endBlockDrag;
        draggerProto.endBlockDrag = function (e, currentDragDeltaXY) {
            const self = this;
            const draggedBlock = self.draggingBlock_;
            if (self.workspace_ && self.workspace_.svgBlockCanvas_) {
                self.workspace_.svgBlockCanvas_.style.pointerEvents = '';
            }
            const res = origEndDrag.call(self, e, currentDragDeltaXY);
            if (draggedBlock) {
                restoreDragStackTail(draggedBlock);
            }
            if (self.workspace_ && self.workspace_.intersectionObserver) {
                self.workspace_.intersectionObserver.checkForIntersections();
            }
            return res;
        };
    }
};

const buildBlockDescendantPreorder = rootBlock => {
    const list = [];
    const stack = [rootBlock];
    while (stack.length) {
        const blk = stack.pop();
        if (!blk) continue;
        list.push(blk);
        const children = blk.childBlocks_;
        if (children) {
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push(children[i]);
            }
        }
    }
    return list;
};

const patchXmlAndFlyoutScale = SB => {
    if (SB.Xml && !SB.Xml.sqScalePatched_) {
        SB.Xml.sqScalePatched_ = true;

        SB.Xml.domToBlock = function (xmlBlock, workspace) {
            let xml = xmlBlock;
            let ws = workspace;
            if (xml instanceof SB.Workspace) {
                const swap = xml;
                xml = ws;
                ws = swap;
            }
            SB.Events.disable();
            const variablesBefore = ws.getAllVariables();
            let topBlock;
            try {
                topBlock = SB.Xml.domToBlockHeadless_(xml, ws);
                const descendants = buildBlockDescendantPreorder(topBlock);
                if (ws.rendered) {
                    topBlock.setConnectionsHidden(true);
                    ws.sqBatchDomRender_ = true;
                    try {
                        for (let i = descendants.length - 1; i >= 0; i--) {
                            descendants[i].initSvg();
                        }
                        for (let i = descendants.length - 1; i >= 0; i--) {
                            descendants[i].render(false);
                        }
                    } finally {
                        ws.sqBatchDomRender_ = false;
                    }
                    propagateTreeConnectionCoords(topBlock, SB);
                    if (!ws.isFlyout) {
                        setTimeout(() => {
                            if (topBlock.workspace) {
                                topBlock.setConnectionsHidden(false);
                            }
                        }, 1);
                    }
                    topBlock.updateDisabled();
                    ws.resizeContents();
                } else {
                    for (let i = descendants.length - 1; i >= 0; i--) {
                        descendants[i].initModel();
                    }
                }
            } finally {
                SB.Events.enable();
            }
            if (SB.Events.isEnabled()) {
                const newVariables = SB.Variables.getAddedVariables(ws, variablesBefore);
                for (let i = 0; i < newVariables.length; i++) {
                    SB.Events.fire(new SB.Events.VarCreate(newVariables[i]));
                }
                SB.Events.fire(new SB.Events.BlockCreate(topBlock));
            }
            return topBlock;
        };

        const origDomToWorkspace = SB.Xml.domToWorkspace;
        SB.Xml.domToWorkspace = function (xml, workspace) {
            if (!workspace) {
                return origDomToWorkspace.call(SB.Xml, xml, workspace);
            }
            workspace.sqBatchLoading_ = true;
            let ids;
            try {
                ids = origDomToWorkspace.call(SB.Xml, xml, workspace);
            } finally {
                workspace.sqBatchLoading_ = false;
            }
            if (workspace.rendered) {
                syncAllProcedureHatCaptions(workspace);
                if (workspace.intersectionObserver) {
                    const topBlocks = workspace.getTopBlocks(false);
                    for (let i = 0; i < topBlocks.length; i++) {
                        workspace.intersectionObserver.observe(topBlocks[i]);
                    }
                    workspace.intersectionObserver.checkForIntersections();
                }
            }
            return ids;
        };
    }

    if (SB.Toolbox && SB.Toolbox.prototype && !SB.Toolbox.prototype.sqScalePatched_) {
        const tbProto = SB.Toolbox.prototype;
        tbProto.sqScalePatched_ = true;
        const origRefreshSelection = tbProto.refreshSelection;
        tbProto.refreshSelection = function () {
            const self = this;
            if (self.flyout_) {
                self.flyout_.sqDynamicRefreshOnly_ = true;
            }
            try {
                return origRefreshSelection.call(self);
            } finally {
                if (self.flyout_) {
                    self.flyout_.sqDynamicRefreshOnly_ = false;
                }
            }
        };
    }

    if (SB.scratchBlocksUtils && !SB.scratchBlocksUtils.sqRecyclePatched_) {
        SB.scratchBlocksUtils.sqRecyclePatched_ = true;
        const origRecyclable = SB.scratchBlocksUtils.blockIsRecyclable;
        SB.scratchBlocksUtils.blockIsRecyclable = function (block) {
            const ws = block && block.workspace;
            const targetWs = ws && ws.targetWorkspace;
            const flyout = targetWs && targetWs.toolbox_ && targetWs.toolbox_.flyout_;
            if (flyout && flyout.sqDynamicRefreshOnly_) {
                if (block.mutationToDom && block.domToMutation) {
                    return false;
                }
                for (let i = 0; i < block.inputList.length; i++) {
                    const input = block.inputList[i];
                    for (let j = 0; j < input.fieldRow.length; j++) {
                        const field = input.fieldRow[j];
                        if (
                            field instanceof SB.FieldVariable ||
                            field instanceof SB.FieldVariableGetter
                        ) {
                            return false;
                        }
                    }
                    if (input.connection) {
                        const child = input.connection.targetBlock();
                        if (child && !SB.scratchBlocksUtils.blockIsRecyclable(child)) {
                            return false;
                        }
                    }
                }
                return true;
            }
            return origRecyclable.call(SB.scratchBlocksUtils, block);
        };
    }

    if (SB.Flyout && SB.Flyout.prototype && !SB.Flyout.prototype.sqScalePatched_) {
        const flyoutProto = SB.Flyout.prototype;
        flyoutProto.sqScalePatched_ = true;
        const origShow = flyoutProto.show;
        flyoutProto.show = function (xmlList) {
            const self = this;
            SB.Events.disable();
            SB.Field.startCache();
            try {
                return origShow.call(self, xmlList);
            } finally {
                SB.Field.stopCache();
                SB.Events.enable();
            }
        };
    }
};

const tryApplySingleFieldDiff = (workspace, prevXml, nextXml) => {
    if (!prevXml || !nextXml || prevXml === nextXml) {
        return prevXml === nextXml;
    }
    const minLen = Math.min(prevXml.length, nextXml.length);
    let prefix = 0;
    while (prefix < minLen && prevXml.charCodeAt(prefix) === nextXml.charCodeAt(prefix)) {
        prefix += 1;
    }
    let prevEnd = prevXml.length - 1;
    let nextEnd = nextXml.length - 1;
    while (prevEnd >= prefix && nextEnd >= prefix &&
        prevXml.charCodeAt(prevEnd) === nextXml.charCodeAt(nextEnd)) {
        prevEnd -= 1;
        nextEnd -= 1;
    }
    if ((nextEnd - prefix) > 256 || (prevEnd - prefix) > 256) {
        return false;
    }
    const windowStart = Math.max(0, prefix - 320);
    const windowEnd = Math.min(nextXml.length, nextEnd + 320);
    const slice = nextXml.slice(windowStart, windowEnd);
    const relPos = prefix - windowStart;

    const beforeSlice = slice.slice(0, relPos + 64);
    const tagMatches = [...beforeSlice.matchAll(/<(?:block|shadow)\b[^>]*?\bid="([^"]+)"[^>]*>/g)];
    if (!tagMatches.length) {
        return false;
    }
    const lastTag = tagMatches[tagMatches.length - 1];
    const blockId = lastTag[1];
    const afterTag = slice.slice(lastTag.index);
    const fieldMatch = afterTag.match(/<field\s+name="([^"]+)"[^>]*>([^<]*)<\/field>/);
    if (!fieldMatch) {
        return false;
    }
    const fieldName = fieldMatch[1];
    const rawValue = fieldMatch[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');

    const block = workspace.getBlockById(blockId);
    if (!block || typeof block.getField !== 'function') {
        return false;
    }
    const field = block.getField(fieldName);
    if (!field || typeof field.getValue !== 'function' || typeof field.setValue !== 'function') {
        return false;
    }
    if (String(field.getValue()) !== rawValue) {
        field.setValue(rawValue);
    }
    return true;
};

const syncExistingWorkspaceDomInPlace = (SB, workspace, dom) => {
    const existingTop = workspace.getTopBlocks(false);
    if (!existingTop.length) {
        return false;
    }
    const xmlTopBlocks = [];
    let variablesNode = null;
    const commentNodes = [];

    for (let i = 0; i < dom.childNodes.length; i++) {
        const node = dom.childNodes[i];
        if (!node || node.nodeType !== 1) continue;
        const name = node.nodeName.toLowerCase();
        if (name === 'variables') {
            variablesNode = node;
        } else if (name === 'block') {
            xmlTopBlocks.push(node);
        } else if (name === 'comment') {
            commentNodes.push(node);
        }
    }

    if (commentNodes.length > 0 || xmlTopBlocks.length !== existingTop.length) {
        return false;
    }

    for (let i = 0; i < xmlTopBlocks.length; i++) {
        const topId = xmlTopBlocks[i].getAttribute('id');
        if (!topId || !workspace.getBlockById(topId)) {
            return false;
        }
    }

    if (variablesNode && SB.Xml && typeof SB.Xml.domToVariables === 'function') {
        const existingVarIds = new Set(workspace.getAllVariables().map(v => v.getId()));
        for (let i = 0; i < variablesNode.children.length; i++) {
            const vNode = variablesNode.children[i];
            const vId = vNode.getAttribute('id');
            if (vId && !existingVarIds.has(vId)) {
                workspace.createVariable(
                    vNode.textContent,
                    vNode.getAttribute('type') || '',
                    vId,
                    vNode.getAttribute('islocal') === 'true',
                    vNode.getAttribute('iscloud') === 'true'
                );
            }
        }
    }

    const stack = [...xmlTopBlocks];
    while (stack.length) {
        const bNode = stack.pop();
        const bId = bNode.getAttribute('id');
        const liveBlock = bId ? workspace.getBlockById(bId) : null;
        if (!liveBlock) {
            return false;
        }
        if (!liveBlock.getParent() && bNode.hasAttribute('x') && bNode.hasAttribute('y')) {
            const nx = parseInt(bNode.getAttribute('x'), 10);
            const ny = parseInt(bNode.getAttribute('y'), 10);
            if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
                const curXY = liveBlock.getRelativeToSurfaceXY();
                const targetX = workspace.RTL ? workspace.getWidth() - nx : nx;
                if (Math.round(curXY.x) !== Math.round(targetX) || Math.round(curXY.y) !== Math.round(ny)) {
                    liveBlock.moveBy(targetX - curXY.x, ny - curXY.y);
                }
            }
        }
        for (let i = 0; i < bNode.childNodes.length; i++) {
            const child = bNode.childNodes[i];
            if (!child || child.nodeType !== 1) continue;
            const tag = child.nodeName.toLowerCase();
            if (tag === 'field' || tag === 'title') {
                const fName = child.getAttribute('name');
                const field = fName && typeof liveBlock.getField === 'function' ?
                    liveBlock.getField(fName) :
                    null;
                if (field && typeof field.getValue === 'function' && typeof field.setValue === 'function') {
                    const nextVal = child.textContent || '';
                    if (String(field.getValue()) !== nextVal) {
                        field.setValue(nextVal);
                    }
                }
            } else if (tag === 'value' || tag === 'statement' || tag === 'next') {
                for (let j = 0; j < child.childNodes.length; j++) {
                    const sub = child.childNodes[j];
                    if (sub && sub.nodeType === 1) {
                        const subTag = sub.nodeName.toLowerCase();
                        if (subTag === 'block' || subTag === 'shadow') {
                            stack.push(sub);
                        }
                    }
                }
            }
        }
    }

    return true;
};

const syncWorkspaceFromXml = (SB, workspace, xmlText, targetId = null) => {
    if (!SB || !workspace || typeof xmlText !== 'string') {
        return false;
    }
    const hasExistingBlocks = workspace.getTopBlocks(false).length > 0;
    const sameTarget = Boolean(targetId && workspace.sqCurrentTargetId_ === targetId);

    if (hasExistingBlocks && (sameTarget || !targetId)) {
        if (workspace.sqLastSyncedXml_ &&
            tryApplySingleFieldDiff(workspace, workspace.sqLastSyncedXml_, xmlText)) {
            workspace.sqLastSyncedXml_ = xmlText;
            workspace.sqCurrentTargetId_ = targetId || workspace.sqCurrentTargetId_;
            return true;
        }
    }

    const dom = SB.Xml.textToDom(xmlText);
    if (hasExistingBlocks && (sameTarget || !targetId)) {
        SB.Events.disable();
        try {
            if (syncExistingWorkspaceDomInPlace(SB, workspace, dom)) {
                workspace.sqLastSyncedXml_ = xmlText;
                workspace.sqCurrentTargetId_ = targetId || workspace.sqCurrentTargetId_;
                return true;
            }
        } finally {
            SB.Events.enable();
        }
    }

    SB.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
    workspace.sqLastSyncedXml_ = xmlText;
    workspace.sqCurrentTargetId_ = targetId;
    return true;
};

const patchWorkspaceScalePerf = SB => {
    if (!SB) return;
    patchFieldTextWidthCache(SB);
    patchBlockSvgGeometryAndRender(SB);
    patchWorkspaceMetricsAndZoom(SB);
    patchIntersectionObserver(SB);
    patchDragSurfaceAndConnections(SB);
    patchXmlAndFlyoutScale(SB);
};

export {
    computeZoomScrollTranslation,
    isToolboxXmlChanged,
    syncWorkspaceFromXml,
    patchWorkspaceScalePerf
};
export default patchWorkspaceScalePerf;

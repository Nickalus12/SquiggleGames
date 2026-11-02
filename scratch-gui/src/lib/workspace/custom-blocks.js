const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_DEFAULTS = ['then', 'and', 'with', 'at', 'by', 'to'];
const PILL_CAPTION_TEXT = 'Drag the colored word into the script under this block.';

const normalizeNameSet = names => {
    const set = new Set();
    if (Array.isArray(names)) {
        for (let i = 0; i < names.length; i++) {
            const trimmed = String(names[i] || '').trim();
            const val = trimmed.toLowerCase();
            if (val) set.add(val);
        }
    }
    return set;
};

const nextProcedureInputName = (kind, existingNames = []) => {
    const used = normalizeNameSet(existingNames);
    if (kind === 'boolean') {
        if (!used.has('yes?')) {
            return 'yes?';
        }
        let idx = 2;
        while (used.has(`yes?${idx}`) || used.has(`yes ${idx}?`)) {
            idx += 1;
        }
        return `yes?${idx}`;
    }

    if (kind === 'label') {
        for (let i = 0; i < LABEL_DEFAULTS.length; i++) {
            const candidate = LABEL_DEFAULTS[i];
            if (!used.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return 'then';
    }

    if (!used.has('amount')) {
        return 'amount';
    }
    let idx = 2;
    while (used.has(`amount${idx}`) || used.has(`amount ${idx}`)) {
        idx += 1;
    }
    return `amount${idx}`;
};

const deduplicateDisplayNames = (names = []) => {
    const seen = new Set();
    const result = [];
    for (let i = 0; i < names.length; i++) {
        const raw = String(names[i] || '').trim() || 'amount';
        let candidate = raw;
        let idx = 2;
        while (seen.has(candidate.toLowerCase())) {
            candidate = `${raw}${idx}`;
            idx += 1;
        }
        seen.add(candidate.toLowerCase());
        result.push(candidate);
    }
    return result;
};

const nextProcedureDefaultName = (existingProcCodes = [], baseName = 'my block') => {
    const cleanBase = String(baseName || 'my block').trim() || 'my block';
    const used = new Set();
    if (Array.isArray(existingProcCodes)) {
        for (let i = 0; i < existingProcCodes.length; i++) {
            const trimmed = String(existingProcCodes[i] || '').trim();
            const raw = trimmed.toLowerCase();
            if (raw) {
                used.add(raw);
                const firstPart = raw.split(/\s+%[snb]/)[0].trim();
                if (firstPart) used.add(firstPart);
            }
        }
    }
    if (!used.has(cleanBase.toLowerCase())) {
        return cleanBase;
    }
    let idx = 2;
    while (used.has(`${cleanBase.toLowerCase()} ${idx}`)) {
        idx += 1;
    }
    return `${cleanBase} ${idx}`;
};

const ensureUniqueProcCode = (procCode, existingProcCodes = []) => {
    const cleanCode = String(procCode || '').trim() || 'my block';
    const used = new Set();
    for (let i = 0; i < existingProcCodes.length; i++) {
        const trimmed = String(existingProcCodes[i] || '').trim();
        const item = trimmed.toLowerCase();
        if (item) used.add(item);
    }
    if (!used.has(cleanCode.toLowerCase())) {
        return cleanCode;
    }
    const markerMatch = cleanCode.match(/^([^%]*?)(\s+%[snb].*)$/);
    const prefix = markerMatch ? (markerMatch[1].trim() || 'my block') : cleanCode;
    const suffix = markerMatch ? markerMatch[2] : '';
    let idx = 2;
    let candidate = `${prefix} ${idx}${suffix}`;
    while (used.has(candidate.toLowerCase())) {
        idx += 1;
        candidate = `${prefix} ${idx}${suffix}`;
    }
    return candidate;
};

const describeProcedurePreview = (procCode = '', displayNames = [], options = {}) => {
    const rawCode = String(procCode || '').trim();
    const parts = rawCode ? rawCode.split(/(?=[^\\]%[nbs])/) : [];
    const tokens = [];
    let argIndex = 0;

    for (let i = 0; i < parts.length; i++) {
        const component = parts[i].trim();
        if (!component) continue;
        let labelText = '';
        if (component.startsWith('%')) {
            const argType = component.slice(1, 2);
            const argName = displayNames[argIndex] || (argType === 'b' ? 'yes?' : 'amount');
            tokens.push({
                type: argType === 'b' ? 'boolean' : 'numberText',
                text: String(argName)
            });
            argIndex += 1;
            labelText = component.slice(2).trim();
        } else {
            labelText = component;
        }
        labelText = labelText.replace(/\\%/g, '%').trim();
        if (labelText) {
            tokens.push({
                type: 'label',
                text: labelText
            });
        }
    }

    if (!tokens.length) {
        tokens.push({
            type: 'label',
            text: 'my block'
        });
    }

    const warp = Boolean(options.warp);
    const returnsValue = Boolean(options.returnsValue);

    return {
        tokens,
        warp,
        returnsValue,
        shape: returnsValue ? 'reporter' : 'command'
    };
};

const collectDeclarationLabelWords = block => {
    const words = [];
    if (!block || !Array.isArray(block.inputList)) return words;
    for (let i = 0; i < block.inputList.length; i++) {
        const input = block.inputList[i];
        if (input && input.fieldRow && input.fieldRow[0] && typeof input.fieldRow[0].getValue === 'function') {
            const text = String(input.fieldRow[0].getValue() || '').trim();
            if (text) words.push(text);
        }
    }
    return words;
};

const isArgumentReporterBlock = block => Boolean(
    block && (
        block.type === 'argument_reporter_string_number' ||
        block.type === 'argument_reporter_boolean'
    )
);

const syncProcedureHatCaption = defineBlock => {
    if (!defineBlock || defineBlock.type !== 'procedures_definition') return false;
    const svgRoot = typeof defineBlock.getSvgRoot === 'function' ? defineBlock.getSvgRoot() : null;
    if (!svgRoot || typeof document === 'undefined') return false;

    const customInput = typeof defineBlock.getInput === 'function' ?
        defineBlock.getInput('custom_block') :
        null;
    const protoBlock = customInput && customInput.connection ?
        customInput.connection.targetBlock() :
        null;
    const hasInputs = Boolean(
        protoBlock &&
        Array.isArray(protoBlock.argumentIds_) &&
        protoBlock.argumentIds_.length > 0
    );

    let hasUsedPill = false;
    if (hasInputs && typeof defineBlock.getDescendants === 'function') {
        const descendants = defineBlock.getDescendants(false);
        for (let i = 0; i < descendants.length; i++) {
            const blk = descendants[i];
            if (isArgumentReporterBlock(blk) && !blk.isShadow() && blk.getParent() !== protoBlock) {
                hasUsedPill = true;
                break;
            }
        }
    }

    const shouldShow = hasInputs && !hasUsedPill;
    if (shouldShow) {
        if (!defineBlock.sqPillCaptionNode_) {
            const textNode = document.createElementNS(SVG_NS, 'text');
            textNode.setAttribute('class', 'blocklyText sq-procedure-pill-caption-text');
            textNode.setAttribute('data-testid', 'sq-procedure-pill-caption');
            textNode.setAttribute('x', '0');
            textNode.setAttribute('y', '-10');
            textNode.textContent = PILL_CAPTION_TEXT;
            defineBlock.sqPillCaptionNode_ = textNode;
        }
        if (defineBlock.sqPillCaptionNode_.parentNode !== svgRoot) {
            svgRoot.appendChild(defineBlock.sqPillCaptionNode_);
        }
        return true;
    }

    if (defineBlock.sqPillCaptionNode_ && defineBlock.sqPillCaptionNode_.parentNode) {
        defineBlock.sqPillCaptionNode_.parentNode.removeChild(defineBlock.sqPillCaptionNode_);
    }
    return false;
};

const syncAllProcedureHatCaptions = workspace => {
    if (!workspace || typeof workspace.getTopBlocks !== 'function') return;
    const topBlocks = workspace.getTopBlocks(false);
    for (let i = 0; i < topBlocks.length; i++) {
        const blk = topBlocks[i];
        if (blk && blk.type === 'procedures_definition') {
            syncProcedureHatCaption(blk);
        }
    }
};

const scrollNewProcedureIntoPalette = (workspace, mutation) => {
    if (!workspace) return false;
    workspace.refreshToolboxSelection_();
    syncAllProcedureHatCaptions(workspace);
    const toolbox = workspace.toolbox_;
    if (toolbox) {
        if (typeof toolbox.selectCategoryById === 'function') {
            toolbox.selectCategoryById('myBlocks');
        }
        if (typeof toolbox.scrollToCategoryById === 'function') {
            toolbox.scrollToCategoryById('myBlocks');
        }
    }

    const procCode = mutation && typeof mutation.getAttribute === 'function' ?
        mutation.getAttribute('proccode') :
        null;
    const flyout = typeof workspace.getFlyout === 'function' ? workspace.getFlyout() : null;
    if (!procCode || !flyout || typeof flyout.getWorkspace !== 'function') {
        return false;
    }

    const flyoutWorkspace = flyout.getWorkspace();
    if (!flyoutWorkspace || typeof flyoutWorkspace.getTopBlocks !== 'function') {
        return false;
    }

    const topBlocks = flyoutWorkspace.getTopBlocks(false);
    let targetBlock = null;
    for (let i = 0; i < topBlocks.length; i++) {
        const blk = topBlocks[i];
        if (blk && blk.type === 'procedures_call' &&
            typeof blk.getProcCode === 'function' &&
            blk.getProcCode() === procCode) {
            targetBlock = blk;
            break;
        }
    }

    if (!targetBlock) return false;

    const xy = targetBlock.getRelativeToSurfaceXY();
    const scale = flyoutWorkspace.scale || 1;
    const blockTopPx = xy.y * scale;
    const blockHeightPx = ((targetBlock.height || 40) + 24) * scale;
    const metrics = typeof flyoutWorkspace.getMetrics === 'function' ? flyoutWorkspace.getMetrics() : null;

    if (metrics && typeof flyout.scrollTo === 'function') {
        const currentScrollTop = -flyoutWorkspace.scrollY;
        const viewHeight = metrics.viewHeight || 400;
        if (blockTopPx + blockHeightPx > currentScrollTop + viewHeight || blockTopPx < currentScrollTop) {
            const desiredScroll = Math.max(0, blockTopPx - Math.round(viewHeight * 0.28));
            flyout.scrollTo(desiredScroll);
        }
    }

    const svgRoot = typeof targetBlock.getSvgRoot === 'function' ? targetBlock.getSvgRoot() : null;
    if (svgRoot && svgRoot.classList) {
        svgRoot.classList.remove('sq-custom-block-landed');
        svgRoot.classList.add('sq-custom-block-landed');
        setTimeout(() => {
            if (svgRoot.classList) {
                svgRoot.classList.remove('sq-custom-block-landed');
            }
        }, 1200);
    }

    return true;
};

const attachStarterReturnBlock = (SB, workspace, defineBlock) => {
    if (!SB || !workspace || !defineBlock || !defineBlock.nextConnection) return;
    if (defineBlock.nextConnection.isConnected()) return;
    const returnXmlText =
        '<xml><block type="procedures_return">' +
        '<value name="VALUE"><shadow type="text"><field name="TEXT">1</field></shadow></value>' +
        '</block></xml>';
    const returnDom = SB.Xml.textToDom(returnXmlText).firstChild;
    const returnBlock = SB.Xml.domToBlock(returnDom, workspace);
    if (returnBlock && returnBlock.previousConnection) {
        defineBlock.nextConnection.connect(returnBlock.previousConnection);
    }
    if (typeof workspace.enableProcedureReturns === 'function') {
        workspace.enableProcedureReturns();
    }
};

const applyCustomProcedureMessages = SB => {
    if (!SB || !SB.Msg) return;
    SB.Msg.NEW_PROCEDURE = 'Make a block';
    SB.Msg.PROCEDURES_DEFINITION = 'how to %1';
    SB.Msg.PROCEDURE_DEFAULT_NAME = 'my block';
    SB.Msg.SHOW_PROCEDURE_DEFINITION = 'Show how this block works';
    SB.Msg.PROCEDURE_USED = 'This block is still used. Take it off the other scripts first.';
    SB.Msg.PROCEDURES_RETURN = 'give back %1';
    SB.Msg.PROCEDURES_TO_REPORTER = 'Use the round shape';
    SB.Msg.PROCEDURES_TO_STATEMENT = 'Use the stack shape';
    SB.Msg.PROCEDURES_DOCS = 'How to give an answer';
};

const collectExistingProcCodes = (SB, workspace, excludeProtoBlock = null) => {
    if (!SB || !SB.Procedures || !workspace || typeof workspace.getTopBlocks !== 'function') {
        return [];
    }
    const codes = [];
    const topBlocks = workspace.getTopBlocks(false);
    for (let i = 0; i < topBlocks.length; i++) {
        const block = topBlocks[i];
        if (block && block.type === SB.PROCEDURES_DEFINITION_BLOCK_TYPE) {
            const input = block.getInput('custom_block');
            const proto = input && input.connection ? input.connection.targetBlock() : null;
            if (proto && proto !== excludeProtoBlock && typeof proto.getProcCode === 'function') {
                codes.push(proto.getProcCode());
            }
        }
    }
    return codes;
};

const patchCustomBlocks = SB => {
    if (!SB || !SB.Procedures || SB.Procedures.sqCustomBlocksPatched_) {
        return;
    }
    SB.Procedures.sqCustomBlocksPatched_ = true;
    SB.Procedures.DEFAULT_ENABLE_RETURNS = false;

    applyCustomProcedureMessages(SB);
    if (SB.ScratchMsgs && typeof SB.ScratchMsgs.setLocale === 'function' && !SB.ScratchMsgs.sqLocalePatched_) {
        SB.ScratchMsgs.sqLocalePatched_ = true;
        const origSetLocale = SB.ScratchMsgs.setLocale;
        SB.ScratchMsgs.setLocale = function (locale) {
            const res = origSetLocale.call(this, locale);
            applyCustomProcedureMessages(SB);
            return res;
        };
    }

    const utils = SB.ScratchBlocks && SB.ScratchBlocks.ProcedureUtils;
    const declBlock = SB.Blocks && SB.Blocks.procedures_declaration;
    if (utils && declBlock) {
        utils.addStringNumberExternal = function () {
            SB.WidgetDiv.hide(true);
            const nextName = nextProcedureInputName('numberText', this.displayNames_);
            this.procCode_ = `${this.procCode_} %s`;
            this.displayNames_.push(nextName);
            this.argumentIds_.push(SB.utils.genUid());
            this.argumentDefaults_.push('');
            this.updateDisplay_();
            this.focusLastEditor_();
        };

        utils.addBooleanExternal = function () {
            SB.WidgetDiv.hide(true);
            const nextName = nextProcedureInputName('boolean', this.displayNames_);
            this.procCode_ = `${this.procCode_} %b`;
            this.displayNames_.push(nextName);
            this.argumentIds_.push(SB.utils.genUid());
            this.argumentDefaults_.push('false');
            this.updateDisplay_();
            this.focusLastEditor_();
        };

        utils.addLabelExternal = function () {
            SB.WidgetDiv.hide(true);
            const existingLabels = collectDeclarationLabelWords(this);
            const nextLabel = nextProcedureInputName('label', existingLabels);
            this.procCode_ = `${this.procCode_} ${nextLabel}`;
            this.updateDisplay_();
            this.focusLastEditor_();
        };

        const origDeclMutationToDom = utils.declarationMutationToDom || declBlock.mutationToDom;
        if (typeof origDeclMutationToDom === 'function') {
            utils.declarationMutationToDom = function (optGenerateShadows) {
                if (optGenerateShadows && Array.isArray(this.displayNames_)) {
                    this.displayNames_ = deduplicateDisplayNames(this.displayNames_);
                }
                const container = origDeclMutationToDom.call(this, optGenerateShadows);
                if (optGenerateShadows && container && Array.isArray(this.displayNames_)) {
                    container.setAttribute('argumentnames', JSON.stringify(this.displayNames_));
                }
                return container;
            };
            declBlock.mutationToDom = utils.declarationMutationToDom;
        }

        declBlock.addStringNumberExternal = utils.addStringNumberExternal;
        declBlock.addBooleanExternal = utils.addBooleanExternal;
        declBlock.addLabelExternal = utils.addLabelExternal;
    }

    SB.Procedures.showProcedureDefCallback_ = function (block) {
        if (!block) return false;
        const ws = block.workspace && block.workspace.isFlyout ?
            block.workspace.targetWorkspace :
            block.workspace;
        if (!ws || typeof block.getProcCode !== 'function') return false;
        const procCode = block.getProcCode();
        const defBlock = procCode ? SB.Procedures.getDefineBlock(procCode, ws) : null;
        if (!defBlock) return false;
        if (typeof defBlock.select === 'function') {
            defBlock.select();
        }
        if (typeof ws.centerOnBlock === 'function') {
            ws.centerOnBlock(defBlock.id);
        }
        return true;
    };

    SB.Procedures.createProcedureDefCallback_ = function (workspace) {
        applyCustomProcedureMessages(SB);
        const existingCodes = collectExistingProcCodes(SB, workspace, null);
        const defaultName = nextProcedureDefaultName(
            existingCodes,
            (SB.Msg && SB.Msg.PROCEDURE_DEFAULT_NAME) || 'my block'
        );
        const mutation = SB.Procedures.newProcedureMutation();
        mutation.setAttribute('proccode', defaultName);
        mutation.setAttribute('isnew', 'true');
        SB.Procedures.externalProcedureDefCallback(
            mutation,
            SB.Procedures.createProcedureCallbackFactory_(workspace)
        );
    };

    const origCreateFactory = SB.Procedures.createProcedureCallbackFactory_;
    if (typeof origCreateFactory === 'function') {
        SB.Procedures.createProcedureCallbackFactory_ = function (workspace) {
            const baseCallback = origCreateFactory.call(this, workspace);
            return function (mutation) {
                if (!mutation) return;
                const existingCodes = collectExistingProcCodes(SB, workspace, null);
                const rawProcCode = mutation.getAttribute('proccode') || 'my block';
                const uniqueProcCode = ensureUniqueProcCode(rawProcCode, existingCodes);
                mutation.setAttribute('proccode', uniqueProcCode);

                try {
                    const parsedNames = JSON.parse(mutation.getAttribute('argumentnames') || '[]');
                    if (Array.isArray(parsedNames)) {
                        mutation.setAttribute('argumentnames', JSON.stringify(deduplicateDisplayNames(parsedNames)));
                    }
                } catch (e) {
                    void e;
                }

                const wantsReporter = mutation.getAttribute('returnsvalue') === 'true';
                baseCallback(mutation);
                const defineBlock = uniqueProcCode ? SB.Procedures.getDefineBlock(uniqueProcCode, workspace) : null;
                if (defineBlock) {
                    if (wantsReporter) {
                        SB.Events.setGroup(true);
                        try {
                            attachStarterReturnBlock(SB, workspace, defineBlock);
                        } finally {
                            SB.Events.setGroup(false);
                        }
                    }
                    syncProcedureHatCaption(defineBlock);
                }
            };
        };
    }

    const origEditCallback = SB.Procedures.editProcedureCallback_;
    if (typeof origEditCallback === 'function') {
        SB.Procedures.editProcedureCallback_ = function (block) {
            const ws = block && block.workspace && block.workspace.isFlyout ?
                block.workspace.targetWorkspace :
                (block && block.workspace);
            let protoBlock = block;
            if (block && block.type === SB.PROCEDURES_DEFINITION_BLOCK_TYPE) {
                const input = block.getInput('custom_block');
                protoBlock = input && input.connection ? input.connection.targetBlock() : null;
            } else if (block && block.type === SB.PROCEDURES_CALL_BLOCK_TYPE && ws) {
                protoBlock = SB.Procedures.getPrototypeBlock(block.getProcCode(), ws);
            }
            if (!protoBlock) {
                return origEditCallback.call(this, block);
            }
            const mutation = protoBlock.mutationToDom();
            const procCode = protoBlock.getProcCode();
            const returnType = (ws && procCode) ?
                SB.Procedures.getProcedureReturnType(procCode, ws) :
                SB.PROCEDURES_CALL_TYPE_STATEMENT;
            if (returnType !== SB.PROCEDURES_CALL_TYPE_STATEMENT) {
                mutation.setAttribute('returnsvalue', 'true');
            }
            mutation.setAttribute('isnew', 'false');
            const baseEditCb = SB.Procedures.editProcedureCallbackFactory_(protoBlock);
            SB.Procedures.externalProcedureDefCallback(mutation, updatedMutation => {
                if (!updatedMutation) return;
                const existingCodes = collectExistingProcCodes(SB, ws, protoBlock);
                const rawProcCode = updatedMutation.getAttribute('proccode') || 'my block';
                const uniqueProcCode = ensureUniqueProcCode(rawProcCode, existingCodes);
                updatedMutation.setAttribute('proccode', uniqueProcCode);

                try {
                    const parsedNames = JSON.parse(updatedMutation.getAttribute('argumentnames') || '[]');
                    if (Array.isArray(parsedNames)) {
                        updatedMutation.setAttribute(
                            'argumentnames',
                            JSON.stringify(deduplicateDisplayNames(parsedNames))
                        );
                    }
                } catch (e) {
                    void e;
                }

                baseEditCb(updatedMutation);
                if (ws) {
                    const defineBlock = uniqueProcCode ? SB.Procedures.getDefineBlock(uniqueProcCode, ws) : null;
                    if (defineBlock) {
                        if (updatedMutation.getAttribute('returnsvalue') === 'true' &&
                            SB.Procedures.getBlockReturnType(defineBlock) === SB.PROCEDURES_CALL_TYPE_STATEMENT) {
                            SB.Events.setGroup(true);
                            try {
                                attachStarterReturnBlock(SB, ws, defineBlock);
                            } finally {
                                SB.Events.setGroup(false);
                            }
                        }
                        syncProcedureHatCaption(defineBlock);
                    }
                }
            });
        };
    }

    if (SB.BlockSvg && SB.BlockSvg.prototype && !SB.BlockSvg.prototype.sqCustomCaptionPatched_) {
        const proto = SB.BlockSvg.prototype;
        proto.sqCustomCaptionPatched_ = true;

        const origSetParent = proto.setParent;
        proto.setParent = function (newParent) {
            const oldRoot = typeof this.getRootBlock === 'function' ? this.getRootBlock() : null;
            const res = origSetParent.call(this, newParent);
            if (this.type === 'procedures_prototype' || this.type === 'procedures_definition') {
                const root = typeof this.getRootBlock === 'function' ? this.getRootBlock() : null;
                if (root && root.type === 'procedures_definition') {
                    syncProcedureHatCaption(root);
                }
            } else if (isArgumentReporterBlock(this)) {
                if (oldRoot && oldRoot.type === 'procedures_definition') {
                    syncProcedureHatCaption(oldRoot);
                }
                const newRoot = typeof this.getRootBlock === 'function' ? this.getRootBlock() : null;
                if (newRoot && newRoot.type === 'procedures_definition') {
                    syncProcedureHatCaption(newRoot);
                }
            }
            return res;
        };

        const origDispose = proto.dispose;
        proto.dispose = function (healStack, animate) {
            const oldRoot = isArgumentReporterBlock(this) && typeof this.getRootBlock === 'function' ?
                this.getRootBlock() :
                null;
            const res = origDispose.call(this, healStack, animate);
            if (oldRoot && oldRoot.workspace && oldRoot.type === 'procedures_definition') {
                syncProcedureHatCaption(oldRoot);
            }
            return res;
        };
    }
};

export {
    nextProcedureInputName,
    deduplicateDisplayNames,
    nextProcedureDefaultName,
    ensureUniqueProcCode,
    describeProcedurePreview,
    syncProcedureHatCaption,
    syncAllProcedureHatCaptions,
    scrollNewProcedureIntoPalette,
    patchCustomBlocks
};

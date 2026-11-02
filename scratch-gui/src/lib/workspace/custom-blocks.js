const NUMBER_TEXT_DEFAULTS = ['amount', 'steps', 'speed', 'value', 'text', 'count'];
const BOOLEAN_DEFAULTS = ['ready?', 'active?', 'touching?', 'done?', 'moving?'];
const LABEL_DEFAULTS = ['with', 'and', 'at', 'by', 'to'];

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
        for (let i = 0; i < BOOLEAN_DEFAULTS.length; i++) {
            const candidate = BOOLEAN_DEFAULTS[i];
            if (!used.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
        let idx = 2;
        while (used.has(`ready ${idx}?`)) {
            idx += 1;
        }
        return `ready ${idx}?`;
    }

    if (kind === 'label') {
        for (let i = 0; i < LABEL_DEFAULTS.length; i++) {
            const candidate = LABEL_DEFAULTS[i];
            if (!used.has(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return 'with';
    }

    for (let i = 0; i < NUMBER_TEXT_DEFAULTS.length; i++) {
        const candidate = NUMBER_TEXT_DEFAULTS[i];
        if (!used.has(candidate.toLowerCase())) {
            return candidate;
        }
    }
    let idx = 2;
    while (used.has(`amount ${idx}`)) {
        idx += 1;
    }
    return `amount ${idx}`;
};

const nextProcedureDefaultName = (existingProcCodes = [], baseName = 'do something') => {
    const cleanBase = String(baseName || 'do something').trim() || 'do something';
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
            const argName = displayNames[argIndex] || (argType === 'b' ? 'ready?' : 'amount');
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
            text: 'do something'
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

const scrollNewProcedureIntoPalette = (workspace, mutation) => {
    if (!workspace) return false;
    workspace.refreshToolboxSelection_();
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

const patchCustomBlocks = SB => {
    if (!SB || !SB.Procedures || SB.Procedures.sqCustomBlocksPatched_) {
        return;
    }
    SB.Procedures.sqCustomBlocksPatched_ = true;
    SB.Procedures.DEFAULT_ENABLE_RETURNS = true;

    const origFlyoutCategory = SB.Procedures.flyoutCategory;
    if (typeof origFlyoutCategory === 'function') {
        SB.Procedures.flyoutCategory = function (workspace) {
            const xmlList = origFlyoutCategory.call(this, workspace);
            if (!Array.isArray(xmlList)) return xmlList;
            return xmlList.filter(node => {
                if (!node || typeof node.getAttribute !== 'function') return true;
                return node.getAttribute('callbackkey') !== 'OPEN_RETURN_DOCS';
            });
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

        declBlock.addStringNumberExternal = utils.addStringNumberExternal;
        declBlock.addBooleanExternal = utils.addBooleanExternal;
        declBlock.addLabelExternal = utils.addLabelExternal;
    }

    SB.Procedures.createProcedureDefCallback_ = function (workspace) {
        const existingMutations = SB.Procedures.allProcedureMutations(workspace);
        const existingCodes = existingMutations.map(m => m.getAttribute('proccode') || '');
        const defaultName = nextProcedureDefaultName(
            existingCodes,
            (SB.Msg && SB.Msg.PROCEDURE_DEFAULT_NAME) || 'do something'
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
                const wantsReporter = mutation.getAttribute('returnsvalue') === 'true';
                baseCallback(mutation);
                const procCode = mutation.getAttribute('proccode');
                const defineBlock = procCode ? SB.Procedures.getDefineBlock(procCode, workspace) : null;
                if (wantsReporter && defineBlock) {
                    SB.Events.setGroup(true);
                    try {
                        attachStarterReturnBlock(SB, workspace, defineBlock);
                    } finally {
                        SB.Events.setGroup(false);
                    }
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
                baseEditCb(updatedMutation);
                if (updatedMutation.getAttribute('returnsvalue') === 'true' && ws) {
                    const updatedCode = updatedMutation.getAttribute('proccode');
                    const defineBlock = updatedCode ? SB.Procedures.getDefineBlock(updatedCode, ws) : null;
                    if (defineBlock &&
                        SB.Procedures.getBlockReturnType(defineBlock) === SB.PROCEDURES_CALL_TYPE_STATEMENT) {
                        SB.Events.setGroup(true);
                        try {
                            attachStarterReturnBlock(SB, ws, defineBlock);
                        } finally {
                            SB.Events.setGroup(false);
                        }
                    }
                }
            });
        };
    }
};

export {
    nextProcedureInputName,
    nextProcedureDefaultName,
    describeProcedurePreview,
    scrollNewProcedureIntoPalette,
    patchCustomBlocks
};

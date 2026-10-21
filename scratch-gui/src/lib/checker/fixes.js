import {descendants} from './model.js';
import {getOutlineWorkspace} from '../annotations/workspace-ref.js';

const WAIT_MS = 2000;
const GLOW_MS = 1200;
const GAP = 48;

const FIXES = Object.freeze([
    'add-receiver',
    'remove-calls',
    'delete-variable',
    'clean-up',
    'add-wait',
    'move-to-rules',
    'create-scene',
    'create-level',
    'create-tile'
]);

const WORLD_FIXES = Object.freeze({
    'create-scene': 'createScene',
    'create-level': 'createLevel',
    'create-tile': 'createTile'
});

const escapeXml = text => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const receiverXml = (name, broadcastId) => '<xml xmlns="http://www.w3.org/1999/xhtml">' +
    '<block type="event_whenbroadcastreceived">' +
    `<field name="BROADCAST_OPTION" id="${escapeXml(broadcastId || '')}" variabletype="broadcast_msg">` +
    `${escapeXml(name)}</field></block></xml>`;

const waitXml = seconds => '<xml xmlns="http://www.w3.org/1999/xhtml">' +
    '<block type="control_wait"><value name="DURATION"><shadow type="math_positive_number">' +
    `<field name="NUM">${escapeXml(seconds)}</field></shadow></value></block></xml>`;

const createFixer = options => {
    const vm = options.vm;
    const win = typeof options.win === 'undefined' ? (typeof window === 'undefined' ? null : window) : options.win;
    const getWorkspace = options.getWorkspace || getOutlineWorkspace;
    const getScratchBlocks = options.getScratchBlocks || (() => (win && win.ScratchBlocks) || null);
    const now = options.now || (() => Date.now());
    const nextFrame = options.nextFrame || (fn => (win && typeof win.requestAnimationFrame === 'function' ?
        win.requestAnimationFrame(fn) :
        setTimeout(fn, 16)));
    const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const waitMs = options.waitMs || WAIT_MS;

    const waitFor = test => new Promise(resolve => {
        const start = now();
        const poll = () => {
            const found = test();
            if (found) return resolve(found);
            if (now() - start >= waitMs) return resolve(null);
            nextFrame(poll);
        };
        poll();
    });

    const editing = targetId => !targetId || (vm.editingTarget && vm.editingTarget.id === targetId);

    const focusTarget = targetId => {
        if (!targetId || editing(targetId)) return Promise.resolve(true);
        if (!vm.runtime.getTargetById(targetId)) return Promise.resolve(false);
        vm.setEditingTarget(targetId);
        return waitFor(() => editing(targetId) && getWorkspace()).then(Boolean);
    };

    const blockOnScreen = blockId => waitFor(() => {
        const workspace = getWorkspace();
        return workspace && workspace.getBlockById(blockId);
    });

    const spotlight = blockId => {
        const workspace = getWorkspace();
        if (!workspace || !workspace.getBlockById(blockId)) return false;
        workspace.centerOnBlock(blockId);
        workspace.glowBlock(blockId, true);
        setTimer(() => {
            const current = getWorkspace();
            if (current && current.getBlockById(blockId)) current.glowBlock(blockId, false);
        }, GLOW_MS);
        return true;
    };

    const showMe = item => focusTarget(item.targetId).then(ready => {
        if (!ready) return false;
        if (!item.blockId) return true;
        return blockOnScreen(item.blockId).then(block => (block ? spotlight(item.blockId) : false));
    });

    const grouped = (ScratchBlocks, fn) => {
        ScratchBlocks.Events.setGroup(true);
        try {
            return fn();
        } finally {
            ScratchBlocks.Events.setGroup(false);
        }
    };

    const placeBelow = (workspace, block) => {
        const box = workspace.getBlocksBoundingBox();
        const empty = !box || (!box.width && !box.height);
        const x = empty ? 0 : box.x;
        const y = empty ? 0 : box.y + box.height + GAP;
        const at = block.getRelativeToSurfaceXY();
        block.moveBy(x - at.x, y - at.y);
    };

    const addReceiver = (data, ScratchBlocks) => waitFor(getWorkspace).then(workspace => {
        if (!workspace) return false;
        const id = grouped(ScratchBlocks, () => {
            const dom = ScratchBlocks.Xml.textToDom(receiverXml(data.name, data.broadcastId)).firstChild;
            const block = ScratchBlocks.Xml.domToBlock(dom, workspace);
            placeBelow(workspace, block);
            return block.id;
        });
        return spotlight(id);
    });

    const addWait = (data, ScratchBlocks) => blockOnScreen(data.afterBlockId).then(after => {
        if (!after || !after.nextConnection) return false;
        const workspace = getWorkspace();
        const id = grouped(ScratchBlocks, () => {
            const dom = ScratchBlocks.Xml.textToDom(waitXml(data.seconds)).firstChild;
            const wait = ScratchBlocks.Xml.domToBlock(dom, workspace);
            after.nextConnection.connect(wait.previousConnection);
            return wait.id;
        });
        return spotlight(id);
    });

    const removeCalls = (data, ScratchBlocks) => blockOnScreen(data.blockIds[0]).then(first => {
        if (!first) return false;
        const workspace = getWorkspace();
        grouped(ScratchBlocks, () => {
            data.blockIds.forEach(id => {
                const block = workspace.getBlockById(id);
                if (block) block.dispose(true);
            });
        });
        return true;
    });

    const cleanUp = data => blockOnScreen(data.blockIds[0]).then(first => {
        if (!first) return false;
        getWorkspace().cleanUp();
        return true;
    });

    const deleteVariable = data => waitFor(() => {
        const workspace = getWorkspace();
        return workspace && workspace.getVariableById(data.variableId) && workspace;
    }).then(workspace => {
        if (!workspace) return false;
        workspace.deleteVariableById(data.variableId);
        return true;
    });

    const moveToRules = (data, ScratchBlocks) => {
        const source = vm.runtime.getTargetById(data.targetId);
        if (!source || !vm.runtime.getTargetById(data.rulesTargetId)) return Promise.resolve(false);
        const blocks = source.blocks._blocks;
        const stack = descendants(blocks, data.blockId).map(block => JSON.parse(JSON.stringify(block)));
        if (!stack.length) return Promise.resolve(false);
        return blockOnScreen(data.blockId).then(top => {
            if (!top) return false;
            return Promise.resolve(vm.shareBlocksToTarget(stack, data.rulesTargetId, data.targetId)).then(() => {
                const block = getWorkspace().getBlockById(data.blockId);
                if (block) grouped(ScratchBlocks, () => block.dispose(false));
                return true;
            });
        });
    };

    const worldFix = (item, data) => {
        const seam = win && win.SquiggleWorld;
        const method = seam && seam[WORLD_FIXES[item.fix]];
        if (typeof method !== 'function') return Promise.resolve(false);
        return Promise.resolve(method.call(seam, data.name)).then(() => true, () => false);
    };

    const canFix = item => !!(item && item.fix && item.fixData && FIXES.indexOf(item.fix) !== -1);

    const applyFix = item => {
        if (!canFix(item)) return Promise.resolve(false);
        const data = item.fixData;
        if (WORLD_FIXES[item.fix]) return worldFix(item, data);
        const ScratchBlocks = getScratchBlocks();
        if (!ScratchBlocks) return Promise.resolve(false);
        return focusTarget(data.targetId).then(ready => {
            if (!ready) return false;
            switch (item.fix) {
            case 'add-receiver': return addReceiver(data, ScratchBlocks);
            case 'add-wait': return addWait(data, ScratchBlocks);
            case 'remove-calls': return removeCalls(data, ScratchBlocks);
            case 'clean-up': return cleanUp(data);
            case 'delete-variable': return deleteVariable(data);
            case 'move-to-rules': return moveToRules(data, ScratchBlocks);
            default: return false;
            }
        });
    };

    return {showMe, applyFix, canFix};
};

export {
    FIXES,
    GLOW_MS,
    escapeXml,
    receiverXml,
    waitXml,
    createFixer
};

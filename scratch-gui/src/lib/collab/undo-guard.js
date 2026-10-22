const idsOf = e => {
    const out = [];
    if (e && e.blockId) out.push(e.blockId);
    if (e && Array.isArray(e.ids)) out.push(...e.ids);
    return out;
};

export const UNDO_BLOCK_TEXT = '✋ A friend changed that block after you. Press undo again to skip that step.';
export const UNDO_SKIP_TEXT = '⏭️ Skipped a step a friend changed. Undo goes on from before it.';

export const createUndoGuard = ({now = () => Date.now(), window = 4000} = {}) => {
    const remoteTouched = new Map();
    let pending = null;
    const noteLocal = e => {
        if (e && typeof e === 'object' && !e._sqAt) e._sqAt = now();
    };
    const noteRemote = json => {
        const at = now();
        for (const id of idsOf(json)) remoteTouched.set(id, at);
    };
    const conflict = events => {
        for (const e of events) {
            if (!e || !e._sqAt) continue;
            for (const id of idsOf(e)) {
                const at = remoteTouched.get(id);
                if (at && at > e._sqAt) return id;
            }
        }
        return null;
    };
    const topGroup = stack => {
        if (!stack || !stack.length) return [];
        const last = stack[stack.length - 1];
        const group = [last];
        if (last && last.group) {
            for (let i = stack.length - 2; i >= 0 && stack[i].group === last.group; i--) group.push(stack[i]);
        }
        return group;
    };
    const decide = stack => {
        const group = topGroup(stack);
        const id = conflict(group);
        if (!id) {
            pending = null;
            return {action: 'undo'};
        }
        const t = now();
        if (pending && pending.id === id && pending.top === group[0] && t - pending.at <= window) {
            stack.splice(stack.length - group.length, group.length);
            pending = null;
            return {action: 'skip', id, skipped: group.length};
        }
        pending = {id, top: group[0], at: t};
        return {action: 'block', id};
    };
    const forget = () => {
        remoteTouched.clear();
        pending = null;
    };
    return {noteLocal, noteRemote, decide, topGroup, conflict, forget};
};

export const installUndoGuard = (workspace, guard, {onBlock, onSkip} = {}) => {
    if (!workspace || typeof workspace.undo !== 'function' || workspace._sqUndoGuard) return workspace;
    const original = workspace.undo.bind(workspace);
    workspace.undo = redo => {
        if (!redo && Array.isArray(workspace.undoStack_)) {
            const d = guard.decide(workspace.undoStack_);
            if (d.action === 'block') {
                if (onBlock) onBlock(d);
                return;
            }
            if (d.action === 'skip') {
                if (onSkip) onSkip(d);
                if (!workspace.undoStack_.length) return;
            }
        }
        original(redo);
    };
    workspace._sqUndoGuard = guard;
    return workspace;
};

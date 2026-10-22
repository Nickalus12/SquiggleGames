process.removeAllListeners('warning');

const {createUndoGuard, installUndoGuard, UNDO_BLOCK_TEXT, UNDO_SKIP_TEXT} = await import('./undo-guard.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${typeof detail === 'undefined' ? '' : ` : ${JSON.stringify(detail)}`}`);
    }
};

let clock = 1000;
const now = () => clock;
const tick = ms => {
    clock += ms;
};

const fakeWorkspace = () => {
    const ws = {undoStack_: [], redoStack_: [], ran: []};
    ws.undo = redo => {
        const stack = redo ? ws.redoStack_ : ws.undoStack_;
        const other = redo ? ws.undoStack_ : ws.redoStack_;
        const first = stack.pop();
        if (!first) return;
        const group = [first];
        while (first.group && stack.length && stack[stack.length - 1].group === first.group) group.push(stack.pop());
        for (const e of group) {
            ws.ran.push({id: e.blockId || e.ids, redo: !!redo});
            other.push(e);
        }
    };
    return ws;
};

const event = (blockId, group, extra = {}) => ({type: 'move', blockId, group, ...extra});

const setup = () => {
    const guard = createUndoGuard({now, window: 4000});
    const ws = fakeWorkspace();
    const toasts = [];
    installUndoGuard(ws, guard, {
        onBlock: () => toasts.push(UNDO_BLOCK_TEXT),
        onSkip: () => toasts.push(UNDO_SKIP_TEXT)
    });
    const local = (blockId, group) => {
        const e = event(blockId, group);
        guard.noteLocal(e);
        ws.undoStack_.push(e);
        return e;
    };
    return {guard, ws, toasts, local};
};

{
    const {ws, toasts, local} = setup();
    local('a', 'g1');
    tick(10);
    ws.undo(false);
    ok('undo with no remote touch runs the original undo', ws.ran.length === 1 && ws.ran[0].id === 'a' && toasts.length === 0, {ran: ws.ran, toasts});
}

{
    const {guard, ws, toasts, local} = setup();
    local('a', 'g1');
    tick(10);
    local('b', 'g2');
    tick(10);
    guard.noteRemote({type: 'change', blockId: 'b'});
    tick(10);
    ws.undo(false);
    ok('a block a friend changed afterward is blocked on the first press', ws.ran.length === 0 && toasts[0] === UNDO_BLOCK_TEXT && ws.undoStack_.length === 2, {ran: ws.ran, toasts});
    tick(500);
    ws.undo(false);
    ok('the second press skips that step and undoes the one before it', toasts[1] === UNDO_SKIP_TEXT && ws.ran.length === 1 && ws.ran[0].id === 'a' && ws.undoStack_.length === 0 && ws.redoStack_.length === 1, {ran: ws.ran, toasts, undo: ws.undoStack_.length});
}

{
    const {guard, ws, toasts, local} = setup();
    guard.noteRemote({type: 'change', blockId: 'a'});
    tick(10);
    local('a', 'g1');
    tick(10);
    ws.undo(false);
    ok('a remote touch before the local edit does not block', ws.ran.length === 1 && toasts.length === 0, {ran: ws.ran, toasts});
}

{
    const {guard, ws, toasts, local} = setup();
    local('a', 'g1');
    tick(10);
    guard.noteRemote({type: 'change', blockId: 'a'});
    tick(10);
    ws.undo(false);
    tick(10000);
    ws.undo(false);
    ok('a second press after the window blocks again instead of skipping', toasts.length === 2 && toasts[1] === UNDO_BLOCK_TEXT && ws.ran.length === 0, {toasts, ran: ws.ran});
}

{
    const {guard, ws, toasts, local} = setup();
    const e1 = local('a', 'g1');
    local('c', 'g1');
    tick(10);
    guard.noteRemote({type: 'delete', ids: ['c', 'd']});
    tick(10);
    ws.undo(false);
    ok('ids on a remote delete count, and a whole group is held together', toasts[0] === UNDO_BLOCK_TEXT && ws.undoStack_.length === 2 && typeof e1._sqAt === 'number', {toasts, at: e1._sqAt});
    tick(100);
    ws.undo(false);
    ok('skipping drops the whole group', ws.undoStack_.length === 0 && ws.ran.length === 0 && toasts[1] === UNDO_SKIP_TEXT, {undo: ws.undoStack_.length, ran: ws.ran});
}

{
    const {guard, ws, toasts, local} = setup();
    const e = local('a', 'g1');
    tick(10);
    guard.noteRemote({type: 'change', blockId: 'a'});
    ws.undo(false);
    ws.undoStack_.length = 0;
    ws.redoStack_.push(e);
    ws.undo(true);
    ok('redo is never blocked', ws.ran.length === 1 && ws.ran[0].redo === true && toasts.length === 1, {ran: ws.ran, toasts});
}

{
    const {ws} = setup();
    const before = ws.undo;
    installUndoGuard(ws, createUndoGuard({now}), {});
    ok('installing twice keeps the first wrapper', ws.undo === before);
    ok('installing on a workspace without undo is harmless', installUndoGuard({}, createUndoGuard({now})) !== null);
}

{
    const guard = createUndoGuard({now});
    guard.noteRemote({type: 'change', blockId: 'z'});
    guard.forget();
    const e = event('z', 'g');
    guard.noteLocal(e);
    tick(10);
    ok('forget clears remote touches', guard.conflict([e]) === null);
}

console.log(`undo-guard: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

import {itemText} from '../../lib/checker/messages.js';
import {commandMessages, uiMessages} from './messages.js';

const KIND_ORDER = Object.freeze([
    'command', 'checker', 'block', 'myblock', 'variable', 'sprite', 'costume', 'sound', 'scene', 'level', 'peer'
]);

const KIND_BOOST = Object.freeze({
    command: 3,
    checker: 2,
    sprite: 2,
    myblock: 1,
    variable: 1,
    block: 0
});

const call = (fn, fallback) => {
    try {
        return typeof fn === 'function' ? fn() : fallback;
    } catch (e) {
        return fallback;
    }
};

const escapeXml = text => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const readableProccode = code => String(code || '')
    .replace(/%n/g, '()')
    .replace(/%s/g, '()')
    .replace(/%b/g, '<>')
    .replace(/\s+/g, ' ')
    .trim();

const viewCentre = workspace => {
    const metrics = workspace.getMetrics();
    const scale = workspace.scale || 1;
    return {
        x: (metrics.viewLeft + (metrics.viewWidth / 2)) / scale,
        y: (metrics.viewTop + (metrics.viewHeight / 2)) / scale
    };
};

const insertDom = (env, dom) => {
    const {ScratchBlocks, workspace} = env;
    if (!ScratchBlocks || !workspace || !dom) return false;
    const selected = ScratchBlocks.selected && ScratchBlocks.selected.workspace === workspace ?
        ScratchBlocks.selected :
        null;
    ScratchBlocks.Events.setGroup(true);
    let block = null;
    try {
        block = ScratchBlocks.Xml.domToBlock(dom, workspace);
        const under = selected && selected.nextConnection && block.previousConnection &&
            !selected.nextConnection.isConnected();
        if (under) {
            selected.nextConnection.connect(block.previousConnection);
        } else {
            const centre = viewCentre(workspace);
            const at = block.getRelativeToSurfaceXY();
            block.moveBy(centre.x - at.x, centre.y - at.y);
        }
    } finally {
        ScratchBlocks.Events.setGroup(false);
    }
    if (block && typeof block.select === 'function') block.select();
    return true;
};

const xmlDom = (env, xml) => {
    const parsed = env.ScratchBlocks.Xml.textToDom(`<xml xmlns="http://www.w3.org/1999/xhtml">${xml}</xml>`);
    return parsed.firstChild;
};

const commandItems = env => {
    const {intl, vm, workspace, actions} = env;
    const text = key => intl.formatMessage(commandMessages[key]);
    const list = [
        {key: 'greenFlag', keywords: ['run', 'play', 'go'], run: () => vm.greenFlag()},
        {key: 'stop', keywords: ['halt'], run: () => vm.stopAll()},
        {key: 'checker', keywords: ['problems', 'errors', 'lint'], run: actions.openChecker},
        {key: 'focus', keywords: ['zen', 'fullscreen', 'picture'], run: actions.toggleFocus},
        {key: 'codeTab', keywords: ['blocks', 'scripts'], run: () => actions.showTab('code')},
        {key: 'costumesTab', keywords: ['paint', 'art', 'backdrops'], run: () => actions.showTab('costumes')},
        {key: 'soundsTab', keywords: ['audio', 'music'], run: () => actions.showTab('sounds')},
        {key: 'turbo', keywords: ['fast', 'speed'], run: () => vm.setTurboMode(!vm.runtime.turboMode)}
    ];
    if (workspace) {
        list.push(
            {key: 'cleanUp', keywords: ['tidy', 'arrange'], run: () => workspace.cleanUp()},
            {key: 'undo', keywords: ['back'], run: () => workspace.undo(false)},
            {key: 'redo', keywords: ['again'], run: () => workspace.undo(true)},
            {key: 'zoomIn', keywords: ['bigger'], run: () => workspace.zoomCenter(1)},
            {key: 'zoomOut', keywords: ['smaller'], run: () => workspace.zoomCenter(-1)},
            {
                key: 'zoomReset',
                keywords: ['default'],
                run: () => workspace.setScale(workspace.options.zoomOptions.startScale)
            }
        );
    }
    return list.filter(entry => typeof entry.run === 'function').map(entry => ({
        id: `command:${entry.key}`,
        kind: 'command',
        label: text(entry.key),
        keywords: entry.keywords,
        run: entry.run
    }));
};

const checkerItems = env => (env.checkerItems || []).map(entry => ({
    id: `checker:${entry.key}`,
    kind: 'checker',
    label: itemText(env.intl, entry),
    detail: env.targetName(entry.targetId),
    severity: entry.severity,
    run: () => env.showMe(entry)
}));

const blockItems = env => {
    const {workspace} = env;
    const flyout = workspace && call(() => workspace.getFlyout(), null);
    const flyoutWorkspace = flyout && call(() => flyout.getWorkspace(), null);
    if (!flyoutWorkspace) return [];
    const seen = new Set();
    const out = [];
    flyoutWorkspace.getTopBlocks(true).forEach(block => {
        if (block.isShadow()) return;
        const label = block.toString(80, '');
        const key = `${block.type}:${label}`;
        if (!label || seen.has(key)) return;
        seen.add(key);
        out.push({
            id: `block:${key}`,
            kind: 'block',
            label,
            keywords: [block.type.split('_')[0]],
            detail: env.intl.formatMessage(uiMessages.insert),
            run: () => insertDom(env, env.ScratchBlocks.Xml.blockToDom(block, true))
        });
    });
    return out;
};

const myBlockItems = env => {
    const target = env.vm.editingTarget;
    if (!target || !target.blocks) return [];
    const blocks = target.blocks._blocks;
    return Object.keys(blocks).map(id => blocks[id])
        .filter(block => block.opcode === 'procedures_prototype' && block.mutation && block.parent)
        .map(block => ({
            id: `myblock:${block.id}`,
            kind: 'myblock',
            label: readableProccode(block.mutation.proccode),
            run: () => env.reveal(block.parent)
        }));
};

const variableItems = env => {
    const {workspace} = env;
    if (!workspace || !env.ScratchBlocks) return [];
    return workspace.getAllVariables()
        .filter(variable => variable.type === '' || variable.type === 'list')
        .map(variable => {
            const list = variable.type === 'list';
            const xml = list ?
                `<block type="data_listcontents"><field name="LIST" id="${escapeXml(variable.getId())}" ` +
                `variabletype="list">${escapeXml(variable.name)}</field></block>` :
                `<block type="data_variable"><field name="VARIABLE" id="${escapeXml(variable.getId())}" ` +
                `variabletype="">${escapeXml(variable.name)}</field></block>`;
            return {
                id: `variable:${variable.getId()}`,
                kind: 'variable',
                label: variable.name,
                keywords: [list ? 'list' : 'variable'],
                run: () => insertDom(env, xmlDom(env, xml))
            };
        });
};

const spriteItems = env => env.vm.runtime.targets
    .filter(target => target.isOriginal)
    .map(target => ({
        id: `sprite:${target.id}`,
        kind: 'sprite',
        label: target.isStage ? env.intl.formatMessage(uiMessages.stage) : target.getName(),
        run: () => env.vm.setEditingTarget(target.id)
    }));

const costumeItems = env => {
    const target = env.vm.editingTarget;
    if (!target) return [];
    return target.getCostumes().map((costume, index) => ({
        id: `costume:${target.id}:${index}`,
        kind: 'costume',
        label: costume.name,
        detail: target.isStage ? env.intl.formatMessage(uiMessages.stage) : target.getName(),
        run: () => {
            target.setCostume(index);
            env.actions.showTab('costumes');
        }
    }));
};

const soundItems = env => {
    const target = env.vm.editingTarget;
    if (!target) return [];
    return target.getSounds().map((sound, index) => ({
        id: `sound:${target.id}:${index}`,
        kind: 'sound',
        label: sound.name,
        detail: target.isStage ? env.intl.formatMessage(uiMessages.stage) : target.getName(),
        run: () => env.actions.showTab('sounds')
    }));
};

const worldItems = env => {
    const seam = env.win && env.win.SquiggleWorld;
    if (!seam) return [];
    const out = [];
    if (typeof seam.showScene === 'function') {
        (call(seam.scenes, null) || []).forEach(name => out.push({
            id: `scene:${name}`,
            kind: 'scene',
            label: name,
            run: () => seam.showScene(name)
        }));
    }
    if (typeof seam.showLevel === 'function') {
        (call(seam.levels, null) || []).forEach(level => out.push({
            id: `level:${level.id || level.name}`,
            kind: 'level',
            label: level.name,
            run: () => seam.showLevel(level.id || level.name)
        }));
    }
    return out;
};

const peerItems = env => {
    if (typeof env.follow !== 'function') return [];
    const net = env.win && env.win.SquiggleNet;
    const names = (net && Array.isArray(net.peers)) ? net.peers : [];
    return names.map(name => ({
        id: `peer:${name}`,
        kind: 'peer',
        label: name,
        run: () => env.follow(name)
    }));
};

const SOURCES = Object.freeze([
    commandItems, checkerItems, blockItems, myBlockItems, variableItems, spriteItems, costumeItems, soundItems,
    worldItems, peerItems
]);

const buildItems = env => {
    const out = [];
    SOURCES.forEach(source => {
        const made = call(() => source(env), []);
        made.forEach(entry => {
            entry.boost = KIND_BOOST[entry.kind] || 0;
            out.push(entry);
        });
    });
    return out;
};

const isPaletteKey = event => (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
    (event.key === 'k' || event.key === 'K');

const groupResults = results => {
    const groups = [];
    const byKind = new Map();
    results.forEach(entry => {
        if (!byKind.has(entry.kind)) {
            const group = {kind: entry.kind, items: []};
            byKind.set(entry.kind, group);
            groups.push(group);
        }
        byKind.get(entry.kind).items.push(entry);
    });
    return groups;
};

export {
    KIND_ORDER,
    readableProccode,
    insertDom,
    buildItems,
    groupResults,
    isPaletteKey,
    commandItems,
    checkerItems,
    blockItems,
    myBlockItems,
    variableItems,
    spriteItems,
    costumeItems,
    soundItems,
    worldItems,
    peerItems
};

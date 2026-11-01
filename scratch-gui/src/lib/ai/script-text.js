const MAX_CHARS = 6000;
const MORE = '... (more)';
const MAX_DEPTH = 40;
const INDENT = '  ';

const TEMPLATES = {
    motion_movesteps: 'move %STEPS steps',
    motion_turnright: 'turn right %DEGREES degrees',
    motion_turnleft: 'turn left %DEGREES degrees',
    motion_goto: 'go to %TO',
    motion_gotoxy: 'go to x: %X y: %Y',
    motion_glideto: 'glide %SECS secs to %TO',
    motion_glidesecstoxy: 'glide %SECS secs to x: %X y: %Y',
    motion_pointindirection: 'point in direction %DIRECTION',
    motion_pointtowards: 'point towards %TOWARDS',
    motion_changexby: 'change x by %DX',
    motion_setx: 'set x to %X',
    motion_changeyby: 'change y by %DY',
    motion_sety: 'set y to %Y',
    motion_ifonedgebounce: 'if on edge, bounce',
    motion_setrotationstyle: 'set rotation style %STYLE',
    motion_xposition: 'x position',
    motion_yposition: 'y position',
    motion_direction: 'direction',
    looks_sayforsecs: 'say %MESSAGE for %SECS seconds',
    looks_say: 'say %MESSAGE',
    looks_thinkforsecs: 'think %MESSAGE for %SECS seconds',
    looks_think: 'think %MESSAGE',
    looks_switchcostumeto: 'switch costume to %COSTUME',
    looks_nextcostume: 'next costume',
    looks_switchbackdropto: 'switch backdrop to %BACKDROP',
    looks_switchbackdroptoandwait: 'switch backdrop to %BACKDROP and wait',
    looks_nextbackdrop: 'next backdrop',
    looks_changesizeby: 'change size by %CHANGE',
    looks_setsizeto: 'set size to %SIZE %',
    looks_changeeffectby: 'change %EFFECT effect by %CHANGE',
    looks_seteffectto: 'set %EFFECT effect to %VALUE',
    looks_cleargraphiceffects: 'clear graphic effects',
    looks_show: 'show',
    looks_hide: 'hide',
    looks_gotofrontback: 'go to %FRONT_BACK layer',
    looks_goforwardbackwardlayers: 'go %FORWARD_BACKWARD %NUM layers',
    looks_costumenumbername: 'costume %NUMBER_NAME',
    looks_backdropnumbername: 'backdrop %NUMBER_NAME',
    looks_size: 'size',
    sound_playuntildone: 'play sound %SOUND_MENU until done',
    sound_play: 'start sound %SOUND_MENU',
    sound_stopallsounds: 'stop all sounds',
    sound_changeeffectby: 'change %EFFECT sound effect by %VALUE',
    sound_seteffectto: 'set %EFFECT sound effect to %VALUE',
    sound_cleareffects: 'clear sound effects',
    sound_changevolumeby: 'change volume by %VOLUME',
    sound_setvolumeto: 'set volume to %VOLUME %',
    sound_volume: 'volume',
    event_whenflagclicked: 'when green flag clicked',
    event_whenkeypressed: 'when %KEY_OPTION key pressed',
    event_whenthisspriteclicked: 'when this sprite clicked',
    event_whenstageclicked: 'when stage clicked',
    event_whenbackdropswitchesto: 'when backdrop switches to %BACKDROP',
    event_whengreaterthan: 'when %WHENGREATERTHANMENU > %VALUE',
    event_whenbroadcastreceived: 'when I receive %BROADCAST_OPTION',
    event_whentouchingobject: 'when this sprite touches %TOUCHINGOBJECTMENU',
    event_broadcast: 'broadcast %BROADCAST_INPUT',
    event_broadcastandwait: 'broadcast %BROADCAST_INPUT and wait',
    control_wait: 'wait %DURATION seconds',
    control_repeat: 'repeat %TIMES',
    control_forever: 'forever',
    control_if: 'if %CONDITION then',
    control_if_else: 'if %CONDITION then',
    control_wait_until: 'wait until %CONDITION',
    control_repeat_until: 'repeat until %CONDITION',
    control_while: 'while %CONDITION',
    control_for_each: 'for each %VARIABLE in %VALUE',
    control_stop: 'stop %STOP_OPTION',
    control_start_as_clone: 'when I start as a clone',
    control_create_clone_of: 'create clone of %CLONE_OPTION',
    control_delete_this_clone: 'delete this clone',
    sensing_touchingobject: 'touching %TOUCHINGOBJECTMENU?',
    sensing_touchingcolor: 'touching color %COLOR?',
    sensing_coloristouchingcolor: 'color %COLOR is touching %COLOR2?',
    sensing_distanceto: 'distance to %DISTANCETOMENU',
    sensing_askandwait: 'ask %QUESTION and wait',
    sensing_answer: 'answer',
    sensing_keypressed: 'key %KEY_OPTION pressed?',
    sensing_mousedown: 'mouse down?',
    sensing_mousex: 'mouse x',
    sensing_mousey: 'mouse y',
    sensing_setdragmode: 'set drag mode %DRAG_MODE',
    sensing_loudness: 'loudness',
    sensing_timer: 'timer',
    sensing_resettimer: 'reset timer',
    sensing_of: '%PROPERTY of %OBJECT',
    sensing_current: 'current %CURRENTMENU',
    sensing_dayssince2000: 'days since 2000',
    sensing_username: 'username',
    operator_add: '%NUM1 + %NUM2',
    operator_subtract: '%NUM1 - %NUM2',
    operator_multiply: '%NUM1 * %NUM2',
    operator_divide: '%NUM1 / %NUM2',
    operator_random: 'pick random %FROM to %TO',
    operator_gt: '%OPERAND1 > %OPERAND2',
    operator_lt: '%OPERAND1 < %OPERAND2',
    operator_equals: '%OPERAND1 = %OPERAND2',
    operator_and: '%OPERAND1 and %OPERAND2',
    operator_or: '%OPERAND1 or %OPERAND2',
    operator_not: 'not %OPERAND',
    operator_join: 'join %STRING1 %STRING2',
    operator_letter_of: 'letter %LETTER of %STRING',
    operator_length: 'length of %STRING',
    operator_contains: '%STRING1 contains %STRING2?',
    operator_mod: '%NUM1 mod %NUM2',
    operator_round: 'round %NUM',
    operator_mathop: '%OPERATOR of %NUM',
    data_setvariableto: 'set %VARIABLE to %VALUE',
    data_changevariableby: 'change %VARIABLE by %VALUE',
    data_showvariable: 'show variable %VARIABLE',
    data_hidevariable: 'hide variable %VARIABLE',
    data_addtolist: 'add %ITEM to %LIST',
    data_deleteoflist: 'delete %INDEX of %LIST',
    data_deletealloflist: 'delete all of %LIST',
    data_insertatlist: 'insert %ITEM at %INDEX of %LIST',
    data_replaceitemoflist: 'replace item %INDEX of %LIST with %ITEM',
    data_itemoflist: 'item %INDEX of %LIST',
    data_itemnumoflist: 'item # of %ITEM in %LIST',
    data_lengthoflist: 'length of %LIST',
    data_listcontainsitem: '%LIST contains %ITEM?',
    data_showlist: 'show list %LIST',
    data_hidelist: 'hide list %LIST',
    pen_clear: 'erase all',
    pen_stamp: 'stamp',
    pen_penDown: 'pen down',
    pen_penUp: 'pen up',
    pen_setPenColorToColor: 'set pen color to %COLOR',
    pen_changePenColorParamBy: 'change pen %COLOR_PARAM by %VALUE',
    pen_setPenColorParamTo: 'set pen %COLOR_PARAM to %VALUE',
    pen_changePenSizeBy: 'change pen size by %SIZE',
    pen_setPenSizeTo: 'set pen size to %SIZE'
};

const BOOLEANS = new Set([
    'operator_gt', 'operator_lt', 'operator_equals', 'operator_and', 'operator_or', 'operator_not',
    'operator_contains', 'sensing_touchingobject', 'sensing_touchingcolor', 'sensing_coloristouchingcolor',
    'sensing_keypressed', 'sensing_mousedown', 'data_listcontainsitem', 'argument_reporter_boolean'
]);

const BOOLEAN_INPUTS = new Set(['CONDITION', 'OPERAND']);

const ROUND_SHADOWS = new Set([
    'math_number', 'math_positive_number', 'math_whole_number', 'math_integer', 'math_angle', 'text', 'colour_picker'
]);

const SPECIAL_VALUES = {
    _random_: 'random position',
    _mouse_: 'mouse-pointer',
    _edge_: 'edge',
    _stage_: 'Stage',
    _myself_: 'myself'
};

const C_BLOCK = /^control_(forever|repeat|if|while|for_each)/;

const RAW_FIELD = {
    data_variable: 'VARIABLE',
    data_listcontents: 'LIST',
    argument_reporter_string_number: 'VALUE',
    argument_reporter_boolean: 'VALUE'
};

const isHat = opcode => opcode === 'control_start_as_clone' ||
    opcode === 'procedures_definition' ||
    /^event_when/.test(opcode) ||
    /_when[A-Z]/.test(opcode);

const fieldValue = field => {
    if (!field) return '';
    const v = field.value === null || typeof field.value === 'undefined' ? '' : String(field.value);
    return Object.prototype.hasOwnProperty.call(SPECIAL_VALUES, v) ? SPECIAL_VALUES[v] : v;
};

const parseList = raw => {
    if (Array.isArray(raw)) return raw;
    try {
        const out = JSON.parse(raw);
        return Array.isArray(out) ? out : [];
    } catch (e) {
        return [];
    }
};

const makeRenderer = blocks => {
    const self = {};
    const shadowLiteral = block => {
        const names = Object.keys(block.fields || {});
        const value = names.length ? fieldValue(block.fields[names[0]]) : '';
        return ROUND_SHADOWS.has(block.opcode) ? `(${value})` : `[${value}]`;
    };

    const input = (block, name, depth) => {
        const slot = block.inputs && block.inputs[name];
        const wantsBool = BOOLEAN_INPUTS.has(name) ||
            ((block.opcode === 'operator_and' || block.opcode === 'operator_or') && /^OPERAND/.test(name));
        const empty = wantsBool ? '<>' : '()';
        if (!slot || !slot.block) return empty;
        const inner = blocks[slot.block];
        if (!inner) return empty;
        if (inner.shadow) return shadowLiteral(inner);
        if (depth > MAX_DEPTH) return '(...)';
        const shown = self.text(inner, depth + 1);
        return BOOLEANS.has(inner.opcode) || wantsBool ? `<${shown}>` : `(${shown})`;
    };

    const fill = (block, template, depth) => template.replace(/%([A-Z][A-Z0-9_]*)/g, (match, name) => {
        if (block.inputs && block.inputs[name]) return input(block, name, depth);
        if (block.fields && block.fields[name]) return `[${fieldValue(block.fields[name])}]`;
        return BOOLEAN_INPUTS.has(name) ? '<>' : '()';
    });

    const procText = (mutation, args) => {
        let i = 0;
        return String((mutation && mutation.proccode) || 'custom block')
            .replace(/%[snb]/g, () => args(i++))
            .replace(/\s+/g, ' ')
            .trim();
    };

    const generic = (block, depth) => {
        const parts = [block.opcode];
        for (const name of Object.keys(block.inputs || {})) {
            if (name === 'SUBSTACK' || name === 'SUBSTACK2') continue;
            parts.push(`${name}: ${input(block, name, depth)}`);
        }
        for (const name of Object.keys(block.fields || {})) {
            parts.push(`${name}: [${fieldValue(block.fields[name])}]`);
        }
        return parts.join(' ');
    };

    self.text = (block, depth) => {
        if (RAW_FIELD[block.opcode]) return fieldValue(block.fields && block.fields[RAW_FIELD[block.opcode]]);
        if (block.opcode === 'procedures_definition') {
            const slot = block.inputs && block.inputs.custom_block;
            const proto = slot && blocks[slot.block];
            const mutation = proto && proto.mutation;
            const names = parseList(mutation && mutation.argumentnames);
            const kinds = String((mutation && mutation.proccode) || '').match(/%[snb]/g) || [];
            const arg = i => (kinds[i] === '%b' ? `<${names[i] || ''}>` : `(${names[i] || ''})`);
            return `define ${procText(mutation, arg)}`;
        }
        if (block.opcode === 'procedures_call') {
            const ids = parseList(block.mutation && block.mutation.argumentids);
            return procText(block.mutation, i => input(block, ids[i], depth));
        }
        const template = TEMPLATES[block.opcode];
        return template ? fill(block, template, depth) : generic(block, depth);
    };

    const stack = (startId, level, out, seen) => {
        let id = startId;
        while (id && blocks[id] && !seen.has(id)) {
            const block = blocks[id];
            seen.add(id);
            const pad = INDENT.repeat(level);
            out.push(pad + self.text(block, 0));
            const subs = ['SUBSTACK', 'SUBSTACK2'].filter(n => block.inputs && block.inputs[n]);
            const cBlock = subs.length > 0 || C_BLOCK.test(block.opcode);
            if (cBlock && level < MAX_DEPTH) {
                const first = block.inputs && block.inputs.SUBSTACK && block.inputs.SUBSTACK.block;
                if (first && blocks[first]) stack(first, level + 1, out, seen);
                else out.push(`${pad}${INDENT}(nothing inside)`);
                if (block.opcode === 'control_if_else') {
                    out.push(`${pad}else`);
                    const second = block.inputs && block.inputs.SUBSTACK2 && block.inputs.SUBSTACK2.block;
                    if (second && blocks[second]) stack(second, level + 1, out, seen);
                    else out.push(`${pad}${INDENT}(nothing inside)`);
                }
            }
            id = block.next;
        }
    };

    return {stack, text: self.text};
};

const blocksOf = target => (target && target.blocks && target.blocks._blocks) || {};

const topBlocks = blocks => Object.keys(blocks)
    .filter(id => blocks[id] && blocks[id].topLevel && !blocks[id].shadow)
    .sort((ia, ib) => {
        const a = blocks[ia];
        const b = blocks[ib];
        const hat = Number(isHat(b.opcode)) - Number(isHat(a.opcode));
        if (hat) return hat;
        return ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0));
    });

const round = n => (typeof n === 'number' && isFinite(n) ? Math.round(n) : 0);

const costumeCount = target => {
    if (target && typeof target.getCostumes === 'function') return target.getCostumes().length;
    const costumes = target && target.sprite && target.sprite.costumes;
    return Array.isArray(costumes) ? costumes.length : 0;
};

const variablesOf = target => {
    const vars = (target && target.variables) || {};
    const scalars = [];
    const lists = [];
    for (const id of Object.keys(vars)) {
        const v = vars[id];
        if (!v || !v.name) continue;
        if (v.type === 'list') lists.push(v.name);
        else if (!v.type) scalars.push(v.name);
    }
    return {scalars, lists};
};

const factsLine = target => {
    const {scalars, lists} = variablesOf(target);
    const parts = target && target.isStage ?
        ['stage', `backdrops: ${costumeCount(target)}`] :
        [
            `visible: ${target && target.visible === false ? 'no' : 'yes'}`,
            `x: ${round(target && target.x)}`,
            `y: ${round(target && target.y)}`,
            `size: ${round(target && target.size)}%`,
            `costumes: ${costumeCount(target)}`
        ];
    parts.push(`variables: ${scalars.length ? scalars.join(', ') : 'none'}`);
    if (lists.length) parts.push(`lists: ${lists.join(', ')}`);
    return `facts: ${parts.join(', ')}`;
};

const broadcastName = (blocks, block) => {
    const slot = block.inputs && block.inputs.BROADCAST_INPUT;
    const menu = slot && blocks[slot.block];
    if (!menu || !menu.shadow) return '';
    return fieldValue(menu.fields && menu.fields.BROADCAST_OPTION);
};

const messagesOf = target => {
    const blocks = blocksOf(target);
    const sends = new Set();
    const hears = new Set();
    for (const id of Object.keys(blocks)) {
        const b = blocks[id];
        if (!b) continue;
        if (b.opcode === 'event_broadcast' || b.opcode === 'event_broadcastandwait') {
            const name = broadcastName(blocks, b);
            if (name) sends.add(name);
        } else if (b.opcode === 'event_whenbroadcastreceived') {
            const name = fieldValue(b.fields && b.fields.BROADCAST_OPTION);
            if (name) hears.add(name);
        }
    }
    return {sends, hears};
};

const messagesLine = (target, others) => {
    if (!Array.isArray(others)) return '';
    const mine = messagesOf(target);
    if (!mine.sends.size && !mine.hears.size) return '';
    const allSends = new Set(mine.sends);
    const allHears = new Set(mine.hears);
    for (const other of others) {
        if (!other || other === target) continue;
        const theirs = messagesOf(other);
        theirs.sends.forEach(m => allSends.add(m));
        theirs.hears.forEach(m => allHears.add(m));
    }
    const unheard = [...mine.sends].filter(m => !allHears.has(m));
    const unsent = [...mine.hears].filter(m => !allSends.has(m));
    const parts = [];
    if (unheard.length) parts.push(`broadcast but no script receives: ${unheard.map(m => `[${m}]`).join(', ')}`);
    if (unsent.length) parts.push(`received but never broadcast: ${unsent.map(m => `[${m}]`).join(', ')}`);
    return parts.length ? `messages: ${parts.join('; ')}` : 'messages: every broadcast has a receiver';
};

const clip = (lines, max) => {
    const out = [];
    let size = 0;
    for (const line of lines) {
        const add = (out.length ? 1 : 0) + line.length;
        if (size + add + 1 + MORE.length > max) {
            out.push(MORE);
            return out.join('\n');
        }
        out.push(line);
        size += add;
    }
    return out.join('\n');
};

const spriteScriptText = (target, {others, max = MAX_CHARS} = {}) => {
    const blocks = blocksOf(target);
    const {stack} = makeRenderer(blocks);
    const lines = [factsLine(target)];
    const messages = messagesLine(target, others);
    if (messages) lines.push(messages);
    const tops = topBlocks(blocks);
    if (!tops.length) lines.push('', '(no blocks yet)');
    const seen = new Set();
    for (const id of tops) {
        if (seen.has(id)) continue;
        const script = [];
        if (!isHat(blocks[id].opcode)) script.push('(loose blocks with no hat block on top)');
        stack(id, 0, script, seen);
        lines.push('', ...script);
    }
    return clip(lines, max);
};

export {
    MAX_CHARS,
    MORE,
    spriteScriptText
};

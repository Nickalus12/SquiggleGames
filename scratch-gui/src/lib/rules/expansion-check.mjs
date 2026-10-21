import './json-hook.mjs';

process.removeAllListeners('warning');

const {ruleOpcodes, ruleOpcodeSet, OPEN_RULES_FUNC} = await import('./rule-blocks.js');
const {KIT_COLORS} = await import('../themes/tokens.js');
const {filterCategory, MODE_RULES, MODE_DEVICE} = await import('./toolbox-mode.js');
const {deviceOpcodes} = await import('../together2/device-blocks.js');
const {gameServerReady} = await import('./flags.js');

const checkExpansion = async id => {
    let pass = 0;
    let fail = 0;
    const ok = (label, cond, detail) => {
        if (cond) {
            pass++;
            console.log(`  PASS  ${label}`);
        } else {
            fail++;
            console.log(`  FAIL  ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
        }
    };

    const Blocks = (await import(`../libraries/extensions/${id}/index.js`)).default;
    const runtime = {targets: []};
    const ext = new Blocks(runtime);
    const info = ext.getInfo();

    console.log(`\n${id}`);
    ok('the id matches the folder', info.id === id, info.id);
    ok('the kit colours come from the tokens', info.color1 === KIT_COLORS[id].color1, info.color1);
    ok('the first entry is the Open Game Rules button',
        info.blocks[0].blockType === 'button' && info.blocks[0].func === OPEN_RULES_FUNC, info.blocks[0]);

    const opcodes = info.blocks.filter(block => block && block.opcode).map(block => block.opcode);
    const ruleSet = ruleOpcodeSet();
    const isRule = opcode => ruleSet.has(`${id}_${opcode}`);
    const ruleOps = opcodes.filter(isRule);
    const deviceOps = opcodes.filter(opcode => !isRule(opcode));
    const expected = ruleOpcodes(id);
    ok('every rule block comes from the schema card', expected.length > 0 &&
        ruleOps.join() === expected.join(), {ruleOps, expected});
    ok('every other block is a device block of this card', deviceOps.length > 0 &&
        deviceOps.join() === deviceOpcodes(id).join(), deviceOps);
    const devices = info.blocks.filter(block => block && deviceOps.includes(block.opcode));
    ok('the device blocks wait for the game server', devices.every(block =>
        block.hideFromPalette === !gameServerReady()));
    ok('every block has a method', opcodes.every(opcode => typeof ext[opcode] === 'function'));

    const menuNames = Object.keys(info.menus || {});
    const itemsOf = name => {
        const items = info.menus[name].items;
        return Array.isArray(items) ? items : ext[items]();
    };
    ok('every menu is a list or has its method', menuNames.every(name => Array.isArray(info.menus[name].items) ||
        typeof ext[info.menus[name].items] === 'function'));
    ok('an empty menu still offers one item', menuNames.every(name => {
        const items = itemsOf(name);
        return Array.isArray(items) && items.length > 0;
    }));
    ok('with no VM the button resolves to null', (await ext.openGameRules()) === null);

    const categoryOf = ops => ({
        id,
        xml: `<category name="x" id="${id}"><button text="Open Game Rules" ` +
            `callbackKey="EXTENSION_BUTTON" callbackData="${id}_${OPEN_RULES_FUNC}"/>` +
            `${ops.map(opcode => `<block type="${id}_${opcode}"/>`).join('')}</category>`
    });
    const shown = info.blocks.filter(block => block && block.opcode && !block.hideFromPalette)
        .map(block => block.opcode);
    const device = filterCategory(categoryOf(shown), MODE_DEVICE);
    ok('a device sprite sees the button and no rule block',
        device.xml.includes(OPEN_RULES_FUNC) && !ruleOps.some(opcode => device.xml.includes(`${id}_${opcode}"`)),
        device.xml);
    ok('with the game server off a device sprite sees only the button', gameServerReady() ||
        !device.xml.includes('<block'), device.xml);
    const live = filterCategory(categoryOf(opcodes), MODE_DEVICE);
    ok('with the game server on a device sprite sees the device blocks',
        deviceOps.every(opcode => live.xml.includes(`${id}_${opcode}"`)), live.xml);
    const rules = filterCategory(categoryOf(opcodes), MODE_RULES);
    ok('the rules sprite sees the rule blocks, no device block and no button',
        ruleOps.every(opcode => rules.xml.includes(`${id}_${opcode}"`)) &&
        !deviceOps.some(opcode => rules.xml.includes(`${id}_${opcode}"`)) &&
        !rules.xml.includes(OPEN_RULES_FUNC), rules.xml);

    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
};

export default checkExpansion;

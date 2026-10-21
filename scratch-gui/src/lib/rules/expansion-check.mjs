import './json-hook.mjs';

process.removeAllListeners('warning');

const {ruleOpcodes, ruleOpcodeSet, OPEN_RULES_FUNC} = await import('./rule-blocks.js');
const {KIT_COLORS} = await import('../themes/tokens.js');
const {filterCategory, MODE_RULES, MODE_DEVICE} = await import('./toolbox-mode.js');

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
    const expected = ruleOpcodes(id);
    ok('every block comes from the schema card', expected.length > 0 &&
        opcodes.join() === expected.join(), {opcodes, expected});
    const ruleSet = ruleOpcodeSet();
    ok('every block is a rule block', opcodes.every(opcode => ruleSet.has(`${id}_${opcode}`)));
    ok('every block has a method', opcodes.every(opcode => typeof ext[opcode] === 'function'));

    const menuNames = Object.keys(info.menus || {});
    ok('every menu has its method', menuNames.every(name => typeof ext[info.menus[name].items] === 'function'));
    ok('an empty menu still offers one item', menuNames.every(name => {
        const items = ext[info.menus[name].items]();
        return Array.isArray(items) && items.length > 0;
    }));
    ok('with no VM the button resolves to null', (await ext.openGameRules()) === null);

    const blockXML = opcodes.map(opcode => `<block type="${id}_${opcode}"/>`).join('');
    const category = {
        id,
        xml: `<category name="x" id="${id}"><button text="Open Game Rules" ` +
            `callbackKey="EXTENSION_BUTTON" callbackData="${id}_${OPEN_RULES_FUNC}"/>${blockXML}</category>`
    };
    const device = filterCategory(category, MODE_DEVICE);
    ok('a device sprite sees only the button',
        device.xml.includes(OPEN_RULES_FUNC) && !device.xml.includes('<block'), device.xml);
    const rules = filterCategory(category, MODE_RULES);
    ok('the rules sprite sees the blocks and no button',
        rules.xml.includes('<block') && !rules.xml.includes(OPEN_RULES_FUNC), rules.xml);

    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
};

export default checkExpansion;

import './json-hook.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.removeAllListeners('warning');

const here = path.dirname(fileURLToPath(import.meta.url));
const {canonical, rulesPayload, hashRules, hasRuleBlocks} = await import('./hash.js');
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'hash-fixture.json'), 'utf8'));
const schemaJSON = JSON.parse(fs.readFileSync(path.join(here, 'rules-schema.json'), 'utf8'));
const schemaModule = (await import('./rules-schema.js')).default;

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

const reorder = value => {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).reverse()
        .forEach(key => {
            out[key] = reorder(value[key]);
        });
    return out;
};

console.log('\ncanonical JSON');
ok('sorted keys, no whitespace', canonical({b: 1, a: [true, null, 'x']}) === '{"a":[true,null,"x"],"b":1}');
ok('undefined keys are dropped', canonical({a: 1, b: undefined}) === '{"a":1}');
ok('non-finite numbers become 0', canonical({a: Infinity, b: NaN}) === '{"a":0,"b":0}');
ok('matches the shared fixture byte for byte', canonical(rulesPayload(fixture.sprite)) === fixture.canonical);

console.log('\nhash');
const base = await hashRules(fixture.sprite);
ok('matches the shared fixture sha256', base === fixture.sha256, base);
const pretty = JSON.parse(JSON.stringify(reorder(fixture.sprite), null, 7));
ok('stable under key order and whitespace', await hashRules(pretty) === base);
const moved = JSON.parse(JSON.stringify(fixture.sprite));
moved.x = 300;
moved.costumes = [{name: 'other'}];
ok('ignores sprite position and costumes', await hashRules(moved) === base);
const edited = JSON.parse(JSON.stringify(fixture.sprite));
edited.blocks.a.x += 1;
ok('top-level block x is part of the hash', await hashRules(edited) !== base);
const marked = JSON.parse(JSON.stringify(fixture.sprite));
marked.extensionStorage.together.teams.push('Green');
ok('the rules mark is part of the hash', await hashRules(marked) !== base);
const level = [{id: 'l1', cols: 4, rows: 3, tile: 32, origin: [0, 0]}];
ok('levels are part of the hash', await hashRules(fixture.sprite, 1, level) !== base);
ok('no levels hashes as an empty list', await hashRules(fixture.sprite, 1, []) === base);
ok('the opcodeSet is part of the hash', await hashRules(fixture.sprite, 2, []) !== base);
ok('the opcodeSet defaults to the mark', rulesPayload(fixture.sprite).opcodeSet === 1);
ok('hasRuleBlocks sees blocks', hasRuleBlocks(fixture.sprite) && !hasRuleBlocks({blocks: {}}));

ok('rules-schema.json matches rules-schema.js', canonical(schemaJSON) === canonical(schemaModule));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

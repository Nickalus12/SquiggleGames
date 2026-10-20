import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
    }
};

const src = fs.readFileSync(path.join(here, 'login.js'), 'utf8')
    .replace(/^export default showLogin;\s*$/m, 'return {defaultServerUrl};');
const load = new Function('location', src);

const at = href => {
    const u = new URL(href);
    return load({
        protocol: u.protocol,
        hostname: u.hostname,
        host: u.host,
        port: u.port,
        pathname: u.pathname,
        search: u.search
    }).defaultServerUrl();
};

ok('production connects to its own host',
    at('https://squigglegames.app/r/abc') === 'wss://squigglegames.app');
ok('production ignores ?server=',
    at('https://squigglegames.app/r/abc?server=wss://evil.example') === 'wss://squigglegames.app',
    at('https://squigglegames.app/r/abc?server=wss://evil.example'));
ok('the dev server still honours ?server=',
    at('http://localhost:8601/?room=a&server=ws://10.0.0.5:4455') === 'ws://10.0.0.5:4455');
ok('the dev server defaults to the collab port',
    at('http://192.168.4.20:8601/?room=a') === 'ws://192.168.4.20:4455');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

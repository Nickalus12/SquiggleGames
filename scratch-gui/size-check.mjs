import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {fileURLToPath} from 'url';

const gui = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(gui, process.env.SIZE_BUILD_DIR || 'build');
const baselinePath = path.join(gui, 'size-baseline.json');
const write = process.argv.includes('--write');

const PAGES = {
    editor: 'editor.html',
    player: 'index.html'
};
const KB = 1024;

const scriptsOf = page => {
    const html = fs.readFileSync(path.join(buildDir, page), 'utf8');
    const sources = [];
    const pattern = /<script\b[^>]*\bsrc="([^"]+)"/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        const src = match[1].split(/[?#]/)[0];
        if (/^(https?:)?\/\//.test(src)) continue;
        sources.push(src.replace(/^\/+/, ''));
    }
    if (!sources.length) throw new Error(`${page} references no scripts`);
    return sources;
};

const measure = page => {
    const files = scriptsOf(page);
    let raw = 0;
    let gzip = 0;
    for (const file of files) {
        const data = fs.readFileSync(path.join(buildDir, file));
        raw += data.length;
        gzip += zlib.gzipSync(data, {level: 9}).length;
    }
    return {files: files.length, raw, gzip};
};

const kb = bytes => `${(bytes / KB).toFixed(1)} KB`;

const current = {};
for (const name of Object.keys(PAGES)) current[name] = measure(PAGES[name]);

const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

if (write) {
    const next = Object.assign({}, baseline, {
        mode: process.env.NODE_ENV || 'development',
        gzipLevel: 9,
        bundles: current
    });
    if (process.env.SIZE_BASELINE_REF) next.ref = process.env.SIZE_BASELINE_REF;
    fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 4)}\n`);
    console.log(`wrote ${path.relative(gui, baselinePath)}`);
}

if (!baseline || write) {
    for (const name of Object.keys(current)) {
        console.log(`${name}: ${kb(current[name].gzip)} gzipped in ${current[name].files} files`);
    }
    process.exit(0);
}

const mode = process.env.NODE_ENV || 'development';
if (baseline.mode !== mode) {
    console.error(`baseline was measured in ${baseline.mode} mode, this build is ${mode}`);
    process.exit(1);
}

let failed = false;
for (const name of Object.keys(PAGES)) {
    const before = baseline.bundles[name].gzip;
    const after = current[name].gzip;
    const budget = baseline.budgets[name] * KB;
    const growth = after - before;
    const over = growth > budget;
    if (over) failed = true;
    console.log(`${over ? 'FAIL' : 'ok  '}  ${name}: ${kb(after)} gzipped, ${growth >= 0 ? '+' : ''}${kb(growth)} ` +
        `over ${baseline.ref || 'the baseline'} (budget +${baseline.budgets[name]} KB)`);
}

fs.writeFileSync(path.join(buildDir, 'size.json'), `${JSON.stringify(current, null, 4)}\n`);
if (failed) process.exit(1);

process.removeAllListeners('warning');

const {readFileSync} = process.getBuiltinModule('fs');
const {fileURLToPath} = process.getBuiltinModule('url');
const {
    ALLOWED_PARENT_HOSTS,
    extractHostname,
    hasEmbedParam,
    isAllowedEmbed,
    isInvalidEmbed
} = await import('./embed-guard.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    const extra = !cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : '';
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra}`);
};

const topWindow = {
    location: {search: '', href: 'https://evil.example.com/index.html'}
};
topWindow.parent = topWindow;
ok('top-level window is never treated as an invalid embed',
    isInvalidEmbed(topWindow) === false && isAllowedEmbed(topWindow) === true);

ok('iframe carrying embed=1 in search is accepted regardless of parent origin',
    isInvalidEmbed({
        inFrame: true,
        search: '?project_url=/hangar.sb3&embed=1',
        parentOrigin: 'https://unknown-host.example.com'
    }) === false);

ok('iframe carrying embed=1 in full URL is accepted',
    isInvalidEmbed({
        inFrame: true,
        url: 'https://beta.squigglegames.app/?embed=1&autoplay',
        parentOrigin: ''
    }) === false);

ok('iframe with parent origin squigglegames.app is accepted without embed=1',
    isInvalidEmbed({
        inFrame: true,
        search: '?project_url=/hangar.sb3',
        parentOrigin: 'https://squigglegames.app'
    }) === false);

ok('iframe with parent origin beta.squigglegames.app is accepted without embed=1',
    isInvalidEmbed({
        inFrame: true,
        location: {
            search: '',
            ancestorOrigins: ['https://beta.squigglegames.app']
        },
        parent: {}
    }) === false);

ok('iframe with parent origin localhost (with or without port) is accepted without embed=1',
    isInvalidEmbed({
        inFrame: true,
        parentOrigin: 'http://localhost:8601'
    }) === false &&
    isInvalidEmbed({
        inFrame: true,
        document: {referrer: 'http://localhost/split.html'},
        parent: {}
    }) === false &&
    isInvalidEmbed({
        inFrame: true,
        parentOrigin: 'http://127.0.0.1:8788'
    }) === false);

ok('iframe on any other parent origin without embed=1 is refused',
    isInvalidEmbed({
        inFrame: true,
        search: '?project_url=/hangar.sb3',
        parentOrigin: 'https://other-site.example.com'
    }) === true &&
    isInvalidEmbed({
        inFrame: true,
        parentOrigin: 'https://squigglegames.app.evil.example.com'
    }) === true &&
    isInvalidEmbed({
        inFrame: true,
        parentOrigin: 'https://fake-squigglegames.app'
    }) === true &&
    isInvalidEmbed({
        inFrame: true,
        search: '?embed=0',
        parentOrigin: 'https://other-site.example.com'
    }) === true &&
    isInvalidEmbed({
        inFrame: true,
        search: '',
        parentOrigin: ''
    }) === true);

ok('helper extractHostname and hasEmbedParam handle edge cases cleanly',
    extractHostname('https://BETA.SquiggleGames.app:443/play') === 'beta.squigglegames.app' &&
    extractHostname('null') === '' &&
    hasEmbedParam('?a=1&embed=1') === true &&
    hasEmbedParam('?a=1&embed=2') === false &&
    ALLOWED_PARENT_HOSTS.has('squigglegames.app') &&
    ALLOWED_PARENT_HOSTS.has('beta.squigglegames.app') &&
    ALLOWED_PARENT_HOSTS.has('localhost'));

const renderInterfaceSource = readFileSync(
    fileURLToPath(new URL('./render-interface.jsx', import.meta.url)),
    'utf8'
);
ok('render-interface.jsx delegates iframe guard to embed-guard.js',
    renderInterfaceSource.includes("from './embed-guard.js'") &&
    renderInterfaceSource.includes('checkInvalidEmbed('));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

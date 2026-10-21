process.removeAllListeners('warning');

const {
    ASSET_MAX_BYTES,
    attachAssetStore,
    createSnapshotHttp,
    gunzipText,
    gzip,
    projectAssets,
    MD5EXT,
    sha256Hex,
    snapshotFrame,
    storedGzip
} = await import('./snapshot-http.js');

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
const section = name => console.log(`\n${name}`);

const md5 = n => `${String(n).repeat(32).slice(0, 32)}`;
const asset = (n, format, text) => ({assetId: md5(n), dataFormat: format, data: new TextEncoder().encode(text)});

const makeVM = () => ({
    toJSON: () => JSON.stringify({targets: [{name: 'Stage'}, {name: 'Cat'}], meta: {semver: '3.0.0'}}),
    runtime: {
        targets: [
            {isOriginal: true, getCostumes: () => [{asset: asset(1, 'svg', '<svg/>')}], getSounds: () => []},
            {
                isOriginal: true,
                getCostumes: () => [{asset: asset(2, 'png', 'png-bytes')}, {asset: asset(1, 'svg', '<svg/>')}],
                getSounds: () => [{asset: asset(3, 'wav', 'wav-bytes')}]
            },
            {isOriginal: false, getCostumes: () => [{asset: asset(4, 'svg', 'clone')}], getSounds: () => []}
        ]
    }
});

const makeServer = ({have = [], status = {}} = {}) => {
    const calls = [];
    const stored = new Map();
    const assets = new Set(have);
    const fetchImpl = async (url, init) => {
        const method = init.method;
        let body = init.body;
        calls.push({url, method, headers: init.headers, credentials: init.credentials, body});
        const path = url.replace(/^https:\/\/sq\.test/, '');
        if (status[path]) return new Response('', {status: status[path]});
        if (path === '/api/assets/have' && method === 'POST') {
            const asked = JSON.parse(body).md5ext;
            return Response.json({missing: asked.filter(name => !assets.has(name))});
        }
        const assetMatch = path.match(/^\/api\/assets\/([0-9a-f]{32}\.[a-z]+)\?room=([^&]+)$/);
        if (assetMatch && method === 'PUT') {
            assets.add(assetMatch[1]);
            calls[calls.length - 1].room = decodeURIComponent(assetMatch[2]);
            return Response.json({ok: true});
        }
        const pjMatch = path.match(/^\/api\/rooms\/([^/]+)\/pj$/);
        if (pjMatch && method === 'PUT') {
            body = await gunzipText(body);
            const sha = await sha256Hex(body);
            stored.set(sha, init.body);
            return Response.json({sha, size: body.length});
        }
        const getMatch = path.match(/^\/api\/rooms\/([^/]+)\/pj\/([0-9a-f]+)$/);
        if (getMatch && method === 'GET') {
            const gz = stored.get(getMatch[2]);
            return gz ? new Response(gz, {status: 200}) : new Response('', {status: 404});
        }
        return new Response('', {status: 404});
    };
    return {calls, stored, assets, fetchImpl};
};

section('frame');
{
    const frame = snapshotFrame({
        sha: 'abc', size: 10, atSeq: 4, ref: 2, basedOn: 7, force: false, reset: true, cacheOnly: false,
        b64: 'AAAA', json: '{}', extra: 1
    });
    ok('the frame is a snapshot', frame.type === 'snapshot');
    ok('only the meta fields travel', JSON.stringify(Object.keys(frame).sort()) ===
        JSON.stringify(['atSeq', 'basedOn', 'cacheOnly', 'force', 'ref', 'reset', 'sha', 'size', 'type']), frame);
    ok('no project bytes in the frame', !('b64' in frame) && !('json' in frame));
    ok('unset fields are left out', !('ref' in snapshotFrame({sha: 'a'})));
    ok('atSeq is always sent, 0 when unknown', snapshotFrame({sha: 'a'}).atSeq === 0);
    ok('a null atSeq still sends 0', snapshotFrame({sha: 'a', atSeq: null}).atSeq === 0);
}

section('assets');
{
    const list = projectAssets(makeVM());
    ok('assets are unique by md5ext', list.length === 3, list.map(a => a.md5ext));
    ok('clones add nothing', !list.some(a => a.md5ext.startsWith('4444')));
    ok('md5ext is id dot format', list[0].md5ext === `${md5(1)}.svg`);
    ok('md5ext accepts the nine api types', ['svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'wav', 'mp3', 'ogg']
        .every(ext => MD5EXT.test(`${md5(1)}.${ext}`)));
    ok('md5ext accepts the four font types', ['ttf', 'otf', 'woff', 'woff2'].every(ext => MD5EXT.test(`${md5(1)}.${ext}`)));
    ok('md5ext refuses unknown types', !MD5EXT.test(`${md5(1)}.webp`) && !MD5EXT.test(`${md5(1)}.woff3`));
    const withFonts = makeVM();
    withFonts.runtime.fontManager = {serializeAssets: () => [asset(5, 'woff2', 'font-bytes'), asset(1, 'svg', '<svg/>')]};
    const fonts = projectAssets(withFonts);
    ok('custom fonts go up with the costumes and sounds', fonts.length === 4 && fonts[3].md5ext === `${md5(5)}.woff2`,
        fonts.map(a => a.md5ext));
}

section('gzip');
{
    const text = JSON.stringify({a: 'x'.repeat(5000)});
    const gz = await gzip(text);
    ok('gzip output has the magic bytes', gz[0] === 0x1f && gz[1] === 0x8b);
    ok('gzip shrinks a repetitive project', gz.length < text.length / 10, gz.length);
    ok('it round trips', await gunzipText(gz) === text);
    const big = new Uint8Array(70000).map((_, i) => (i * 31) & 0xff);
    const stored = storedGzip(big);
    const {gunzipSync} = await import('node:zlib');
    ok('the stored gzip fallback gunzips with zlib across blocks',
        Buffer.compare(gunzipSync(stored), Buffer.from(big)) === 0);
    ok('an empty stored gzip gunzips', gunzipSync(storedGzip(new Uint8Array(0))).length === 0);
    const realCompression = globalThis.CompressionStream;
    delete globalThis.CompressionStream;
    const fallback = await gzip(text);
    globalThis.CompressionStream = realCompression;
    ok('without CompressionStream gzip falls back and round trips', await gunzipText(fallback) === text);
    const realDecompression = globalThis.DecompressionStream;
    delete globalThis.DecompressionStream;
    const refused = await gunzipText(gz).then(() => null, error => error.code);
    globalThis.DecompressionStream = realDecompression;
    ok('without DecompressionStream gzip bytes are refused as no-gunzip', refused === 'no-gunzip', refused);
    ok('plain bytes pass through', await gunzipText(new TextEncoder().encode('{"x":1}')) === '{"x":1}');
}

section('upload');
{
    const server = makeServer({have: [`${md5(2)}.png`]});
    const http = createSnapshotHttp({slug: 'blue fox', base: 'https://sq.test', fetchImpl: server.fetchImpl});
    const vm = makeVM();
    const result = await http.upload(vm);
    const paths = server.calls.map(c => `${c.method} ${c.url.replace('https://sq.test', '')}`);
    ok('asks which assets the server has first', paths[0] === 'POST /api/assets/have', paths);
    ok('puts only the missing assets', paths.filter(p => p.startsWith('PUT /api/assets/')).length === 2, paths);
    ok('puts the project last, slug encoded', paths[paths.length - 1] === 'PUT /api/rooms/blue%20fox/pj', paths);
    const pj = server.calls[server.calls.length - 1];
    ok('the project is gzipped', pj.body[0] === 0x1f && pj.headers['content-encoding'] === 'gzip');
    ok('every call sends cookies and the squiggle header',
        server.calls.every(c => c.credentials === 'include' && c.headers['x-squiggle'] === '1'));
    const svgPut = server.calls.find(c => c.url.includes('.svg?room='));
    ok('an asset goes up with its content type', svgPut && svgPut.headers['content-type'] === 'image/svg+xml');
    ok('every asset put names the room', server.calls.filter(c => c.method === 'PUT' && c.url.includes('/api/assets/'))
        .every(c => c.room === 'blue fox'), server.calls.map(c => c.url));
    ok('the result carries the server sha', result.sha === await sha256Hex(vm.toJSON()), result);
    ok('and the size', result.size === vm.toJSON().length);

    server.calls.length = 0;
    await http.upload(vm);
    ok('a second upload skips the asset check', server.calls.length === 1 && server.calls[0].method === 'PUT',
        server.calls.map(c => c.url));

    section('late join by sha');
    const joiner = createSnapshotHttp({slug: 'blue fox', base: 'https://sq.test', fetchImpl: server.fetchImpl});
    ok('a late joiner gets the same project text', await joiner.fetchProject(result.sha) === vm.toJSON());
    let bad = null;
    await joiner.fetchProject('../../etc').catch(e => {
        bad = e.code;
    });
    ok('a malformed sha is refused before any request', bad === 'bad-sha');
    let missing = null;
    await joiner.fetchProject('f'.repeat(64)).catch(e => {
        missing = e.status;
    });
    ok('an unknown sha surfaces the status', missing === 404, missing);
}

section('failures');
{
    const server = makeServer({status: {'/api/rooms/r/pj': 413}});
    const http = createSnapshotHttp({slug: 'r', base: 'https://sq.test', fetchImpl: server.fetchImpl});
    let error = null;
    await http.upload(makeVM()).catch(e => {
        error = e;
    });
    ok('a refused project upload rejects with the status', error && error.code === 'http' && error.status === 413);

    const big = {
        toJSON: () => '{}',
        runtime: {targets: [{getCostumes: () => [{asset: {assetId: md5(5), dataFormat: 'png',
            data: new Uint8Array(ASSET_MAX_BYTES + 1)}}], getSounds: () => []}]}
    };
    const http2 = createSnapshotHttp({slug: 'r', base: 'https://sq.test', fetchImpl: makeServer().fetchImpl});
    let tooBig = null;
    await http2.upload(big).catch(e => {
        tooBig = e.code;
    });
    ok('an asset over 10 MB is refused locally', tooBig === 'asset-too-big', tooBig);

    const noSha = createSnapshotHttp({slug: 'r', fetchImpl: async () => Response.json({ok: true})});
    let shaError = null;
    await noSha.uploadProject('{}').catch(e => {
        shaError = e.code;
    });
    ok('a reply without a sha is an error', shaError === 'no-sha');
}

section('missing assets on the project put');
{
    const server = makeServer();
    let refused = false;
    const fetchImpl = async (url, init) => {
        if (!refused && init.method === 'PUT' && url.endsWith('/pj')) {
            refused = true;
            server.assets.clear();
            return Response.json({error: 'missing-assets', missing: [`${md5(2)}.png`]}, {status: 409});
        }
        return server.fetchImpl(url, init);
    };
    const http = createSnapshotHttp({slug: 'r', base: 'https://sq.test', fetchImpl});
    const vm = makeVM();
    const json = vm.toJSON();
    const result = await http.upload(vm, json);
    ok('a 409 missing-assets re-puts the named asset and retries', result.sha === await sha256Hex(json), result);
    ok('only the named asset went up again',
        server.calls.filter(c => c.method === 'PUT' && c.url.includes(`${md5(2)}.png?room=`)).length === 2,
        server.calls.map(c => `${c.method} ${c.url}`));

    const always = createSnapshotHttp({slug: 'r', base: 'https://sq.test', fetchImpl: async (url, init) => (
        init.method === 'PUT' && url.endsWith('/pj') ?
            Response.json({error: 'missing-assets', missing: []}, {status: 409}) :
            server.fetchImpl(url, init))});
    let status = null;
    await always.upload(vm).catch(e => {
        status = e.status;
    });
    ok('a second 409 surfaces instead of looping', status === 409, status);
}

section('asset store');
{
    const added = [];
    const storage = {
        AssetType: {ImageVector: 'v', ImageBitmap: 'b', Sound: 's', Font: 'f'},
        addWebStore: (types, getUrl) => added.push({types, getUrl})
    };
    const http = createSnapshotHttp({slug: 'r', base: 'https://sq.test'});
    ok('the web store attaches once', attachAssetStore(storage, http) && !attachAssetStore(storage, http));
    ok('it covers costumes, sounds and fonts', JSON.stringify(added[0].types) === '["v","b","s","f"]');
    ok('assets load from /api/assets by md5ext',
        added[0].getUrl({assetId: md5(7), dataFormat: 'svg'}) === `https://sq.test/api/assets/${md5(7)}.svg`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

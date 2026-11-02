process.removeAllListeners('warning');

const {createRequire} = process.getBuiltinModule('module');
const {readFileSync} = process.getBuiltinModule('fs');
const {fileURLToPath} = process.getBuiltinModule('url');

const loadPkg = createRequire(import.meta.url);
const {transformSync} = loadPkg('@babel/core');
const React = loadPkg('react');
const {renderToStaticMarkup} = loadPkg('react-dom/server');

const {ok, section, done, fakeClock} = await import('../../lib/together2/harness.test-util.mjs');
const peersMod = await import('../../lib/themes/peers.js');
const bufferMod = await import('../../lib/together2/buffer.js');
const playClientMod = await import('../../lib/together2/play-client.js');
const messagesMod = await import('./players-panel-messages.js');

const styles = new Proxy({}, {
    get: (unused, key) => (typeof key === 'string' && key !== '__esModule' ? key : null)
});

const loadJsx = (name, stubs) => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const presets = [
        [loadPkg.resolve('@babel/preset-env'), {targets: {node: 'current'}, ignoreBrowserslistConfig: true}],
        loadPkg.resolve('@babel/preset-react')
    ];
    const {code} = transformSync(readFileSync(file, 'utf8'), {
        babelrc: false,
        configFile: false,
        filename: file,
        presets
    });
    const mod = {exports: {}};
    const local = id => (Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : loadPkg(id));
    new Function('require', 'module', 'exports', code)(local, mod, mod.exports);
    return mod.exports;
};

const {
    default: PlayersPanel,
    buildPlayersRows,
    connectionBannerState,
    formatPingText,
    formatTickHealth
} = loadJsx('./players-panel.jsx', {
    '../../lib/themes/peers.js': Object.assign({__esModule: true}, peersMod),
    '../../lib/together2/buffer.js': Object.assign({__esModule: true}, bufferMod),
    '../../lib/together2/play-client.js': Object.assign({__esModule: true}, playClientMod),
    './players-panel-messages.js': Object.assign({__esModule: true}, messagesMod),
    './players-panel.css': styles
});

const messages = messagesMod.default;
const {createToastQueue} = playClientMod;

section('messages use sq.players.* ids, sentence case, and zero em dashes');
{
    const entries = Object.values(messages);
    ok('every message id starts with sq.players.',
        entries.every(m => m.id.startsWith('sq.players.')), entries.map(m => m.id));
    ok('no message contains an em dash',
        entries.every(m => m.defaultMessage.indexOf('—') === -1));
}

section('20-player rows carry peer colour, shape, team, ping bucket, and you');
{
    const raw = Array.from({length: 20}, (_, i) => ({
        id: i + 1,
        name: `Player ${i + 1}`,
        team: i % 2 === 0 ? 'Red' : 'Blue',
        pingMs: i === 0 ? 42 : (i === 1 ? 115 : (i === 2 ? 190 : 55))
    }));
    const rows = buildPlayersRows(raw, 1, 42);
    ok('builds 20 rows', rows.length === 20);
    const pairs = new Set(rows.map(r => `${r.color}:${r.shape}`));
    ok('all 20 rows have distinct colour-times-shape pairs', pairs.size === 20, pairs.size);
    ok('marks only slot 1 as you', rows[0].you === true && rows.slice(1).every(r => r.you === false));
    ok('preserves team names', rows[0].team === 'Red' && rows[1].team === 'Blue');
    ok('assigns good, ok, and weak ping buckets with ms',
        rows[0].ping === 'good' && formatPingText(null, rows[0].ping, rows[0].pingMs) === 'Good · 42 ms' &&
        rows[1].ping === 'ok' && formatPingText(null, rows[1].ping, rows[1].pingMs) === 'OK · 115 ms' &&
        rows[2].ping === 'weak' && formatPingText(null, rows[2].ping, rows[2].pingMs) === 'Weak · 190 ms');
}

section('quiet join and leave toasts last 2 seconds and merge bursts');
{
    const clock = fakeClock();
    const toasts = createToastQueue({now: clock.now});
    const first = toasts.join('Ada');
    ok('one join says Ada joined', first.text === 'Ada joined' && toasts.current().text === 'Ada joined');
    clock.advance(400);
    toasts.join('Ben');
    toasts.join('Cam');
    const burst = toasts.join('Dee');
    ok('a burst of four joins merges into 4 players joined',
        burst.text === '4 players joined' && burst.count === 4, burst);
    clock.advance(1999);
    ok('the toast stays on screen for 2 seconds from the last burst item',
        toasts.current() !== null && toasts.current().text === '4 players joined');
    clock.advance(2);
    ok('the toast disappears after 2 seconds', toasts.current() === null);
    toasts.leave('Ben');
    toasts.leave('Cam');
    ok('leave bursts merge into 2 players left', toasts.current().text === '2 players left');
    toasts.reconnected();
    ok('silent reconnect shows Back in the game', toasts.current().text === 'Back in the game');
}

section('connection banner states');
{
    const clean = connectionBannerState({weakConnection: false, reconnecting: false, graceExpired: false});
    ok('clean connection shows no banner', clean === null);
    const weak = connectionBannerState({weakConnection: true, reconnecting: false, graceExpired: false});
    ok('weak connection shows Weak connection with no numbers',
        weak && weak.kind === 'weak' && weak.text === 'Weak connection');
    const recon = connectionBannerState({weakConnection: true, reconnecting: true, graceExpired: false});
    ok('reconnecting takes precedence over weak connection',
        recon && recon.kind === 'reconnecting' && recon.text === 'Reconnecting');
    const expired = connectionBannerState({weakConnection: true, reconnecting: true, graceExpired: true});
    ok('past RESUME_GRACE_MS offers Join again',
        expired && expired.kind === 'grace-expired' && expired.actionLabel === 'Join again');
}

section('host health frame shows tick p95 against standard buckets and each player rtt bucket');
{
    const baseHealth = {
        type: 'health',
        t: 20,
        players: 3,
        tickP50: 2,
        tickP95: 5,
        bytesPerSec: 18420,
        downPerPlayer: 4605,
        upPerPlayer: 410,
        keyframeBytes: 912,
        rewindMs: 150,
        deadlineJumps: 0,
        rtt: {1: 34, 2: 112, 3: 185},
        lateTicks: 0
    };
    const p50 = formatTickHealth(null, baseHealth);
    ok('tickP95 <= 5 ms is good and in the p50 band',
        p50.bucket === 'good' && p50.band === 'p50' && p50.label === 'Tick p95 5 ms · p50 ok (≤ 5 ms)', p50);
    const p95 = formatTickHealth(null, Object.assign({}, baseHealth, {tickP95: 11}));
    ok('tickP95 <= 12 ms is good and in the p95 band',
        p95.bucket === 'good' && p95.band === 'p95' && p95.label === 'Tick p95 11 ms · p95 ok (≤ 12 ms)', p95);
    const ceiling = formatTickHealth(null, Object.assign({}, baseHealth, {tickP95: 20}));
    ok('tickP95 <= 25 ms is ok and in the ceiling band',
        ceiling.bucket === 'ok' && ceiling.band === 'ceiling' &&
        ceiling.label === 'Tick p95 20 ms · near ceiling (≤ 25 ms)', ceiling);
    const over = formatTickHealth(null, Object.assign({}, baseHealth, {tickP95: 30}));
    ok('tickP95 > 25 ms is weak and in the over band',
        over.bucket === 'weak' && over.band === 'over' && over.label === 'Tick p95 30 ms · over 25 ms', over);

    const rows = buildPlayersRows([
        {id: 1, name: 'Host'},
        {id: 2, name: 'Peer Two'},
        {id: 3, name: 'Peer Three'}
    ], 1, null, baseHealth.rtt);
    ok('each player row gets rtt and ping bucket from health.rtt',
        rows[0].pingMs === 34 && rows[0].ping === 'good' &&
        rows[1].pingMs === 112 && rows[1].ping === 'ok' &&
        rows[2].pingMs === 185 && rows[2].ping === 'weak', rows);

    const players20 = Array.from({length: 20}, (_, i) => ({
        id: i + 1,
        name: `Player ${i + 1}`,
        team: i % 2 === 0 ? 'Red' : 'Blue'
    }));
    const rtt20 = {};
    for (let i = 1; i <= 20; i++) rtt20[i] = i % 3 === 0 ? 185 : (i % 2 === 0 ? 112 : 34);
    const html = renderToStaticMarkup(React.createElement(PlayersPanel, {
        open: true,
        meId: 1,
        players: players20,
        health: Object.assign({}, baseHealth, {players: 20, tickP95: 8, rtt: rtt20}),
        toastText: '4 players joined',
        weakConnection: true
    }));
    ok('rendered PlayersPanel shows 20 rows, host tick p95 health bar, toast, and weak connection pill',
        html.includes('data-sq-host-health=""') &&
        html.includes('data-tick-bucket="good"') &&
        html.includes('data-tick-band="p95"') &&
        html.includes('Tick p95 8 ms · p95 ok (≤ 12 ms)') &&
        html.includes('4 players joined') &&
        html.includes('Weak connection') &&
        html.includes('data-player-slot="20"'));
}

done();

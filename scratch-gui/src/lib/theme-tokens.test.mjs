process.removeAllListeners('warning');

const {BRAND, DAY, KIT_COLORS, NIGHT, SCALE, sqTokens} = await import('./themes/tokens.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) pass++;
    else fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && typeof detail !== 'undefined' ? ` : ${JSON.stringify(detail)}` : ''}`);
};

const SITE_NIGHT = {
    'sq-bg': '#10142a', 'sq-panel': '#161c36', 'sq-raised': '#232b4d', 'sq-line': '#2e3760', 'sq-line-hi': '#454f80',
    'sq-text': '#f2f4fb', 'sq-text-muted': '#b8bfd9', 'sq-text-faint': '#9aa3c7', 'sq-link': '#22d3ee',
    'sq-focus': '#22d3ee', 'sq-success': '#2fbf71', 'sq-warn': '#ffb020', 'sq-danger': '#ff5a6e', 'sq-info': '#22d3ee'
};
const SITE_DAY = {
    'sq-bg': '#f7f6fc', 'sq-panel': '#ffffff', 'sq-raised': '#efecf9', 'sq-line': '#d9d5ea', 'sq-line-hi': '#b9b2d6',
    'sq-text': '#1b1f3a', 'sq-text-muted': '#4f5677', 'sq-text-faint': '#646a8a', 'sq-link': '#5b3aa0',
    'sq-focus': '#5b3aa0', 'sq-warn': '#9a5b00', 'sq-danger': '#c62839'
};
const DAY_AA = {'sq-success': '#167443', 'sq-info': '#0a7089'};

const differ = (mine, site) => Object.keys(site).filter(key => mine[key] !== site[key]);

ok('brand ramp matches the site', BRAND[500] === '#9966ff' && BRAND[700] === '#774dcb' && BRAND[800] === '#5b3aa0');
ok('Night surfaces and text match the site', differ(NIGHT, SITE_NIGHT).length === 0, differ(NIGHT, SITE_NIGHT));
ok('Day surfaces and text match the site', differ(DAY, SITE_DAY).length === 0, differ(DAY, SITE_DAY));
ok('Day success and info stay darker for AA on raised', differ(DAY, DAY_AA).length === 0, differ(DAY, DAY_AA));
ok('Night and Day define the same keys', Object.keys(NIGHT).sort().join() === Object.keys(DAY).sort().join());

const px = value => Number(String(value).replace('px', ''));
const textSizes = Object.keys(SCALE).filter(key => key.startsWith('sq-text-'));
ok('no text token is under 14px', textSizes.every(key => px(SCALE[key]) >= 14), textSizes.map(k => SCALE[k]));
ok('type scale follows the site', SCALE['sq-text-lg'] === '22px' && SCALE['sq-text-xl'] === '28px');
ok('text weights are the site weights', ['600', '700', '800'].includes(SCALE['sq-weight-regular']));
ok('desktop targets are 40px, touch targets 44px', SCALE['sq-target'] === '40px' && SCALE['sq-target-touch'] === '44px');
ok('shape language is chip 4, panel 10, card 16, sheet 20', SCALE['sq-radius-chip'] === '4px' &&
    SCALE['sq-radius-panel'] === '10px' && SCALE['sq-radius-card'] === '16px' && SCALE['sq-radius-sheet'] === '20px');
ok('Nunito leads the font stack', SCALE['sq-font'].startsWith('Nunito'));
ok('the yellow accent is not a shell token', !Object.values(SCALE).includes('#ffd23f'));
ok('kit colours are untouched', KIT_COLORS.squiggleworld.color1 === '#8cc63f' && KIT_COLORS.squigglearena.color1 === '#b8336a');

const night = sqTokens({dark: true, reducedMotion: false});
const calm = sqTokens({dark: false, reducedMotion: true});
ok('sqTokens picks Night for dark', night['sq-bg'] === NIGHT['sq-bg'] && night['sq-motion-fast'] === '140ms');
ok('sqTokens picks Day and calm motion', calm['sq-bg'] === DAY['sq-bg'] && calm['sq-motion-shift'] === '0');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

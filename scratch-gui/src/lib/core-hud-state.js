import {readGameSettings} from './game-settings.js';
import {findRulesTarget, rulesMark} from './rules/rule-blocks.js';
import {playerName, playerValue, teamName, timeLeft} from './together2/game-state.js';

const HEALTH_KEYS = ['hp', 'health', 'hearts', 'lives', 'hull', 'energy', 'p1 hp', 'p1_hp', 'player_hp'];
const SHIELD_KEYS = ['shield', 'armor', 'armour', 'p1 shield', 'p1_shield'];
const AMMO_KEYS = ['ammo', 'bolts', 'charges', 'shells', 'shards', 'p1 ammo', 'p1_ammo'];
const AMMO_KINDS = [
    'bullets', 'shells', 'cells', 'rockets', 'bolts',
    'charges', 'shards', 'arrows', 'darts', 'gems'
];
const WEAPON_KEYS = ['weapon', 'cur_wpn', 'wpn', 'cur_weapon', 'current_weapon'];
const WEAPON_SLOT_KEYS = ['weapon_slots', 'weapons', 'wpn_slots'];
const ITEM_COLOR_WORDS = 'gold|yellow|amber|red|crimson|blue|cyan|ice|green|lime|jade|purple|violet';
const ITEM_PATTERN = new RegExp(`(^|[_ ]|${ITEM_COLOR_WORDS})(key|keycard|card|pass)$`);
const ITEM_CONCAT_PATTERN = new RegExp(`(${ITEM_COLOR_WORDS})(key|keycard|card|pass)\\b`, 'gi');
const ITEM_EXACT_PATTERN = new RegExp(`^(${ITEM_COLOR_WORDS})(key|keycard|card|pass)$`, 'i');
const ITEM_TONES = [
    ['gold', /gold|yellow|amber/],
    ['red', /red|crimson/],
    ['blue', /blue|cyan|ice/],
    ['green', /green|lime|jade/],
    ['purple', /purple|violet/]
];
const MAX_WEAPON_SLOTS = 7;
const DEFAULT_WEAPON_SLOTS = 3;
const MAX_ITEMS = 4;
const SCORE_KEYS = ['score', 'points', 'pts', 'frags', 'captures', 'tags', 'coins', 'gems', 'stars', 'clears', 'laps'];
const TIMER_KEYS = [
    'time_left', 'time left', 'timer', 'cur_timer', 'last_timer',
    'countdown', 'round_time', 'round timer', 'round_timer'
];
const ROUND_NAME_KEYS = [
    'round_name', 'round name', 'roundname', 'round_title', 'round title',
    'phase_name', 'phase name', 'phase'
];
const TIMER_SUFFIX_WORDS = new Set(['timer', 'clock', 'time', 'left', 'countdown']);
const GENERIC_TIMER_WORDS = new Set([
    'time', 'timer', 'clock', 'countdown', 'left',
    'round', 'match', 'game', 'main', 'cur', 'current', 'last', 'default'
]);
const STATUS_KEYS = ['core_carrier', 'core carrier', 'last_core_state', 'wave', 'checkpoint', 'objective', 'status'];

const numOrNull = val => {
    if (val === null || typeof val === 'undefined' || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
};

const formatClock = seconds => {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const collectTargetVars = runtime => {
    const map = {};
    if (!runtime || !Array.isArray(runtime.targets)) return map;
    runtime.targets.forEach(target => {
        if (!target || !target.isOriginal || !target.variables) return;
        Object.keys(target.variables).forEach(id => {
            const v = target.variables[id];
            if (!v || !v.name) return;
            const key = String(v.name).trim()
                .toLowerCase();
            if (!(key in map) || target.isStage || target.getName() === 'Game Rules') {
                map[key] = v.value;
            }
        });
    });
    return map;
};

const readDefaultPlayerValues = mark => {
    const out = {};
    const list = (mark && (mark.players || mark.playerValues)) || [];
    if (!Array.isArray(list)) return out;
    list.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const name = String(item.name || item.n || '').trim()
            .toLowerCase();
        const def = typeof item.default === 'undefined' ? item.d : item.default;
        if (name && typeof def !== 'undefined') out[name] = def;
    });
    return out;
};

const has = (src, key) => !!src && Object.prototype.hasOwnProperty.call(src, key);

const numberIn = (src, key) => {
    if (has(src, key)) {
        const n = numOrNull(src[key]);
        if (n !== null) return n;
    }
    const lastKey = `last_${key}`;
    return has(src, lastKey) ? numOrNull(src[lastKey]) : null;
};

const pickFirstNumber = (sources, keys) => {
    for (const src of sources) {
        for (const key of keys) {
            const n = numberIn(src, key);
            if (n !== null) return {key, value: n};
        }
    }
    return null;
};

const splitIdentifierWords = text => String(text === null || typeof text === 'undefined' ? '' : text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(ITEM_CONCAT_PATTERN, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasIdentifierShape = text => (
    /[_-]/.test(text) ||
    /[a-z0-9][A-Z]/.test(text) ||
    /[A-Z]{2,}[a-z]/.test(text) ||
    ITEM_EXACT_PATTERN.test(text)
);

const humanLabel = (raw, fallback = '') => {
    const str = String(raw === null || typeof raw === 'undefined' ? '' : raw).trim();
    if (!str) return fallback;
    if (!hasIdentifierShape(str)) {
        const clean = str.replace(/\s+/g, ' ');
        return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    const words = splitIdentifierWords(str).toLowerCase();
    if (!words) return fallback;
    return words.charAt(0).toUpperCase() + words.slice(1);
};

const roundNameFromRules = (mark, gameValues, vars) => {
    const fromMark = mark && (mark.roundName || mark.round_name || mark.phaseName || mark.phase_name);
    if (typeof fromMark === 'string' && fromMark.trim()) {
        return humanLabel(fromMark, 'Time');
    }
    for (const key of ROUND_NAME_KEYS) {
        const val = gameValues[key] ?? vars[key];
        if (typeof val === 'string' && val.trim()) {
            return humanLabel(val, 'Time');
        }
    }
    return '';
};

const timerLabel = (rawName, mark, gameValues, vars) => {
    const roundLabel = roundNameFromRules(mark, gameValues, vars);
    if (roundLabel) return roundLabel;
    const words = splitIdentifierWords(rawName)
        .toLowerCase()
        .split(' ')
        .filter(Boolean);
    while (words.length > 0 && TIMER_SUFFIX_WORDS.has(words[words.length - 1])) {
        words.pop();
    }
    const meaningful = words.filter(w => !GENERIC_TIMER_WORDS.has(w));
    if (meaningful.length === 0) return 'Time';
    const joined = words.join(' ');
    return joined.charAt(0).toUpperCase() + joined.slice(1);
};

const itemTone = name => {
    const lower = String(name).toLowerCase();
    const hit = ITEM_TONES.find(pair => pair[1].test(lower));
    return hit ? hit[0] : 'purple';
};

const collectItems = (sources, declared) => {
    const names = [];
    const seen = new Set();
    const add = name => {
        const key = String(name).trim()
            .toLowerCase();
        if (!key || seen.has(key) || !ITEM_PATTERN.test(key) || key.startsWith('last_')) return;
        seen.add(key);
        names.push(key);
    };
    declared.forEach(add);
    sources.forEach(src => Object.keys(src || {}).forEach(add));
    return names.slice(0, MAX_ITEMS).map(id => {
        const hit = pickFirstNumber(sources, [id]);
        const count = hit ? Math.max(0, hit.value) : 0;
        return {id, label: humanLabel(id, 'Key'), tone: itemTone(id), count, owned: count > 0};
    });
};

const collectAmmoKinds = (sources, mainKey) => AMMO_KINDS
    .filter(kind => kind !== mainKey)
    .map(kind => {
        const hit = pickFirstNumber(sources, [kind]);
        return hit ? {id: kind, label: humanLabel(kind), value: Math.max(0, hit.value)} : null;
    })
    .filter(Boolean);

const moodFor = (hp, maxHp) => {
    if (typeof hp !== 'number') return 'good';
    if (hp <= 0) return 'out';
    const ratio = hp / Math.max(1, maxHp || 100);
    if (ratio >= 0.8) return 'great';
    if (ratio >= 0.55) return 'good';
    if (ratio >= 0.3) return 'worried';
    return 'low';
};

const teamTone = name => {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('red') || lower.includes('coral') || lower.includes('crimson') || lower.includes('fire')) {
        return 'red';
    }
    if (lower.includes('blue') || lower.includes('cyan') || lower.includes('ice') || lower.includes('cobalt')) {
        return 'blue';
    }
    if (lower.includes('gold') || lower.includes('amber') || lower.includes('yellow') || lower.includes('sun')) {
        return 'gold';
    }
    if (lower.includes('green') || lower.includes('lime') || lower.includes('mint') || lower.includes('jade')) {
        return 'green';
    }
    return 'purple';
};

const OWN_HUD_SPRITES = {bar: 'StatusHUD', timer: 'TimerHUD'};
const OWN_HUD_KITS = ['squigglearena', 'squigglescores'];

const targetName = target => {
    if (!target) return '';
    return (target.getName && target.getName()) || (target.sprite && target.sprite.name) || '';
};

const hasSprite = (runtime, name) => Array.isArray(runtime.targets) &&
    runtime.targets.some(target => target && target.isOriginal && !target.isStage && targetName(target) === name);

const usesHudKits = (vm, runtime) => {
    const manager = (vm && vm.extensionManager) || (runtime && runtime.extensionManager);
    if (!manager || typeof manager.isExtensionLoaded !== 'function') return false;
    return OWN_HUD_KITS.some(id => manager.isExtensionLoaded(id));
};

const resolveOwnHud = (vm, runtime, mode) => mode === 'replace' || (mode !== 'keep' && usesHudKits(vm, runtime));

const statusBarLayout = (vitals, leaderboard, liveFrags) => {
    if (!vitals) return null;
    const filled = [
        typeof vitals.hp === 'number',
        typeof vitals.shield === 'number',
        typeof vitals.ammo === 'number',
        !!vitals.weapon
    ].filter(Boolean).length;
    if (filled === 0) return null;
    const me = leaderboard && leaderboard.rows ? leaderboard.rows.find(row => row.isMe) : null;
    let frags = null;
    if (leaderboard && liveFrags !== null) {
        frags = {label: leaderboard.boardName, value: liveFrags, place: me ? me.rank : 0};
    } else if (me) {
        frags = {label: leaderboard.boardName, value: me.score, place: me.rank};
    }
    const soloBoard = !!leaderboard && leaderboard.rows.length <= 1;
    return {
        layout: filled >= 2 ? 'band' : 'compact',
        frags: filled >= 2 ? frags : null,
        foldsBoard: filled >= 2 && soloBoard && !!frags
    };
};

export const extractHudState = (vm, netOverride) => {
    const runtime = vm && (vm.runtime || vm);
    const settings = readGameSettings(vm);
    const sections = settings.hud || {
        enabled: true,
        scores: true,
        teams: true,
        timer: true,
        health: true
    };
    if (!runtime || sections.enabled === false) {
        return {
            enabled: false,
            sections,
            hasHudContent: false,
            timer: null,
            teams: [],
            vitals: null,
            leaderboard: null,
            statusPill: '',
            bar: null,
            replaces: {bar: false, timer: false}
        };
    }

    const globalNet = typeof window === 'undefined' ? null : window.SquiggleNet;
    const net = typeof netOverride === 'undefined' ? globalNet : netOverride;
    const game = net && net.game ? net.game : null;
    const mySlot = net && Number.isInteger(net.slot) && net.slot > 0 ? net.slot : 1;
    const mark = rulesMark(runtime);
    const hasRulesTarget = !!findRulesTarget(runtime);
    const vars = collectTargetVars(runtime);
    const defaults = readDefaultPlayerValues(mark);

    const myValues = {};
    if (game && game.players && game.players[String(mySlot)]) {
        Object.keys(game.players[String(mySlot)]).forEach(k => {
            myValues[String(k).toLowerCase()] = game.players[String(mySlot)][k];
        });
    }
    const gameValues = {};
    if (game && game.values) {
        Object.keys(game.values).forEach(k => {
            gameValues[String(k).toLowerCase()] = game.values[k];
        });
    }

    const sources = [myValues, gameValues, vars, defaults];
    const declaredBoards = Array.isArray(mark && mark.boards) ? mark.boards : [];
    const liveBoards = game && Array.isArray(game.boards) ? game.boards : [];
    const boardSource = declaredBoards[0] || liveBoards[0] || null;
    const boardKey = boardSource ? String(boardSource.name || boardSource.n || '').toLowerCase() : '';
    const hudLabels = sections && sections.labels && typeof sections.labels === 'object' ? sections.labels : {};
    const stripPlayerPrefix = key => String(key || '').replace(/^(p\d+|player)[_ ]+/i, '');
    const pickHudLabel = (keys, fallback) => {
        for (const k of keys) {
            const low = k ? String(k).trim()
                .toLowerCase() : '';
            if (low && typeof hudLabels[low] === 'string' && hudLabels[low].trim()) {
                return hudLabels[low].trim();
            }
        }
        return fallback;
    };

    let timer = null;
    if (sections.timer !== false) {
        if (game && game.timers && Object.keys(game.timers).length > 0) {
            const names = Object.keys(game.timers);
            const activeName = names[0];
            const rem = timeLeft(game, activeName);
            const defaultTimerLabel = timerLabel(activeName, mark, gameValues, vars);
            timer = {
                label: pickHudLabel([activeName, 'timer', 'time'], defaultTimerLabel),
                seconds: rem,
                formatted: formatClock(rem)
            };
        } else {
            const foundTimer = pickFirstNumber([gameValues, vars], TIMER_KEYS);
            if (foundTimer && foundTimer.value >= 0) {
                const defaultTimerLabel = roundNameFromRules(mark, gameValues, vars) || 'Time';
                timer = {
                    label: pickHudLabel([foundTimer.key, 'timer', 'time'], defaultTimerLabel),
                    seconds: foundTimer.value,
                    formatted: formatClock(foundTimer.value)
                };
            }
        }
    }

    const teams = [];
    if (sections.teams !== false) {
        const declaredTeams = Array.isArray(mark && mark.teams) ? mark.teams : [];
        if (declaredTeams.length >= 2) {
            declaredTeams.forEach(rawName => {
                const name = typeof rawName === 'object' ? String(rawName.name || rawName.n || '') : String(rawName);
                if (!name) return;
                const low = name.toLowerCase();
                const scoreHit = pickFirstNumber(
                    [gameValues, myValues, vars],
                    [`${low}_score`, `${low}_pts`, `${low}_points`, low]
                );
                let score = scoreHit ? scoreHit.value : 0;
                if (!scoreHit && game && game.teams && boardKey) {
                    score = Object.keys(game.teams || {})
                        .filter(slot => teamName(game, slot, declaredTeams) === name)
                        .reduce((sum, slot) => sum + (numOrNull(playerValue(game, slot, boardKey)) || 0), 0);
                }
                teams.push({
                    name: humanLabel(name, name),
                    score,
                    tone: teamTone(name),
                    mine: !!(game && game.teams) && teamName(game, mySlot, declaredTeams) === name
                });
            });
        } else if ('red_score' in vars || 'blue_score' in vars || 'red_score' in gameValues) {
            teams.push({
                name: 'Red',
                score: numOrNull(gameValues.red_score ?? vars.red_score) || 0,
                tone: 'red'
            });
            teams.push({
                name: 'Blue',
                score: numOrNull(gameValues.blue_score ?? vars.blue_score) || 0,
                tone: 'blue'
            });
        }
    }

    let vitals = null;
    if (sections.health !== false) {
        const hpHit = pickFirstNumber(sources, HEALTH_KEYS);
        const shieldHit = pickFirstNumber(sources, SHIELD_KEYS);
        const ammoHit = pickFirstNumber(sources, AMMO_KEYS);
        const weaponHit = pickFirstNumber(sources, WEAPON_KEYS);
        const slotsHit = pickFirstNumber(sources, WEAPON_SLOT_KEYS);
        const items = collectItems(sources, Object.keys(defaults));
        const ammoKinds = collectAmmoKinds(sources, ammoHit ? ammoHit.key : '');
        if (hpHit || shieldHit || ammoHit) {
            const hpKey = hpHit ? hpHit.key : null;
            const hpBase = hpKey ? stripPlayerPrefix(hpKey) : '';
            const maxHpDefault = hpKey && numOrNull(defaults[hpKey]) ? Math.max(1, Number(defaults[hpKey])) : 100;
            const shieldKey = shieldHit ? shieldHit.key : null;
            const shieldBase = shieldKey ? stripPlayerPrefix(shieldKey) : '';
            const maxShieldDefault = shieldKey && numOrNull(defaults[shieldKey]) ?
                Math.max(1, Number(defaults[shieldKey])) :
                100;
            const ammoKey = ammoHit ? ammoHit.key : null;
            const ammoBase = ammoKey ? stripPlayerPrefix(ammoKey) : '';
            const hp = hpHit ? Math.max(0, hpHit.value) : null;
            const maxHp = hpHit ? Math.max(maxHpDefault, hpHit.value) : 100;
            const weaponSlot = weaponHit ? Math.round(weaponHit.value) : null;
            const slotCount = Math.min(MAX_WEAPON_SLOTS, Math.max(
                slotsHit ? Math.round(slotsHit.value) : DEFAULT_WEAPON_SLOTS,
                weaponSlot || 0
            ));
            const isLives = hpBase === 'lives' || hpBase === 'hearts';
            const derivedHpLabel = isLives ?
                'Lives' :
                (!hpBase || hpBase === 'hp' || hpBase === 'health' ? 'Health' : humanLabel(hpBase, 'Health'));
            const isShield = shieldBase === 'shield';
            const derivedShieldLabel = isShield ? 'Shield' : humanLabel(shieldBase || 'armor', 'Armor');
            const derivedAmmoLabel = humanLabel(ammoBase || 'ammo', 'Ammo');
            vitals = {
                hp,
                maxHp,
                hpLabel: pickHudLabel([hpKey, hpBase, 'health', 'hp'], derivedHpLabel),
                hpKind: isLives ? 'lives' : 'health',
                shield: shieldHit ? Math.max(0, shieldHit.value) : null,
                maxShield: shieldHit ? Math.max(maxShieldDefault, shieldHit.value) : 100,
                shieldKind: isShield ? 'shield' : 'armor',
                shieldLabel: pickHudLabel([shieldKey, shieldBase, 'shield', 'armor'], derivedShieldLabel),
                ammo: ammoHit ? Math.max(0, ammoHit.value) : null,
                ammoLabel: pickHudLabel([ammoKey, ammoBase, 'ammo'], derivedAmmoLabel),
                ammoKinds,
                weapon: weaponSlot !== null && weaponSlot >= 1 ? {slot: weaponSlot, slots: slotCount} : null,
                weaponLabel: pickHudLabel([weaponHit && weaponHit.key, 'weapon', 'weapons'], 'Weapon'),
                items,
                itemsLabel: pickHudLabel(['items', 'keys'], 'Keys'),
                mood: moodFor(hp, maxHp)
            };
        }
    }

    let leaderboard = null;
    if (sections.scores !== false) {
        const gameBoards = game && Array.isArray(game.boards) ? game.boards : [];
        if (gameBoards.length > 0 && Array.isArray(gameBoards[0].top) && gameBoards[0].top.length > 0) {
            const first = gameBoards[0];
            const declaredTeams = Array.isArray(mark && mark.teams) ? mark.teams : [];
            const rows = first.top.slice(0, 6).map((entry, idx) => {
                const slot = entry[0];
                const score = Number.isFinite(Number(entry[1])) ? Number(entry[1]) : 0;
                const pName = (game.names && playerName(game, slot)) || `Player ${slot}`;
                const tName = game.teams ? teamName(game, slot, declaredTeams) : '';
                return {
                    rank: idx + 1,
                    slot,
                    name: pName,
                    score,
                    isMe: Number(slot) === Number(mySlot),
                    tone: tName ? teamTone(tName) : ''
                };
            });
            const rawBoardName = first.n || first.name || 'Score';
            leaderboard = {
                boardName: pickHudLabel(
                    [rawBoardName, boardKey, 'frags', 'scores', 'score', 'board'],
                    humanLabel(rawBoardName, 'Score')
                ),
                rows
            };
        } else {
            const primaryBoard = declaredBoards[0] ?
                String(declaredBoards[0].name || declaredBoards[0].n || 'Score') :
                '';
            const searchKeys = primaryBoard ? [primaryBoard.toLowerCase()].concat(SCORE_KEYS) : SCORE_KEYS;
            const scoreHit = pickFirstNumber(sources, searchKeys);
            if (scoreHit || (hasRulesTarget && primaryBoard)) {
                const label = primaryBoard || scoreHit.key;
                const val = scoreHit ? scoreHit.value : 0;
                const rows = [{
                    rank: 1,
                    slot: mySlot,
                    name: (game && playerName(game, mySlot)) || 'You',
                    score: val,
                    isMe: true,
                    tone: ''
                }];
                if (game && game.names) {
                    Object.keys(game.names).forEach(slot => {
                        if (Number(slot) === Number(mySlot)) return;
                        const otherScore = numOrNull(playerValue(game, slot, label.toLowerCase())) ?? 0;
                        rows.push({
                            rank: rows.length + 1,
                            slot: Number(slot),
                            name: playerName(game, slot) || `Player ${slot}`,
                            score: otherScore,
                            isMe: false,
                            tone: ''
                        });
                    });
                    rows.sort((a, b) => b.score - a.score);
                    rows.forEach((r, idx) => {
                        r.rank = idx + 1;
                    });
                }
                leaderboard = {
                    boardName: pickHudLabel(
                        [label, boardKey, 'frags', 'scores', 'score', 'board'],
                        humanLabel(label, 'Score')
                    ),
                    rows: rows.slice(0, 6)
                };
            }
        }
    }

    let statusPill = '';
    for (const key of STATUS_KEYS) {
        const val = gameValues[key] ?? vars[key];
        if (typeof val === 'string' && val.trim()) {
            const trimmed = val.trim();
            statusPill = hasIdentifierShape(trimmed) ? humanLabel(trimmed) : trimmed;
            break;
        }
    }

    const replaceOwn = resolveOwnHud(vm, runtime, settings.ownHud);
    const ownBar = hasSprite(runtime, OWN_HUD_SPRITES.bar);
    const ownTimer = hasSprite(runtime, OWN_HUD_SPRITES.timer);
    if (ownTimer && !replaceOwn) timer = null;
    const liveFragsHit = boardKey ? pickFirstNumber([myValues], [boardKey]) : null;
    let bar = statusBarLayout(vitals, leaderboard, liveFragsHit ? liveFragsHit.value : null);
    if (ownBar && !replaceOwn) bar = null;
    const replaces = {bar: ownBar && replaceOwn && !!bar, timer: ownTimer && replaceOwn && !!timer};
    const hasHudContent = !!(timer || teams.length > 0 || bar || leaderboard || statusPill);

    return {
        enabled: true,
        sections,
        hasHudContent,
        timer,
        teams,
        vitals,
        leaderboard,
        statusPill,
        bar,
        replaces
    };
};

export {
    OWN_HUD_KITS,
    OWN_HUD_SPRITES,
    formatClock,
    humanLabel,
    moodFor,
    timerLabel
};

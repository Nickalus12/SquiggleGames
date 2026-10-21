import {harness} from './fixtures/load.mjs';

const {
    default: reducer, checkerInitialState, setCheckerItems, openCheckerPanel, closeCheckerPanel, toggleCheckerPanel,
    countBySeverity, topSeverity
} = await import('../../reducers/checker.js');
const {ok, done} = harness();

const items = [{severity: 'info'}, {severity: 'warn'}, {severity: 'info'}];

let state = reducer(undefined, {type: '@@INIT'});
ok('starts empty, closed and unchecked', state === checkerInitialState && !state.open && !state.checked &&
    state.items.length === 0);
state = reducer(state, setCheckerItems(items));
ok('items land and mark the project checked', state.items === items && state.checked);
ok('a bad payload becomes an empty list', reducer(state, setCheckerItems(null)).items.length === 0);
ok('open, close and toggle', reducer(state, openCheckerPanel()).open &&
    !reducer(reducer(state, openCheckerPanel()), closeCheckerPanel()).open &&
    reducer(state, toggleCheckerPanel()).open && !reducer(reducer(state, toggleCheckerPanel()), toggleCheckerPanel()).open);
ok('unknown actions keep the same state', reducer(state, {type: 'other'}) === state);
ok('counts by severity', JSON.stringify(countBySeverity(items)) === JSON.stringify({error: 0, warn: 1, info: 2}));
ok('the top severity wins', topSeverity(items) === 'warn' && topSeverity([{severity: 'error'}].concat(items)) ===
    'error' && topSeverity([]) === null);
done();

import {
    computeJointGlowOpacity,
    computeJointGlowStrokeWidth,
    classifyJointConnectionKind,
    buildJointEdgePath
} from './joint-glow.js';
import {
    computeApproachStartRadius,
    computeZoomSnapRadii,
    isSameStackInsertionJoint,
    selectCandidateWithHysteresis
} from './snap-policy.js';
import {
    nextProcedureInputName,
    deduplicateDisplayNames,
    nextProcedureDefaultName,
    ensureUniqueProcCode,
    describeProcedurePreview
} from './custom-blocks.js';
import {
    computeZoomScrollTranslation,
    isToolboxXmlChanged
} from './scale-perf.js';

const assert = {
    ok (cond, msg = 'Assertion failed') {
        if (!cond) {
            throw new Error(msg);
        }
    },
    equal (actual, expected) {
        if (actual !== expected) {
            throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    },
    notEqual (actual, expected) {
        if (actual === expected) {
            throw new Error(`Expected value to differ from ${JSON.stringify(expected)}`);
        }
    },
    deepEqual (actual, expected) {
        const a = JSON.stringify(actual);
        const b = JSON.stringify(expected);
        if (a !== b) {
            throw new Error(`Expected ${b}, got ${a}`);
        }
    }
};

const testApproachStartRadiusAndStroke = () => {
    assert.equal(computeApproachStartRadius(0.675, 48), 96);
    assert.equal(computeApproachStartRadius(1, 48), 96);
    assert.equal(computeApproachStartRadius(3, 48), 96);
    assert.equal(computeApproachStartRadius(0.3, 48), 120);

    assert.equal(computeJointGlowStrokeWidth(0.3), 3.5);
    assert.equal(computeJointGlowStrokeWidth(0.675), 3.5);
    assert.equal(computeJointGlowStrokeWidth(1), 2.5);
    assert.equal(computeJointGlowStrokeWidth(3), 1.75);
};

const testJointGlowOpacity = () => {
    const scale = 0.675;
    assert.equal(computeJointGlowOpacity(96, 48, {scale}), 0);
    assert.ok(Math.abs(computeJointGlowOpacity(84, 48, {scale}) - 0.13) <= 0.02);
    assert.ok(Math.abs(computeJointGlowOpacity(72, 48, {scale}) - 0.425) <= 0.02);
    assert.ok(Math.abs(computeJointGlowOpacity(60, 48, {scale}) - 0.72) <= 0.02);
    assert.equal(computeJointGlowOpacity(48, 48, {scale}), 0.85);
    assert.equal(computeJointGlowOpacity(24, 48, {scale}), 0.85);

    assert.equal(computeJointGlowOpacity(97, 48, {scale, reducedMotion: true}), 0);
    assert.equal(computeJointGlowOpacity(96, 48, {scale, reducedMotion: true}), 0.7);
    assert.equal(computeJointGlowOpacity(72, 48, {scale, reducedMotion: true}), 0.7);
    assert.equal(computeJointGlowOpacity(48, 48, {scale, reducedMotion: true}), 0.7);
    assert.equal(computeJointGlowOpacity(24, 48, {scale, reducedMotion: true}), 0.7);
};

const testJointConnectionClassificationAndPaths = () => {
    assert.equal(classifyJointConnectionKind({type: 4}, {type: 3}), 'next');
    assert.equal(classifyJointConnectionKind({type: 3}, {type: 4}), 'previous');
    assert.equal(
        classifyJointConnectionKind({type: 4}, {type: 3, isStatementInput: true}),
        'statement-input'
    );
    assert.equal(
        classifyJointConnectionKind({type: 2, outputShape_: 2}, {type: 1, outputShape_: 2}),
        'value-input'
    );
    assert.equal(
        classifyJointConnectionKind({type: 2, outputShape_: 1}, {type: 1, outputShape_: 1}),
        'boolean'
    );

    const prevPath = buildJointEdgePath('previous', 'target');
    const nextPath = buildJointEdgePath('next', 'target', {offsetY: 48});
    const roundHole = buildJointEdgePath('value-input', 'target');
    const hexHole = buildJointEdgePath('boolean', 'target');
    const roundCap = buildJointEdgePath('value-input', 'drag', {height: 40});
    const hexCap = buildJointEdgePath('boolean', 'drag', {height: 32});

    assert.ok(prevPath.startsWith('M 12,0 c 2,0'));
    assert.ok(nextPath.startsWith('M 12,48 c 2,0'));
    assert.equal(roundHole, 'M 16,0 h 16 a 16 16 0 0 1 0 32 h -16 a 16 16 0 0 1 0 -32 z');
    assert.equal(hexHole, 'M 16,0 h 16 l 16,16 l -16,16 h -16 l -16,-16 l 16,-16 z');
    assert.equal(roundCap, 'M 20,0 a 20 20 0 0 0 0 40');
    assert.equal(hexCap, 'M 16,0 l -16,16 l 16,16');
};

const testSnapRadiiAndHysteresis = () => {
    const defaultRadii = computeZoomSnapRadii(0.675);
    assert.equal(defaultRadii.snapRadius, 48);
    assert.equal(defaultRadii.connectingSnapRadius, 68);
    assert.equal(defaultRadii.currentConnectionPreference, 20);
    assert.equal(defaultRadii.approachStartRadius, 96);

    const scaledRadii = computeZoomSnapRadii(0.675, {scaleSnapWithZoom: true});
    assert.equal(scaledRadii.snapRadius, 71);
    assert.ok(Math.abs(scaledRadii.screenSnapPx - 48) <= 0.5);

    const connA = {id: 'a'};
    const connB = {id: 'b', targetConnection: connA};
    connA.targetConnection = connB;
    assert.equal(isSameStackInsertionJoint(connA, connB, null), true);

    const local = {id: 'local'};
    const other = {id: 'other'};
    const sticky = selectCandidateWithHysteresis(
        {closest: connA, local, curDistance: 35, markerBlock: null},
        {closest: other, local, radius: 22},
        {snapRadius: 48, connectingSnapRadius: 68, currentConnectionPreference: 20}
    );
    assert.equal(sticky.shouldUpdate, false);
    assert.equal(sticky.closest, connA);

    const switched = selectCandidateWithHysteresis(
        {closest: connA, local, curDistance: 42, markerBlock: null},
        {closest: other, local, radius: 18},
        {snapRadius: 48, connectingSnapRadius: 68, currentConnectionPreference: 20}
    );
    assert.equal(switched.shouldUpdate, true);
    assert.equal(switched.closest, other);
};

const testCustomBlockPureHelpers = () => {
    const firstNum = nextProcedureInputName('numberText', []);
    const secondNum = nextProcedureInputName('numberText', [firstNum]);
    assert.equal(firstNum, 'amount');
    assert.equal(secondNum, 'amount2');
    assert.notEqual(firstNum, secondNum);

    const firstBool = nextProcedureInputName('boolean', []);
    const secondBool = nextProcedureInputName('boolean', [firstBool]);
    assert.equal(firstBool, 'yes?');
    assert.equal(secondBool, 'yes?2');

    const firstLabel = nextProcedureInputName('label', []);
    assert.equal(firstLabel, 'then');

    assert.deepEqual(deduplicateDisplayNames(['score', 'score', 'score']), ['score', 'score2', 'score3']);

    const proc1 = nextProcedureDefaultName([]);
    const proc2 = nextProcedureDefaultName([proc1]);
    const proc3 = nextProcedureDefaultName([proc1, proc2]);
    assert.equal(proc1, 'my block');
    assert.equal(proc2, 'my block 2');
    assert.equal(proc3, 'my block 3');

    assert.equal(ensureUniqueProcCode('my block %s', ['my block %s']), 'my block 2 %s');

    const preview = describeProcedurePreview('jump %s then %b', ['height', 'double?'], {
        warp: true,
        returnsValue: true
    });
    assert.equal(preview.shape, 'reporter');
    assert.equal(preview.warp, true);
    assert.equal(preview.returnsValue, true);
    assert.equal(preview.tokens.length, 4);
    assert.deepEqual(preview.tokens[1], {type: 'numberText', text: 'height'});
    assert.deepEqual(preview.tokens[3], {type: 'boolean', text: 'double?'});
};

const testScalePerfPureHelpers = () => {
    const moved = computeZoomScrollTranslation(100, 200, 50, 60, 350, 460, 1.2);
    assert.ok(Math.abs(moved.scrollX - 60) < 1e-6);
    assert.ok(Math.abs(moved.scrollY - 160) < 1e-6);

    assert.equal(isToolboxXmlChanged('<xml>a</xml>', '<xml>a</xml>', '<xml>a</xml>'), false);
    assert.equal(isToolboxXmlChanged('<xml>b</xml>', '<xml>a</xml>', '<xml>a</xml>'), true);
    assert.equal(isToolboxXmlChanged('', '<xml>a</xml>', '<xml>a</xml>'), false);
};

testApproachStartRadiusAndStroke();
testJointGlowOpacity();
testJointConnectionClassificationAndPaths();
testSnapRadiiAndHysteresis();
testCustomBlockPureHelpers();
testScalePerfPureHelpers();

console.log('workspace.test.mjs: all assertions passed');

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STARTER_TEMPLATES,
    getStarterTemplate,
    applyStarterTemplate
} from './starter-templates.js';
import {readGameSettings} from './game-settings.js';

const createMockVm = () => {
    const stage = {
        isStage: true,
        comments: {},
        createComment (id, blockId, text) {
            this.comments[id] = {id, blockId, text};
        }
    };
    const events = [];
    const vm = {
        stageSize: {width: 480, height: 360},
        framerate: 30,
        interpolation: false,
        setStageSize (width, height) {
            this.stageSize = {width, height};
            this.runtime.stageWidth = width;
            this.runtime.stageHeight = height;
        },
        setFramerate (fps) {
            this.framerate = fps;
        },
        setInterpolation (val) {
            this.interpolation = val;
        },
        runtime: {
            stageWidth: 480,
            stageHeight: 360,
            targets: [stage],
            getTargetForStage () {
                return stage;
            },
            emit (event, payload) {
                events.push({event, payload});
            }
        },
        projectChanged () {
            events.push({event: 'PROJECT_CHANGED'});
        }
    };
    return {vm, stage, events};
};

test('STARTER_TEMPLATES includes 6 widescreen 16:9 templates', () => {
    assert.equal(STARTER_TEMPLATES.length, 6);
    for (const t of STARTER_TEMPLATES) {
        assert.equal(t.settings.width, 640);
        assert.equal(t.settings.height, 360);
        assert.equal(t.settings.framerate, 60);
        assert.equal(t.settings.touchMode, 'thumbstick');
    }
});

test('getStarterTemplate falls back to blank-16-9 when unknown', () => {
    assert.equal(getStarterTemplate('spark-tag').id, 'spark-tag');
    assert.equal(getStarterTemplate('nonexistent').id, 'blank-16-9');
});

test('applyStarterTemplate configures VM stage size, 60fps, and _twconfig_ settings', async () => {
    const {vm} = createMockVm();
    const res = await applyStarterTemplate(vm, 'laser-heist', async () => ({ok: false}));
    assert.equal(res.ok, true);
    assert.equal(vm.stageSize.width, 640);
    assert.equal(vm.stageSize.height, 360);
    assert.equal(vm.framerate, 60);
    assert.equal(vm.interpolation, true);
    const saved = readGameSettings(vm);
    assert.equal(saved.touchMode, 'thumbstick');
    assert.equal(saved.actionLabels.space, 'Fire');
    assert.equal(saved.actionLabels.e, 'Grab Core');
    assert.equal(saved.hud.teams, true);
});

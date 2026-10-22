jest.mock('scratch-render', () => jest.fn().mockImplementation(function (canvas, ...bounds) {
    this.canvas = canvas;
    this.bounds = bounds;
    this.draw = jest.fn();
    this.on = jest.fn();
}), {virtual: true});
jest.mock('../../../src/lib/video/video-provider', () => jest.fn());
jest.mock('../../../src/lib/world/seams.js', () => ({installWorldSeams: jest.fn()}));

import Renderer from 'scratch-render';
import {installWorldSeams} from '../../../src/lib/world/seams.js';
import {attachStageRenderer} from '../../../src/lib/stage-renderer.js';

const makeVm = () => {
    const vm = {
        renderer: null,
        setStageSize: jest.fn(),
        setVideoProvider: jest.fn()
    };
    vm.attachRenderer = jest.fn(renderer => {
        vm.renderer = renderer;
    });
    return vm;
};

describe('attachStageRenderer', () => {
    beforeEach(() => {
        global.document = {createElement: () => ({})};
        Renderer.mockClear();
    });

    afterEach(() => {
        delete global.document;
    });

    test('attaches a renderer sized to the stage before anything loads', () => {
        const vm = makeVm();
        const onHighQualityPenChanged = jest.fn();
        const renderer = attachStageRenderer({vm, stageSize: {width: 640, height: 360}, onHighQualityPenChanged});
        expect(vm.renderer).toBe(renderer);
        expect(renderer.bounds).toEqual([-320, 320, -180, 180]);
        expect(vm.setStageSize).toHaveBeenCalledWith(640, 360);
        expect(installWorldSeams).toHaveBeenCalledWith(vm);
        expect(vm.setVideoProvider).toHaveBeenCalledTimes(1);
        expect(renderer.on).toHaveBeenCalledWith('UseHighQualityRenderChanged', onHighQualityPenChanged);
    });

    test('a second caller reuses the renderer instead of building another', () => {
        const vm = makeVm();
        const first = attachStageRenderer({vm, stageSize: {width: 480, height: 360}, onHighQualityPenChanged: jest.fn()});
        const second = attachStageRenderer({vm, stageSize: {width: 480, height: 360}, onHighQualityPenChanged: jest.fn()});
        expect(second).toBe(first);
        expect(Renderer).toHaveBeenCalledTimes(1);
        expect(vm.attachRenderer).toHaveBeenCalledTimes(1);
        expect(first.on).toHaveBeenCalledTimes(1);
    });
});

import Renderer from 'scratch-render';
import VideoProvider from './video/video-provider';
import {installWorldSeams} from './world/seams.js';

const attachStageRenderer = ({vm, stageSize, onHighQualityPenChanged}) => {
    if (vm.renderer) return vm.renderer;
    const canvas = document.createElement('canvas');
    const renderer = new Renderer(
        canvas,
        -stageSize.width / 2,
        stageSize.width / 2,
        -stageSize.height / 2,
        stageSize.height / 2
    );
    vm.setStageSize(stageSize.width, stageSize.height);
    vm.attachRenderer(renderer);
    installWorldSeams(vm);
    vm.setVideoProvider(new VideoProvider());
    renderer.draw();
    if (onHighQualityPenChanged) {
        renderer.on('UseHighQualityRenderChanged', onHighQualityPenChanged);
    }
    return renderer;
};

export {
    attachStageRenderer
};

import {updateGameSettings} from './game-settings.js';

const STARTER_TEMPLATES = [
    {
        id: 'blank-16-9',
        title: 'Blank Widescreen',
        genre: '16:9 Canvas',
        badge: '60 FPS · 16:9',
        summary: 'Clean 640×360 widescreen stage with 60 FPS, smooth motion, and thumbstick controls ready.',
        sb3Url: null,
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Jump', e: 'Use', f: 'Action'},
            hud: {enabled: true, scores: true, teams: true, timer: true, health: true}
        }
    },
    {
        id: 'skyline-sprint',
        title: 'Skyline Obby',
        genre: 'Platformer',
        badge: 'Obby · Speedrun',
        summary: 'Side-scrolling rooftop parkour with spring pads, moving platforms, checkpoints, and lap timer.',
        sb3Url: '/examples/minigames/skyline-sprint/skyline-sprint.sb3',
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Jump', e: 'Dash', f: 'Checkpoint'},
            hud: {enabled: true, scores: true, teams: false, timer: true, health: true}
        }
    },
    {
        id: 'spark-tag',
        title: 'Spark Tag Arena',
        genre: 'Multiplayer Tag',
        badge: '2–8 Players',
        summary: 'Fast arena tag where whoever holds the spark runs faster and must pass it before time runs out.',
        sb3Url: '/examples/minigames/spark-tag/spark-tag.sb3',
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Tag', e: 'Boost', f: 'Pulse'},
            hud: {enabled: true, scores: true, teams: false, timer: true, health: true}
        }
    },
    {
        id: 'laser-heist',
        title: 'Laser Heist',
        genre: 'Team Capture',
        badge: 'Red vs. Blue',
        summary: 'Two-team arena with base zones, center battery core objective, laser blasters, and team score HUD.',
        sb3Url: '/examples/minigames/laser-heist/laser-heist.sb3',
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Fire', e: 'Grab Core', f: 'Shield'},
            hud: {enabled: true, scores: true, teams: true, timer: true, health: true}
        }
    },
    {
        id: 'catacomb-crawl-3d',
        title: 'Catacomb Crawl 3D',
        genre: '3D Dungeon',
        badge: 'First-Person 3D',
        summary: 'First-person 3D dungeon explorer with torch lighting, hidden relics, minimap, and portal escape.',
        sb3Url: '/examples/minigames/catacomb-crawl-3d/catacomb-crawl-3d.sb3',
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Torch', e: 'Collect', f: 'Map'},
            hud: {enabled: true, scores: true, teams: false, timer: true, health: true}
        }
    },
    {
        id: 'crumble-island',
        title: 'Crumble Island',
        genre: 'Survival',
        badge: 'Last Standing',
        summary: 'Round-based island survival where tiles crack and sink into magma while meteors rain from above.',
        sb3Url: '/examples/minigames/crumble-island/crumble-island.sb3',
        settings: {
            width: 640,
            height: 360,
            framerate: 60,
            interpolation: true,
            highQualityPen: true,
            touchMode: 'thumbstick',
            actionLabels: {space: 'Hop', e: 'Shove', f: 'Emote'},
            hud: {enabled: true, scores: true, teams: false, timer: true, health: true}
        }
    }
];

const getStarterTemplate = id => STARTER_TEMPLATES.find(t => t.id === id) || STARTER_TEMPLATES[0];

const applyTemplateSettings = (vm, template) => {
    if (!vm || !template || !template.settings) return null;
    const s = template.settings;
    if (typeof vm.setStageSize === 'function') {
        vm.setStageSize(s.width, s.height);
    }
    if (typeof vm.setFramerate === 'function') {
        vm.setFramerate(s.framerate);
    }
    if (typeof vm.setInterpolation === 'function') {
        vm.setInterpolation(s.interpolation);
    }
    return updateGameSettings(vm, s);
};

const applyStarterTemplate = async (vm, templateId, fetcher) => {
    const template = getStarterTemplate(templateId);
    if (!vm) return {ok: false, template};
    const runFetch = fetcher || (typeof fetch === 'function' ? fetch : null);
    if (template.sb3Url && runFetch && typeof vm.loadProject === 'function') {
        try {
            const resp = await runFetch(template.sb3Url);
            if (resp && resp.ok) {
                const buf = await resp.arrayBuffer();
                await vm.loadProject(buf);
                applyTemplateSettings(vm, template);
                return {ok: true, loadedProject: true, template};
            }
        } catch (_e) {
            return {ok: true, loadedProject: false, template, settings: applyTemplateSettings(vm, template)};
        }
    }
    applyTemplateSettings(vm, template);
    return {ok: true, loadedProject: false, template};
};

export {
    STARTER_TEMPLATES,
    getStarterTemplate,
    applyTemplateSettings,
    applyStarterTemplate
};

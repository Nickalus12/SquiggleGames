const DRIFT_REPAIR_MAX = 3;

const byName = (project, name) => ((project && project.targets) || []).find(t => t && t.name === name) || null;

const planDriftRepair = (off, localProject, remoteProject) => {
    if (!off.length) return [];
    if (off.length > DRIFT_REPAIR_MAX) return null;
    const steps = [];
    for (const name of off) {
        const local = byName(localProject, name);
        const remote = byName(remoteProject, name);
        if (!local || !remote || local.isStage === true || remote.isStage === true) return null;
        steps.push({name, remote});
    }
    return steps;
};

export {
    DRIFT_REPAIR_MAX,
    planDriftRepair
};

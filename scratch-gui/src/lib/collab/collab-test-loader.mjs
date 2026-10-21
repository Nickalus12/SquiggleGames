const STUBBED = new Set(['./client', './login', './overlay', './moderated', './paint-merge', '@turbowarp/paper']);

const stubSource = specifier => {
    const name = JSON.stringify(specifier);
    return `export default globalThis.__collabStubs[${name}];`;
};

export const resolve = (specifier, context, next) => {
    if (STUBBED.has(specifier) && context.parentURL && context.parentURL.endsWith('/collab/index.js')) {
        return {
            url: `data:text/javascript,${encodeURIComponent(stubSource(specifier))}`,
            shortCircuit: true
        };
    }
    return next(specifier, context);
};

const STUBBED = new Set(['./client', './login', './overlay', './moderated', './paint-merge', '@turbowarp/paper']);
const NAMED = new Map([['../../components/squiggle-only-notice', ['showPortabilityNote']]]);

const stubSource = specifier => {
    const name = JSON.stringify(specifier);
    if (NAMED.has(specifier)) {
        return NAMED.get(specifier)
            .map(key => `export const ${key} = (...args) => globalThis.__collabStubs[${name}].${key}(...args);`)
            .join('\n');
    }
    return `export default globalThis.__collabStubs[${name}];`;
};

export const resolve = (specifier, context, next) => {
    if ((STUBBED.has(specifier) || NAMED.has(specifier)) &&
        context.parentURL && context.parentURL.endsWith('/collab/index.js')) {
        return {
            url: `data:text/javascript,${encodeURIComponent(stubSource(specifier))}`,
            shortCircuit: true
        };
    }
    return next(specifier, context);
};

const STUBBED = new Set(['./client', './login', './overlay', './moderated', './paint-merge', '@turbowarp/paper', '../log']);
const NAMED = new Map([['../../components/squiggle-only-notice', ['showPortabilityNote']]]);

const INDEX = /\/collab\/index\.js(?:\?fixture=(\w+))?$/;

const stubSource = (specifier, fixture) => {
    const stubs = `globalThis.__collabStubs${fixture ? `[${JSON.stringify(fixture)}]` : ''}[${JSON.stringify(specifier)}]`;
    if (NAMED.has(specifier)) {
        return NAMED.get(specifier)
            .map(key => `export const ${key} = (...args) => ${stubs}.${key}(...args);`)
            .join('\n');
    }
    return `export default ${stubs};`;
};

export const resolve = (specifier, context, next) => {
    const parent = context.parentURL ? context.parentURL.match(INDEX) : null;
    if (parent && (STUBBED.has(specifier) || NAMED.has(specifier))) {
        return {
            url: `data:text/javascript,${encodeURIComponent(stubSource(specifier, parent[1]))}`,
            shortCircuit: true
        };
    }
    return next(specifier, context);
};

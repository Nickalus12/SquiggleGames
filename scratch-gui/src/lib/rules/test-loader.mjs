import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

const cssModule = 'export default new Proxy({}, {get: (target, key) => (typeof key === "string" ? key : undefined)});';

const jsx = async url => {
    const babel = require('@babel/core');
    const source = await readFile(new URL(url), 'utf8');
    const out = babel.transformSync(source, {
        babelrc: false,
        configFile: false,
        filename: new URL(url).pathname,
        presets: [require.resolve('@babel/preset-react')]
    });
    return out.code;
};

export const load = async (url, context, next) => {
    if (url.endsWith('.json')) return next(url, {...context, importAttributes: {type: 'json'}});
    if (url.endsWith('.css')) return {format: 'module', source: cssModule, shortCircuit: true};
    if (url.endsWith('.svg')) {
        const bytes = await readFile(new URL(url));
        const uri = `data:image/svg+xml;base64,${bytes.toString('base64')}`;
        return {format: 'module', source: `export default ${JSON.stringify(uri)};`, shortCircuit: true};
    }
    if (url.endsWith('.jsx')) return {format: 'module', source: await jsx(url), shortCircuit: true};
    return next(url, context);
};

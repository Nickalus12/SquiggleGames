import {register} from 'node:module';

register(`data:text/javascript,${encodeURIComponent(
    'import {readFile} from "node:fs/promises";' +
    'export async function load (url, context, next) {' +
    ' if (url.endsWith(".json")) return next(url, {...context, importAttributes: {type: "json"}});' +
    ' if (url.endsWith(".svg")) {' +
    '  const text = await readFile(new URL(url));' +
    '  const uri = `data:image/svg+xml;base64,${text.toString("base64")}`;' +
    '  return {format: "module", source: `export default ${JSON.stringify(uri)};`, shortCircuit: true};' +
    ' }' +
    ' return next(url, context); }'
)}`);

import {register} from 'node:module';

register(`data:text/javascript,${encodeURIComponent(
    'export async function load (url, context, next) {' +
    ' if (url.endsWith(".json")) return next(url, {...context, importAttributes: {type: "json"}});' +
    ' return next(url, context); }'
)}`);

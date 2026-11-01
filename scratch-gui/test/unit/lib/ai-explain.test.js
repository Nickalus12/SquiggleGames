import {explainSprite, isBusy} from '../../../src/lib/ai/explain.js';

const reply = (status, data) => Promise.resolve({status, ok: status === 200, json: () => Promise.resolve(data)});

describe('explainSprite', () => {
    test('posts the script and returns the three fields', async () => {
        const calls = [];
        const fetcher = (url, init) => {
            calls.push({url, init});
            return reply(200, {ok: true, summary: 'a', issue: 'b', suggestion: 'c'});
        };
        const out = await explainSprite({name: 'Cat', script: 'when green flag clicked'}, {fetcher});
        expect(out).toEqual({ok: true, summary: 'a', issue: 'b', suggestion: 'c', reason: ''});
        expect(calls[0].url).toBe('/api/ai/explain');
        expect(calls[0].init.headers['x-squiggle']).toBe('1');
        expect(calls[0].init.credentials).toBe('same-origin');
        expect(JSON.parse(calls[0].init.body)).toEqual({spriteName: 'Cat', kind: 'sprite', script: 'when green flag clicked'});
    });

    test('ignores a second call while one is pending', async () => {
        let release;
        const fetcher = () => new Promise(resolve => {
            release = () => resolve({status: 200, json: () => Promise.resolve({ok: false, reason: 'off'})});
        });
        const first = explainSprite({name: 'Cat', script: 'x'}, {fetcher});
        expect(isBusy()).toBe(true);
        expect((await explainSprite({name: 'Cat', script: 'x'}, {fetcher})).reason).toBe('pending');
        release();
        expect((await first).reason).toBe('off');
        expect(isBusy()).toBe(false);
    });

    test('maps rate limits, bad replies and timeouts to failures', async () => {
        expect((await explainSprite({name: 'Cat', script: 'x'}, {fetcher: () => reply(429, {})})).reason).toBe('busy');
        expect((await explainSprite({name: 'Cat', script: 'x'}, {fetcher: () => reply(200, {ok: true, summary: 'a'})})).ok).toBe(false);
        const hang = () => new Promise(() => {});
        expect((await explainSprite({name: 'Cat', script: 'x'}, {fetcher: hang, timeoutMs: 10})).reason).toBe('timeout');
        expect(isBusy()).toBe(false);
    });
});

const ORIGIN = 'http://squiggle.test';

const listeners = {};
const posted = [];
let socket = null;

class FakeSocket {
    constructor (url) {
        this.url = url;
        this.readyState = 1;
        this.sent = [];
        this.handlers = {};
        socket = this;
    }
    addEventListener (type, fn) {
        (this.handlers[type] = this.handlers[type] || []).push(fn);
    }
    send (data) {
        this.sent.push(JSON.parse(data));
    }
    fire (type, ev) {
        (this.handlers[type] || []).forEach(fn => fn(ev));
    }
    deliver (msg) {
        this.fire('message', {data: JSON.stringify(msg)});
    }
}

const fromHost = data => (listeners.message || []).forEach(fn => fn({origin: ORIGIN, data}));
const lastSent = () => socket.sent[socket.sent.length - 1];
const postedEvent = name => posted.filter(p => p.event === name).pop();

let coplay;

beforeAll(() => {
    global.location = {origin: ORIGIN, protocol: 'http:', host: 'squiggle.test'};
    global.document = {addEventListener: () => {}, querySelector: () => null};
    global.window = {
        parent: {postMessage: (msg, origin) => posted.push(Object.assign({origin}, msg))},
        addEventListener: (type, fn) => {
            (listeners[type] = listeners[type] || []).push(fn);
        }
    };
    global.WebSocket = FakeSocket;
    coplay = require('../../../src/lib/coplay/index.js').default;
    coplay.init({on: () => {}, runtime: {targets: []}}, {code: 'abc'});
    socket.fire('open');
});

afterAll(() => {
    delete global.location;
    delete global.document;
    delete global.window;
    delete global.WebSocket;
});

describe('coplay chat passthrough', () => {
    test('joins the session named in the link', () => {
        expect(socket.sent[0]).toEqual({type: 'play-join', code: 'ABC'});
    });

    test('chat config reaches the page as chat-config', () => {
        const seen = [];
        coplay.on('chat-config', d => seen.push(d));
        socket.deliver({type: 'play-chat-config', mode: 'quick', phrases: [{id: 'nice', text: 'Nice!'}]});
        const expected = {mode: 'quick', phrases: [{id: 'nice', text: 'Nice!'}]};
        expect(seen).toEqual([expected]);
        expect(postedEvent('chat-config')).toEqual({
            origin: ORIGIN, source: 'squiggle-coplay', event: 'chat-config', detail: expected
        });
    });

    test('a block carries its reason', () => {
        socket.deliver({type: 'play-blocked', reason: 'rate', message: 'Slow down a little.',
            category: null, warning: null});
        expect(postedEvent('blocked').detail).toEqual({
            reason: 'rate', message: 'Slow down a little.', category: null, warning: null
        });
        socket.deliver({type: 'play-blocked', reason: 'filter', message: 'Not here.',
            category: 'rude', warning: {level: 1}});
        expect(postedEvent('blocked').detail).toEqual({
            reason: 'filter', message: 'Not here.', category: 'rude', warning: {level: 1}
        });
    });

    test('withheld lines arrive whole', () => {
        const line = {type: 'play-chat', from: 2, name: 'Mo', color: '#f97316',
            text: 'Sign in to see what people type here.', id: 41, phrase: null, ts: 1700, withheld: true};
        socket.deliver(line);
        expect(postedEvent('chat').detail).toEqual(line);
    });

    test('a quick phrase goes out as its id', () => {
        fromHost({source: 'squiggle-coplay-host', action: 'chat', phrase: 'nice', text: 'Nice!'});
        expect(lastSent()).toEqual({type: 'play-chat', phrase: 'nice'});
    });

    test('typed text goes out as text', () => {
        fromHost({source: 'squiggle-coplay-host', action: 'chat', text: 'hello'});
        expect(lastSent()).toEqual({type: 'play-chat', text: 'hello'});
        fromHost({source: 'squiggle-coplay-host', action: 'chat', phrase: '', text: 'again'});
        expect(lastSent()).toEqual({type: 'play-chat', text: 'again'});
    });

    test('messages from another origin are ignored', () => {
        const before = socket.sent.length;
        (listeners.message || []).forEach(fn => fn({origin: 'http://elsewhere.test',
            data: {source: 'squiggle-coplay-host', action: 'chat', text: 'sneaky'}}));
        expect(socket.sent.length).toBe(before);
    });
});

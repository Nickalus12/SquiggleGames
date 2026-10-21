import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.removeAllListeners('warning');

const here = path.dirname(fileURLToPath(import.meta.url));
const {
    CHAT_IDS,
    PHRASES,
    PHRASE_MAX,
    bubbleFrame,
    chatPhrases,
    createPhraseLimiter,
    findPhrase,
    freeTextAllowed,
    phraseText
} = await import('./quick-phrases.js');

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    }
};

console.log('table');
ok('there are 32 phrases', PHRASES.length === 32, PHRASES.length);
ok('every phrase has text', PHRASES.every(p => typeof p.message.defaultMessage === 'string' && p.message.defaultMessage.trim()));
ok('every phrase has an sq.phrase i18n id', PHRASES.every(p => p.message.id === `sq.phrase.${p.id}`));
ok('ids are unique', new Set(PHRASES.map(p => p.id)).size === PHRASES.length);
ok('wire numbers are the table order', PHRASES.every((p, i) => p.n === i));
ok('every wire number fits PHRASE_MAX', PHRASES.every(p => p.n <= PHRASE_MAX));
ok('decision 4 order holds for 0 to 8',
    ['ping', 'look', 'nice', 'help', 'myturn', 'turn', 'wait', 'try', 'oops'].every((id, i) => PHRASES[i].id === id));
ok('the server chat ids all have text here', [...CHAT_IDS].every(id => findPhrase(id) && findPhrase(id).chat));
ok('there are 24 chat phrases', chatPhrases().length === 24);
ok('find by number', findPhrase(2).id === 'nice');
ok('find by id', findPhrase('heart').n === 26);
ok('unknown ids find nothing', findPhrase(99) === null && findPhrase('hello there') === null && findPhrase(1.5) === null);
ok('phrase text reads the default message', phraseText('nice') === 'Nice work!');
ok('phrase text goes through formatMessage', phraseText(0, m => `[${m.id}]`) === '[sq.phrase.ping]');

console.log('wire carries ids only');
{
    const frame = bubbleFrame('nice', {targetId: 'Cat', blockId: 'b1', x: 10.4, y: -3.6});
    ok('a bubble frame is type phrase with a number id', frame.type === 'phrase' && frame.id === 2, frame);
    ok('a bubble frame carries no text', !Object.values(frame).some(v => v === 'Nice work!'));
    ok('a bubble frame rounds its point', frame.x === 10 && frame.y === -4, frame);
    ok('an unknown phrase makes no frame', bubbleFrame('free text') === null);
    ok('a frame without a place is just the id', JSON.stringify(bubbleFrame(0)) === '{"type":"phrase","id":0}');
    const chatSrc = fs.readFileSync(path.join(here, 'chat.js'), 'utf8');
    ok('chat sends phrases by id', /type: 'room-chat', phrase: /.test(chatSrc));
}

console.log('rate limit');
{
    let t = 0;
    const limiter = createPhraseLimiter({now: () => t});
    ok('the first phrase passes', limiter.allow('self'));
    ok('a burst of two passes', limiter.allow('self'));
    ok('the third inside 2 s waits', !limiter.allow('self'));
    ok('wait time is reported', limiter.waitMs('self') === 2000, limiter.waitMs('self'));
    t += 1000;
    ok('half a token is not enough', !limiter.allow('self'));
    t += 1000;
    ok('one phrase per 2 s after the burst', limiter.allow('self'));
    ok('peers have their own buckets', limiter.allow('in:7') && limiter.allow('in:7') && !limiter.allow('in:7'));
    t += 60000;
    ok('the bucket refills to the burst only', limiter.allow('self') && limiter.allow('self') && !limiter.allow('self'));
}

console.log('free text');
ok('free mode for a teen or adult allows text', freeTextAllowed({mode: 'free'}));
ok('quick mode allows no text', !freeTextAllowed({mode: 'quick'}));
ok('a guest never sends text', !freeTextAllowed({mode: 'free', guest: true}));
ok('a childSafe account never sends text', !freeTextAllowed({mode: 'free', childSafe: true}));
ok('the vocabulary lock stops text for everyone', !freeTextAllowed({mode: 'free', locked: true}));
ok('no config allows no text', !freeTextAllowed());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

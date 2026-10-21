const RELOAD_TEXT = 'Squiggle has a new version. Reload the page to keep working together.';
const BAD_FRAME_TEXT = 'The room could not read something this editor sent. Reload the page to fix it.';

const PLAY_CLOSE_TEXTS = Object.freeze({
    1000: 'The game ended. Play again from the page.',
    1007: BAD_FRAME_TEXT,
    1013: 'This game is full right now.',
    4003: 'You cannot join this game.',
    4010: RELOAD_TEXT,
    4011: 'Reload the page to join.',
    4012: 'The game went quiet. Reload to play again.'
});

const PLAY_CLOSE_DEFAULT = 'The game stopped. Reload the page to play again.';

const playCloseText = code => (Object.prototype.hasOwnProperty.call(PLAY_CLOSE_TEXTS, code) ?
    PLAY_CLOSE_TEXTS[code] : PLAY_CLOSE_DEFAULT);

export {
    BAD_FRAME_TEXT,
    PLAY_CLOSE_DEFAULT,
    PLAY_CLOSE_TEXTS,
    RELOAD_TEXT,
    playCloseText
};

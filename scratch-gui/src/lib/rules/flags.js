const GAME_SERVER_READY = false;

const gameFlags = {serverReady: GAME_SERVER_READY};

const gameServerReady = () => gameFlags.serverReady === true;

export {
    GAME_SERVER_READY,
    gameFlags,
    gameServerReady
};

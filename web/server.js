const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const CONFIG = {
    ROUND_DURATION: 60000,
    FIELD_WIDTH: 800,
    FIELD_HEIGHT: 600,
    MAX_PLAYERS: 10,
    UPDATE_RATE: 30
};

const PHYSICS = {
    ACCELERATION: 0.7,
    MAX_SPEED: 8,
    FRICTION: 0.92,
    BOUNCE: 0.8,
    PLAYER_SIZE: 30,
    STAR_RADIUS: 15
};

const gameState = {
    players: {},
    star: { x: 0, y: 0 },
    round: {
        number: 1,
        startTime: Date.now(),
        scores: {},
        leaderboard: [],
        previousWinners: []
    }
};

function generateStar() {
    gameState.star = {
        x: Math.random() * (CONFIG.FIELD_WIDTH - 50) + 25,
        y: Math.random() * (CONFIG.FIELD_HEIGHT - 50) + 25
    };
}

function updateLeaderboard() {
    gameState.round.leaderboard = Object.entries(gameState.round.scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
}

function endRound() {
    updateLeaderboard();
    const winner = gameState.round.leaderboard[0];
    
    if (winner) {
        gameState.round.previousWinners.push({
            round: gameState.round.number,
            playerId: winner[0],
            score: winner[1],
            timestamp: Date.now()
        });
    }
    
    broadcast({
        type: 'round_end',
        round: gameState.round.number,
        winner: winner ? gameState.players[winner[0]]?.name : null
    });
    
    gameState.round.number++;
    gameState.round.startTime = Date.now();
    gameState.round.scores = {};
    generateStar();
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function checkPlayerCollisions(player) {
    Object.values(gameState.players).forEach(otherPlayer => {
        if (player === otherPlayer) return;
        
        const dx = (player.x + PHYSICS.PLAYER_SIZE/2) - (otherPlayer.x + PHYSICS.PLAYER_SIZE/2);
        const dy = (player.y + PHYSICS.PLAYER_SIZE/2) - (otherPlayer.y + PHYSICS.PLAYER_SIZE/2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < PHYSICS.PLAYER_SIZE) {
            const angle = Math.atan2(dy, dx);
            const force = PHYSICS.BOUNCE * 2;
            
            player.vx = Math.cos(angle) * force;
            player.vy = Math.sin(angle) * force;
            otherPlayer.vx = -Math.cos(angle) * force;
            otherPlayer.vy = -Math.sin(angle) * force;
        }
    });
}

function updatePlayerState(playerId, input) {
    const player = gameState.players[playerId];
    if (!player) return;
    player.input = input;
}

function updatePhysics() {
    Object.entries(gameState.players).forEach(([playerId, player]) => {
        const input = player.input || {};
        
        if (input.up) player.vy -= PHYSICS.ACCELERATION;
        if (input.down) player.vy += PHYSICS.ACCELERATION;
        if (input.left) player.vx -= PHYSICS.ACCELERATION;
        if (input.right) player.vx += PHYSICS.ACCELERATION;

        player.vx *= PHYSICS.FRICTION;
        player.vy *= PHYSICS.FRICTION;

        const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (speed > PHYSICS.MAX_SPEED) {
            player.vx = (player.vx / speed) * PHYSICS.MAX_SPEED;
            player.vy = (player.vy / speed) * PHYSICS.MAX_SPEED;
        }

        player.x += player.vx;
        player.y += player.vy;

        if (player.x < 0) {
            player.x = 0;
            player.vx *= -PHYSICS.BOUNCE;
        }
        if (player.x > CONFIG.FIELD_WIDTH - PHYSICS.PLAYER_SIZE) {
            player.x = CONFIG.FIELD_WIDTH - PHYSICS.PLAYER_SIZE;
            player.vx *= -PHYSICS.BOUNCE;
        }
        if (player.y < 0) {
            player.y = 0;
            player.vy *= -PHYSICS.BOUNCE;
        }
        if (player.y > CONFIG.FIELD_HEIGHT - PHYSICS.PLAYER_SIZE) {
            player.y = CONFIG.FIELD_HEIGHT - PHYSICS.PLAYER_SIZE;
            player.vy *= -PHYSICS.BOUNCE;
        }

        checkPlayerCollisions(player);

        const distanceToStar = Math.sqrt(
            Math.pow(player.x + PHYSICS.PLAYER_SIZE/2 - gameState.star.x, 2) + 
            Math.pow(player.y + PHYSICS.PLAYER_SIZE/2 - gameState.star.y, 2)
        );
        
        if (distanceToStar < PHYSICS.STAR_RADIUS + PHYSICS.PLAYER_SIZE/2) {
            gameState.round.scores[playerId] = (gameState.round.scores[playerId] || 0) + 1;
            generateStar();
            updateLeaderboard();
        }
    });
}

function updatePlayerCount() {
    const count = Object.keys(gameState.players).length;
    broadcast({
        type: 'player_count',
        count: count
    });
}

setInterval(() => {
    const elapsed = Date.now() - gameState.round.startTime;
    gameState.round.timeLeft = Math.max(0, CONFIG.ROUND_DURATION - elapsed);
    
    if (elapsed >= CONFIG.ROUND_DURATION) {
        endRound();
    }
}, 1000);

setInterval(() => {
    updatePhysics();
    broadcast({
        type: 'update',
        gameState: {
            ...gameState,
            round: {
                ...gameState.round,
                timeLeft: Math.max(0, CONFIG.ROUND_DURATION - (Date.now() - gameState.round.startTime))
            }
        }
    });
}, 1000 / CONFIG.UPDATE_RATE);

wss.on('connection', (ws) => {
    if (Object.keys(gameState.players).length >= CONFIG.MAX_PLAYERS) {
        ws.close(1000, 'Server is full (max players reached)');
        return;
    }

    const playerId = Math.random().toString(36).substr(2, 9);
    const colors = ['#FF5252', '#4CAF50', '#2196F3', '#FFC107', '#9C27B0'];
    const playerColor = colors[Math.floor(Math.random() * colors.length)];
    const playerNumber = Object.keys(gameState.players).length + 1;
    
    gameState.players[playerId] = {
        x: Math.random() * (CONFIG.FIELD_WIDTH - PHYSICS.PLAYER_SIZE),
        y: Math.random() * (CONFIG.FIELD_HEIGHT - PHYSICS.PLAYER_SIZE),
        vx: 0,
        vy: 0,
        color: playerColor,
        name: `Игрок${playerNumber}`,
        input: {}
    };
    
    gameState.round.scores[playerId] = 0;
    updatePlayerCount();
    
    ws.send(JSON.stringify({
        type: 'init',
        playerId,
        gameState: {
            ...gameState,
            round: {
                ...gameState.round,
                timeLeft: CONFIG.ROUND_DURATION - (Date.now() - gameState.round.startTime)
            }
        },
        playerColor: playerColor,
        playerName: `Игрок${playerNumber}`
    }));
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'input') {
            updatePlayerState(data.playerId, data.input);
        }
    });
    
    ws.on('close', () => {
        delete gameState.players[playerId];
        delete gameState.round.scores[playerId];
        updateLeaderboard();
        updatePlayerCount();
    });
});

generateStar();
console.log('Сервер запущен на ws://localhost:8080');
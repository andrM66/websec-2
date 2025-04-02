const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const leaderboardEl = document.getElementById('leaderboard');
const timerEl = document.getElementById('timer');
const winnersEl = document.getElementById('previous-winners');
const playersCountEl = document.getElementById('players-count');

let gameState = {
    players: {},
    star: { x: 0, y: 0 },
    round: {
        number: 1,
        timeLeft: 300000,
        scores: {},
        leaderboard: [],
        previousWinners: []
    }
};
let playerId = null;

const pressedKeys = {
    up: false,
    down: false,
    left: false,
    right: false
};


document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') pressedKeys.up = true;
    if (key === 's' || key === 'arrowdown') pressedKeys.down = true;
    if (key === 'a' || key === 'arrowleft') pressedKeys.left = true;
    if (key === 'd' || key === 'arrowright') pressedKeys.right = true;
    sendInput();
});
document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') pressedKeys.up = false;
    if (key === 's' || key === 'arrowdown') pressedKeys.down = false;
    if (key === 'a' || key === 'arrowleft') pressedKeys.left = false;
    if (key === 'd' || key === 'arrowright') pressedKeys.right = false;
    sendInput();
});

const ws = new WebSocket('ws://localhost:8080');

function sendInput() {
    if (playerId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'input',
            playerId,
            input: pressedKeys
        }));
    }
}

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        playerId = data.playerId;
        gameState = data.gameState;
        resizeCanvas();
        updateUI();
    } 
    else if (data.type === 'update') {
        gameState = data.gameState;
        updateUI();
    }
    else if (data.type === 'round_end') {
        showRoundEnd(data.winner);
    }
    else if (data.type === 'player_count') {
        playersCountEl.textContent = `Игроков: ${data.count}/10`;
    }
};

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fieldX = (canvas.width - 800) / 2;
    const fieldY = (canvas.height - 600) / 2;
    

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(fieldX, fieldY, 800, 600);
    
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 4;
    ctx.strokeRect(fieldX + 1, fieldY + 1, 800 - 2, 600 - 2);
    
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 2;
    ctx.strokeRect(fieldX + 3, fieldY + 3, 800 - 6, 600 - 6);

    const gradient = ctx.createRadialGradient(
        fieldX + gameState.star.x, fieldY + gameState.star.y, 0,
        fieldX + gameState.star.x, fieldY + gameState.star.y, 20
    );
    gradient.addColorStop(0, 'gold');
    gradient.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(fieldX + gameState.star.x, fieldY + gameState.star.y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'gold';
    ctx.beginPath();
    ctx.arc(fieldX + gameState.star.x, fieldY + gameState.star.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    Object.values(gameState.players).forEach(player => {
        const playerX = fieldX + player.x;
        const playerY = fieldY + player.y;
        
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(playerX - 14, playerY - 12, 30, 30);
        
        ctx.fillStyle = player.color;
        ctx.fillRect(playerX - 15, playerY - 15, 30, 30);
        
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(playerX - 10, playerY - 10, 20, 10);
        
        ctx.fillStyle = player.color;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, playerX, playerY - 20);
    });
    
    requestAnimationFrame(render);
}


function updateUI() {

    const timeLeft = gameState.round.timeLeft;
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    timerEl.textContent = `Раунд ${gameState.round.number} | ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    
    leaderboardEl.innerHTML = gameState.round.leaderboard.map(([id, score], i) => {
        const player = gameState.players[id];
        return `
            <div class="leader-entry ${playerId === id ? 'current-player' : ''}">
                <span style="color: ${player?.color || '#fff'}">${i + 1}. ${player?.name || 'Игрок'}</span>
                <span>${score}</span>
            </div>
        `;
    }).join('');
    
    winnersEl.innerHTML = gameState.round.previousWinners.slice(0, 5).map(winner => {
        const player = gameState.players[winner.playerId];
        return `
            <div class="leader-entry">
                <span>Раунд ${winner.round}: <span style="color: ${player?.color || '#fff'}">${player?.name || 'Игрок'}</span></span>
                <span>${winner.score}</span>
            </div>
        `;
    }).join('');
}

function showRoundEnd(winner) {
    const message = winner ? `Победитель раунда: ${winner}` : 'Раунд завершён!';
    const notification = document.createElement('div');
    notification.className = 'round-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function resizeCanvas() {
    const gameArea = document.getElementById('game-area');
    canvas.width = gameArea.clientWidth;
    canvas.height = gameArea.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
render();
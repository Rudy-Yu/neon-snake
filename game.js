/**
 * Neon Snake - Core Game Logic
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('current-score');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const menuOverlay = document.getElementById('menu-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const pauseBtn = document.getElementById('pause-btn');

// Constants
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 60;

// Audio System (Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, type, duration, volume = 0.1) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const sounds = {
    eat: () => { playTone(523.25, 'sine', 0.2); playTone(1046.50, 'sine', 0.1); }, // C5, C6
    powerup: () => { playTone(880, 'square', 0.4, 0.05); playTone(1320, 'square', 0.2, 0.05); },
    gameOver: () => { playTone(150, 'sawtooth', 0.5, 0.2); playTone(100, 'sawtooth', 1, 0.1); },
    move: () => playTone(200, 'sine', 0.05, 0.02)
};

// Game State
let snake = [];
let trail = []; // For ghost effect
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let food = { x: 0, y: 0 };
let powerUp = null; // {x, y, type: 'GOLD' | 'SLOW'}
let foodCount = 0;
let score = 0;
let highScore = localStorage.getItem('neonSnakeHighScore') || 0;
let gameSpeed = INITIAL_SPEED;
let gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER
let particles = [];
let lastTick = 0;

// Initialization
highScoreEl.textContent = highScore;
resizeCanvas();

function resizeCanvas() {
    const size = Math.min(window.innerWidth * 0.9, 400);
    canvas.width = Math.floor(size / GRID_SIZE) * GRID_SIZE;
    canvas.height = canvas.width;
}

// Particle System
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// Game Logic
function initGame() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const mid = Math.floor(canvas.width / GRID_SIZE / 2);
    snake = [
        { x: mid, y: mid },
        { x: mid, y: mid + 1 },
        { x: mid, y: mid + 2 }
    ];
    trail = [];
    direction = { x: 0, y: -1 };
    nextDirection = { x: 0, y: -1 };
    score = 0;
    foodCount = 0;
    gameSpeed = INITIAL_SPEED;
    scoreEl.textContent = score;
    spawnFood();
    powerUp = null;
    particles = [];
}

function spawnFood() {
    const cols = canvas.width / GRID_SIZE;
    const rows = canvas.height / GRID_SIZE;
    
    let valid = false;
    while (!valid) {
        food = {
            x: Math.floor(Math.random() * cols),
            y: Math.floor(Math.random() * rows)
        };
        valid = !snake.some(segment => segment.x === food.x && segment.y === food.y);
    }
}

function spawnPowerUp() {
    const cols = canvas.width / GRID_SIZE;
    const rows = canvas.height / GRID_SIZE;
    const type = Math.random() > 0.5 ? 'GOLD' : 'SLOW';
    
    let valid = false;
    let pos;
    while (!valid) {
        pos = {
            x: Math.floor(Math.random() * cols),
            y: Math.floor(Math.random() * rows)
        };
        valid = !snake.some(s => s.x === pos.x && s.y === pos.y) && (pos.x !== food.x || pos.y !== food.y);
    }
    powerUp = { ...pos, type };
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (gameState === 'PLAYING') powerUp = null;
    }, 10000);
}

function update() {
    if (gameState !== 'PLAYING') return;

    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    // Wall collision
    if (head.x < 0 || head.x >= canvas.width / GRID_SIZE || 
        head.y < 0 || head.y >= canvas.height / GRID_SIZE) {
        gameOver();
        return;
    }

    // Self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        gameOver();
        return;
    }

    // Save for trail
    trail.push([...snake.map(s => ({...s}))]);
    if (trail.length > 5) trail.shift();

    snake.unshift(head);

    // Food collision
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        foodCount++;
        scoreEl.textContent = score;
        sounds.eat();
        createExplosion(food.x * GRID_SIZE + GRID_SIZE/2, food.y * GRID_SIZE + GRID_SIZE/2, '#0f0');
        spawnFood();
        
        if (foodCount % 5 === 0) spawnPowerUp();
        if (gameSpeed > MIN_SPEED) gameSpeed -= SPEED_INCREMENT;
    } 
    // PowerUp collision
    else if (powerUp && head.x === powerUp.x && head.y === powerUp.y) {
        sounds.powerup();
        createExplosion(powerUp.x * GRID_SIZE + GRID_SIZE/2, powerUp.y * GRID_SIZE + GRID_SIZE/2, powerUp.type === 'GOLD' ? '#ff0' : '#0af');
        
        if (powerUp.type === 'GOLD') {
            score += 50;
        } else {
            gameSpeed = Math.min(INITIAL_SPEED, gameSpeed + 30);
        }
        scoreEl.textContent = score;
        powerUp = null;
    }
    else {
        snake.pop();
    }
}

function draw() {
    ctx.fillStyle = 'rgba(5, 5, 5, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Grid
    ctx.strokeStyle = '#111';
    for (let i = 0; i <= canvas.width; i += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw Trail (Ghost Effect)
    trail.forEach((prevSnake, tIdx) => {
        const alpha = (tIdx + 1) / (trail.length * 5);
        ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
        prevSnake.forEach(seg => {
            ctx.fillRect(seg.x * GRID_SIZE + 4, seg.y * GRID_SIZE + 4, GRID_SIZE - 8, GRID_SIZE - 8);
        });
    });

    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => { p.update(); p.draw(); });

    // Draw Food
    drawGlowCircle(food.x, food.y, '#0f0', 15);

    // Draw PowerUp
    if (powerUp) {
        const color = powerUp.type === 'GOLD' ? '#ff0' : '#0af';
        drawGlowCircle(powerUp.x, powerUp.y, color, 20, true);
    }

    // Draw Snake
    snake.forEach((segment, index) => {
        const isHead = index === 0;
        ctx.save();
        ctx.fillStyle = isHead ? '#0ff' : '#0aa';
        ctx.shadowBlur = isHead ? 20 : 5;
        ctx.shadowColor = '#0ff';
        const p = isHead ? 2 : 4;
        ctx.fillRect(segment.x * GRID_SIZE + p, segment.y * GRID_SIZE + p, GRID_SIZE - p*2, GRID_SIZE - p*2);
        ctx.restore();
    });
}

function drawGlowCircle(x, y, color, blur, animate = false) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowBlur = blur + (animate ? Math.sin(Date.now() / 100) * 5 : 0);
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x * GRID_SIZE + GRID_SIZE/2, y * GRID_SIZE + GRID_SIZE/2, GRID_SIZE/2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTick;

    if (deltaTime > gameSpeed) {
        update();
        lastTick = timestamp;
    }
    
    draw();
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'GAMEOVER';
    finalScoreEl.textContent = score;
    gameOverOverlay.classList.remove('hidden');
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonSnakeHighScore', highScore);
        highScoreEl.textContent = highScore;
    }
}

// Input Handling
function handleInput(dir) {
    if (gameState !== 'PLAYING') return;
    
    // Prevent 180 degree turns
    if (dir === 'UP' && direction.y !== 1) nextDirection = { x: 0, y: -1 };
    if (dir === 'DOWN' && direction.y !== -1) nextDirection = { x: 0, y: 1 };
    if (dir === 'LEFT' && direction.x !== 1) nextDirection = { x: -1, y: 0 };
    if (dir === 'RIGHT' && direction.x !== -1) nextDirection = { x: 1, y: 0 };
}

window.addEventListener('keydown', (e) => {
    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': handleInput('UP'); break;
        case 'ArrowDown': case 's': case 'S': handleInput('DOWN'); break;
        case 'ArrowLeft': case 'a': case 'A': handleInput('LEFT'); break;
        case 'ArrowRight': case 'd': case 'D': handleInput('RIGHT'); break;
        case 'p': case 'P': togglePause(); break;
    }
});

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        pauseBtn.textContent = '▶';
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        pauseBtn.textContent = 'II';
    }
}

// Button Events
startBtn.addEventListener('click', () => {
    initGame();
    gameState = 'PLAYING';
    menuOverlay.classList.add('hidden');
});

restartBtn.addEventListener('click', () => {
    initGame();
    gameState = 'PLAYING';
    gameOverOverlay.classList.add('hidden');
});

pauseBtn.addEventListener('click', togglePause);

// Touch Buttons
document.getElementById('up-btn').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('UP'); });
document.getElementById('down-btn').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('DOWN'); });
document.getElementById('left-btn').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('LEFT'); });
document.getElementById('right-btn').addEventListener('touchstart', (e) => { e.preventDefault(); handleInput('RIGHT'); });

// Mouse support for touch buttons (fallback)
document.getElementById('up-btn').addEventListener('mousedown', () => handleInput('UP'));
document.getElementById('down-btn').addEventListener('mousedown', () => handleInput('DOWN'));
document.getElementById('left-btn').addEventListener('mousedown', () => handleInput('LEFT'));
document.getElementById('right-btn').addEventListener('mousedown', () => handleInput('RIGHT'));

// Start Loop
requestAnimationFrame(gameLoop);

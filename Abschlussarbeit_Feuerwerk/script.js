/*************************************************************
 * CANVAS & DOM
 *************************************************************/
const canvas = document.getElementById('canvas');
if (!canvas) throw new Error('Canvas nicht gefunden');

const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');
const colorPicker = document.getElementById('color');
const sizeSlider = document.getElementById('size');
const indexElem = document.getElementById('client-index');
const messageElem = document.getElementById('message-display');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

/*************************************************************
 * WEBSOCKET / WEBROOM
 *************************************************************/
const ROOM_NAME = 'lumina';
const WS_URL = 'wss://nosch.uber.space/web-rooms/';

let socket;
let clientId = null;
let clientCount = 0;

/*************************************************************
 * SOUND (optional – funktioniert nur nach User-Klick)
 *************************************************************/
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let explosionBuffer = null;

async function loadSound() {
  try {
    const res = await fetch('sounds/explosion.wav');
    const buf = await res.arrayBuffer();
    explosionBuffer = await audioCtx.decodeAudioData(buf);
  } catch {
    console.warn('Kein Sound geladen');
  }
}
loadSound();

function playSound(size) {
  if (!explosionBuffer) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();

  src.buffer = explosionBuffer;
  gain.gain.value = Math.min(size / 60, 1);

  src.connect(gain);
  gain.connect(audioCtx.destination);

  src.start();
  src.stop(audioCtx.currentTime + 2);
}

/*************************************************************
 * PARTIKEL
 *************************************************************/
const explosions = [];

class Particle {
  constructor(x, y, color, size, angle) {
    const speed = Math.random() * 4 + 2;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.size = size;
    this.color = color;
    this.life = 60;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.size *= 0.96;
    this.life--;
  }

  draw() {
    ctx.globalAlpha = this.life / 60;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function explode(x, y, color, size) {
  const parts = [];
  const count = 80;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i;
    parts.push(new Particle(x, y, color, size / 4, angle));
  }
  explosions.push(parts);
}

/*************************************************************
 * INTERAKTION (UI-sicher)
 *************************************************************/
document.body.addEventListener('pointerdown', (e) => {
  if (ui.contains(e.target)) return;

  const x = e.clientX;
  const y = e.clientY;
  const color = colorPicker.value;
  const size = Number(sizeSlider.value);

  explode(x, y, color, size);
  playSound(size);

  send(['boom', x / canvas.width, y / canvas.height, color, size]);
});

/*************************************************************
 * ANIMATION LOOP
 *************************************************************/
function animate() {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = explosions.length - 1; i >= 0; i--) {
    const parts = explosions[i];
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      p.update();
      p.draw();
      if (p.life <= 0) parts.splice(j, 1);
    }
    if (parts.length === 0) explosions.splice(i, 1);
  }

  requestAnimationFrame(animate);
}
animate();

/*************************************************************
 * WEBSOCKET LOGIK
 *************************************************************/
try {
  socket = new WebSocket(WS_URL);
} catch {
  messageElem.innerText = 'WebSocket Fehler';
}

if (socket) {
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify(['*enter-room*', ROOM_NAME]));
    socket.send(JSON.stringify(['*subscribe-client-count*']));
  });

  socket.addEventListener('message', (e) => {
    if (!e.data) return;
    const msg = JSON.parse(e.data);

    switch (msg[0]) {
      case '*client-id*':
        clientId = msg[1] + 1;
        break;

      case '*client-count*':
        clientCount = msg[1];
        break;

      case 'boom': {
        const [_, nx, ny, color, size] = msg;
        explode(nx * canvas.width, ny * canvas.height, color, size);
        playSound(size);
        break;
      }
    }

    indexElem.innerText = `#${clientId}/${clientCount}`;
  });
}

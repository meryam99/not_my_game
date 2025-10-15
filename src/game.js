const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.addEventListener('click', (e) => {
  if (!won || !lastResetBtn) return;
  const { bx, by, bw, bh } = lastResetBtn;
  const x = e.offsetX,
    y = e.offsetY;
  if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
    init();
  }
});

let startSec = null;
let won = false;
let winTime = 0;
let lastResetBtn = null;
let loopStarted = false;

const CLUSTER_AVG_DIST_MAX = 28;
const CLUSTER_MAX_DIST_MAX = 52;
const BALL_RADIUS = 8;
const FRICTION = 0.98;
const BOUNCE = 0.9;
const MAX_SPEED = 2.5;

const CURSOR_REPEL_RADIUS = 110;
const REPEL_STRENGTH = 220;

const SEPARATION_PAD = 6;
const RESTITUTION = 0.85;

const COHESION_RADIUS = 120;
const COHESION_STRENGTH = 45;
const COHESION_MIN_NEIGHBORS = 2;
const COHESION_SATURATE_AT = 60;
const COHESION_IMPULSE_CAP = 0.06;

const BROWNIAN = 0.4;

const DRIFT_ACCEL = 0.35;
const DRIFT_TURN = 0.6;
const MIN_SPEED = 0.08;

const START_CLUSTER_RADIUS = 130;
const CLUSTER_NEIGHBOR_RADIUS = CLUSTER_MAX_DIST_MAX;
const CLUSTER_NEIGHBOR_MIN = 2;

const mouse = { x: null, y: null, inside: false, radius: 22 };
canvas.addEventListener('mouseenter', () => (mouse.inside = true));
canvas.addEventListener('mouseleave', () => {
  mouse.inside = false;
  mouse.x = mouse.y = null;
});
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});

let particles = [];
let colors = [];
const colorCountInput = document.getElementById('colorCountInput');
const ballsPerColorInput = document.getElementById('ballsPerColorInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

startBtn.addEventListener('click', () => {
  init();
});
resetBtn.addEventListener('click', () => {
  init();
});

function getSettings() {
  const cc = Math.max(1, Math.min(12, parseInt(colorCountInput.value || '3', 10)));
  const bpc = Math.max(1, Math.min(60, parseInt(ballsPerColorInput.value || '12', 10)));
  return { colorCount: cc, ballsPerColor: bpc };
}

//function rand(a, b) {
  //return a + Math.random() * (b - a);
//}

function generateColors(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const h = Math.round((360 * i) / n);
    arr.push(`hsl(${h} 100% 60%)`);
  }
  return arr;
}

function init() {
  won = false;
  startSec = performance.now();
  lastResetBtn = null;

  particles = [];
  const { colorCount, ballsPerColor } = getSettings();
  colors = generateColors(colorCount);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (let c = 0; c < colorCount; c++) {
    for (let i = 0; i < ballsPerColor; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * START_CLUSTER_RADIUS;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;

      particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        theta: Math.random() * Math.PI * 2,
        colorIndex: c,
      });
    }
  }
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(loop);
  }
}

function loop() {
  if (!won) {
    stepPhysics();
    won = checkWin();
  }
  draw();
  requestAnimationFrame(loop);
}

function stepPhysics() {
  if (mouse.inside && mouse.x != null) {
    for (const p of particles) {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      const r = CURSOR_REPEL_RADIUS;
      const r2 = r * r;
      if (d2 > 0.0001 && d2 < r2) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const falloff = 1 - d / r;
        const f = REPEL_STRENGTH * falloff;
        p.vx += nx * f * 0.016;
        p.vy += ny * f * 0.016;
      }
    }
  }

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const minDist = BALL_RADIUS * 2 + SEPARATION_PAD;
      if (d < minDist) {
        const overlap = minDist - d;
        const corr = overlap * 0.5;
        a.x -= nx * corr;
        a.y -= ny * corr;
        b.x += nx * corr;
        b.y += ny * corr;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const j = (-(1 + RESTITUTION) * vn) / 2;
          a.vx -= nx * j;
          a.vy -= ny * j;
          b.vx += nx * j;
          b.vy += ny * j;
        }
      }
    }
  }

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    let sx = 0,
      sy = 0,
      count = 0;

    for (let j = 0; j < particles.length; j++) {
      if (j === i) continue;
      const b = particles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.0001 && d2 < COHESION_RADIUS * COHESION_RADIUS) {
        sx += b.x;
        sy += b.y;
        count++;
      }
    }

    if (count >= COHESION_MIN_NEIGHBORS) {
      const cx = sx / count;
      const cy = sy / count;
      const dx = cx - a.x;
      const dy = cy - a.y;
      const d = Math.hypot(dx, dy);

      const MIN_PULL_DIST = BALL_RADIUS * 2 + SEPARATION_PAD + 4;
      if (d > MIN_PULL_DIST && d > 0.0001) {
        const nx = dx / d;
        const ny = dy / d;

        const sat = Math.min(d, COHESION_SATURATE_AT) / COHESION_SATURATE_AT;
        const falloff = d / COHESION_RADIUS;
        const scaled = COHESION_STRENGTH * sat * falloff;

        let imp = (scaled / Math.max(count, 1)) * 0.016;
        if (imp > COHESION_IMPULSE_CAP) imp = COHESION_IMPULSE_CAP;

        a.vx += nx * imp;
        a.vy += ny * imp;
      }
    }
  }

  for (const p of particles) {
    p.vx *= FRICTION;
    p.vy *= FRICTION;

    p.vx += Math.cos(p.theta) * DRIFT_ACCEL * 0.016;
    p.vy += Math.sin(p.theta) * DRIFT_ACCEL * 0.016;
    p.theta += (Math.random() - 0.5) * DRIFT_TURN * 0.016;

    p.vx += (Math.random() - 0.5) * BROWNIAN * 0.016;
    p.vy += (Math.random() - 0.5) * BROWNIAN * 0.016;

    const spNow = Math.hypot(p.vx, p.vy);
    if (spNow < MIN_SPEED) {
      const angle = p.theta;
      p.vx = Math.cos(angle) * MIN_SPEED;
      p.vy = Math.sin(angle) * MIN_SPEED;
    }

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > MAX_SPEED) {
      p.vx = (p.vx / sp) * MAX_SPEED;
      p.vy = (p.vy / sp) * MAX_SPEED;
    }

    p.x += p.vx;
    p.y += p.vy;

    if (p.x < BALL_RADIUS) {
      p.x = BALL_RADIUS;
      p.vx *= -BOUNCE;
    }
    if (p.x > canvas.width - BALL_RADIUS) {
      p.x = canvas.width - BALL_RADIUS;
      p.vx *= -BOUNCE;
    }
    if (p.y < BALL_RADIUS) {
      p.y = BALL_RADIUS;
      p.vy *= -BOUNCE;
    }
    if (p.y > canvas.height - BALL_RADIUS) {
      p.y = canvas.height - BALL_RADIUS;
      p.vy *= -BOUNCE;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let x = 60; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.strokeStyle = '#101621';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let y = 60; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.strokeStyle = '#101621';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const groups = [];
  for (const p of particles) {
    (groups[p.colorIndex] || (groups[p.colorIndex] = [])).push(p);
  }
  const r2 = CLUSTER_NEIGHBOR_RADIUS * CLUSTER_NEIGHBOR_RADIUS;

  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = colors[p.colorIndex];
    ctx.fill();
    let neighbors = 0;
    const same = groups[p.colorIndex] || [];
    for (const q of same) {
      if (q === p) continue;
      const dx = q.x - p.x,
        dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) neighbors++;
    }
    if (neighbors >= CLUSTER_NEIGHBOR_MIN) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_RADIUS * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  if (mouse.inside && mouse.x != null) {
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, mouse.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // === ТАЙМЕР ===
  if (startSec != null) {
    const sec = won ? winTime : Math.floor((performance.now() - startSec) / 1000);

    ctx.save();
    ctx.font = '900 160px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillText(String(sec), canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
  // === ПЕРЕМОГА ===
  if (won) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const title = 'Овва! Ти впорався!';
    const msg = `Хороший песик, качки відсортовані за ${winTime} секунд!`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '800 44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#dfffe0';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 60);

    ctx.font = '500 20px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#c5d0dd';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2 - 20);
    const btnText = 'RESET';
    const bw = 180,
      bh = 50;
    const bx = canvas.width / 2 - bw / 2;
    const by = canvas.height / 2 + 30;
    ctx.fillStyle = '#1b2b1b';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#6aff6a';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#ccffcc';
    ctx.fillText(btnText, canvas.width / 2, by + bh / 2);

    ctx.restore();
    lastResetBtn = { bx, by, bw, bh };
  }
}

// === Перевірка перемоги ===
function checkWin() {
  if (particles.length === 0) return false;
  const groups = new Map();
  for (const p of particles) {
    const k = p.colorIndex;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  for (const arr of groups.values()) {
  if (arr.length === 0) return false;

  let sx = 0, sy = 0;
  for (const p of arr) {
    sx += p.x;
    sy += p.y;
  }

  const cx = sx / arr.length;
  const cy = sy / arr.length;

  let sum = 0, maxd = 0;
  for (const p of arr) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    sum += d;
    if (d > maxd) maxd = d;
  }

  const avg = sum / arr.length;
  if (avg > CLUSTER_AVG_DIST_MAX) return false;
  if (maxd > CLUSTER_MAX_DIST_MAX) return false;
}
  winTime = Math.floor((performance.now() - startSec) / 1000);
  return true;
}
init();

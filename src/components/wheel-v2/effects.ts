let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playTickSound() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch {}
}

export function playWinSound() {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.4);
    });
  } catch {}
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

const MAX_PARTICLES = 300;

let particles: ConfettiParticle[] = [];
let canvas: HTMLCanvasElement | null = null;
let ctx2d: CanvasRenderingContext2D | null = null;
let rafId: number | null = null;
let running = false;
let resizeListener: (() => void) | null = null;

function clearCanvas() {
  if (ctx2d && canvas) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  running = false;
}

function loop() {
  if (!ctx2d || !canvas) {
    stopLoop();
    return;
  }
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.g;
    p.rot += p.vr;
    p.life -= 0.008;
  }
  particles = particles.filter((p) => p.life > 0 && p.y < (canvas?.height ?? 0) + 30);
  for (const p of particles) {
    if (!ctx2d) break;
    ctx2d.save();
    ctx2d.translate(p.x, p.y);
    ctx2d.rotate((p.rot * Math.PI) / 180);
    ctx2d.globalAlpha = Math.max(p.life, 0);
    ctx2d.fillStyle = p.color;
    ctx2d.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
    ctx2d.restore();
  }
  if (particles.length > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    clearCanvas();
    particles = [];
    stopLoop();
  }
}

export function confettiBurst() {
  if (typeof window === 'undefined') return;

  // Cancel any existing loop and clear particles before starting a new burst
  stopLoop();
  particles = [];

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'wheel-v2-confetti';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
    document.body.appendChild(canvas);

    resizeListener = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      if (ctx2d) ctx2d.scale(dpr, dpr);
    };
    window.addEventListener('resize', resizeListener);
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx2d = canvas.getContext('2d');
  if (ctx2d) ctx2d.scale(dpr, dpr);

  const colors = ['#d9ab4e', '#f8e7b4', '#31d8c5', '#e6455c', '#fff6dd'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2.4;

  const burstCount = Math.min(150, MAX_PARTICLES);
  for (let i = 0; i < burstCount; i++) {
    particles.push({
      x: cx,
      y: cy,
      vx: (Math.random() - 0.5) * 15,
      vy: -Math.random() * 13 - 4,
      g: 0.35,
      size: 4 + Math.random() * 6,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 18,
      color: colors[i % colors.length],
      life: 1,
    });
  }

  running = true;
  rafId = requestAnimationFrame(loop);
}

export function cleanupConfetti() {
  stopLoop();
  particles = [];
  clearCanvas();
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }
  if (canvas) {
    canvas.remove();
    canvas = null;
    ctx2d = null;
  }
}

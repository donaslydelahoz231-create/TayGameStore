// Sonido de la bienvenida (2026-10-27). Se sintetiza en el navegador con Web Audio: sin archivos,
// sin terceros y sin licencias. Los navegadores no dejan sonar una página hasta que el visitante
// la toca (clic, toque o tecla): por eso suena con ese primer toque —una vez por sesión—, y
// durante la presentación espera a que se abra el diamante para sonar con él. Se puede silenciar;
// la elección se recuerda en este navegador.

const PREF_KEY = 'tgs_sonido';
const PLAYED_KEY = 'tgs:bienvenida-sono';
// Eventos que los navegadores aceptan como «el visitante tocó la página».
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
// Dos sonidos nunca se pisan: el de «Entrar» espera a que termine el de bienvenida.
const WELCOME_MS = 1500;

let ctx = null;
let out = null;
let noiseBuffer = null;
let unlocked = false;
let deferred = false;
let pending = false;
let welcomeAt = -Infinity;
let idleTimer = 0;

function read(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store, key, value) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado estricto): la elección dura lo que dure la página.
  }
}

/** El visitante quiere sonido (sí, salvo que lo haya silenciado). */
export const soundWanted = () => read(localStorage, PREF_KEY) !== 'off';
const welcomeDone = () => read(sessionStorage, PLAYED_KEY) === '1';
const onEntry = () => document.body.classList.contains('entry-locked');

/** Ruido blanco (1 s) para el soplo de los destellos. */
function noise(ac) {
  if (noiseBuffer) return noiseBuffer;
  noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Eco de sala corto (ruido que se apaga) para que el cristal suene con aire. */
function room(ac, seconds) {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

/** Crea el audio. Solo se llama dentro de un toque del visitante (si no, el navegador avisa). */
function setup() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
  } catch {
    return null;
  }
  out = ctx.createGain();
  out.gain.value = 1.1;
  // Limitador (no compresor): deja el sonido tal cual y solo evita picos por encima de -3 dB.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const verb = ctx.createConvolver();
  verb.buffer = room(ctx, 1.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  out.connect(limiter);
  out.connect(verb).connect(wet).connect(limiter);
  limiter.connect(ctx.destination);
  return ctx;
}

function tone(t, freq, { dur = 1.1, gain = 0.12, type = 'sine', attack = 0.006, detune = 0 }) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hiss(t, { dur, from, to, gain, q = 0.9 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = q;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(env).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/**
 * «Destello de Tay» (~1,5 s): un soplo que sube, una quinta grave que florece y un arpegio de
 * cristal en mi mayor, como un diamante que se enciende.
 */
function chimeWelcome() {
  const t = ctx.currentTime + 0.03;
  hiss(t, { dur: 0.45, from: 2500, to: 9000, gain: 0.05 });
  tone(t + 0.05, 164.81, { dur: 1.6, gain: 0.07, type: 'triangle', attack: 0.12 });
  tone(t + 0.05, 246.94, { dur: 1.5, gain: 0.05, type: 'triangle', attack: 0.14 });
  [659.25, 987.77, 1318.51, 1661.22, 1975.53].forEach((freq, i) => {
    const at = t + 0.12 + i * 0.075;
    tone(at, freq, { dur: 1.2 - i * 0.08, gain: 0.12 - i * 0.012 });
    tone(at, freq * 2, { dur: 0.6, gain: 0.025, detune: 4 });
  });
  tone(t + 0.62, 2637.02, { dur: 0.9, gain: 0.035 });
}

/** «Abriendo» (~0,9 s): el soplo del diamante que cubre la pantalla y dos notas de llegada. */
function chimeEnter() {
  const t = ctx.currentTime + 0.02;
  hiss(t, { dur: 0.42, from: 380, to: 3600, gain: 0.1, q: 0.7 });
  tone(t + 0.3, 987.77, { dur: 0.7, gain: 0.12 });
  tone(t + 0.38, 1318.51, { dur: 0.9, gain: 0.13 });
}

/** Activa el audio (dentro de un toque) y luego `play`, solo si el navegador lo dejó sonar. */
function unlockThen(play) {
  const ac = setup();
  if (!ac) return;
  clearTimeout(idleTimer);
  const go = () => {
    if (ac.state !== 'running') return;
    unlocked = true;
    play();
    renderToggles();
  };
  if (ac.state === 'running') go();
  else ac.resume().then(go, () => {});
}

function playWelcome(force = false) {
  if (!soundWanted() || document.hidden || (!force && welcomeDone())) return;
  write(sessionStorage, PLAYED_KEY, '1');
  welcomeAt = performance.now();
  chimeWelcome();
}

/** Sin sonidos por delante, el audio se suspende (no deja el dispositivo de sonido ocupado). */
function sleepSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => ctx?.suspend().catch(() => {}), 4000);
}

function onGesture(event) {
  if (!soundWanted() || !onEntry() || event.target.closest?.('[data-sound-toggle]')) return;
  unlockThen(() => {
    if (deferred) pending = true;
    else playWelcome();
  });
}

function onToggle() {
  if (soundWanted() && unlocked) {
    write(localStorage, PREF_KEY, 'off');
    ctx?.suspend().catch(() => {});
    renderToggles();
    return;
  }
  write(localStorage, PREF_KEY, null);
  unlockThen(() => playWelcome(true));
  renderToggles();
}

function renderToggles() {
  const on = soundWanted() && unlocked;
  document.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    button.classList.toggle('is-on', on);
    button.querySelector('use')?.setAttribute('href', on ? '#icon-sound' : '#icon-sound-off');
    const label = button.querySelector('span');
    if (label) label.textContent = on ? 'Silenciar' : 'Activar sonido';
  });
}

/** Botones de sonido y escucha del primer toque. */
export function initSound() {
  document.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    button.addEventListener('click', onToggle);
  });
  GESTURES.forEach((type) =>
    document.addEventListener(type, onGesture, { capture: true, passive: true }),
  );
  renderToggles();
}

/** Durante la presentación, el sonido espera a que se abra el diamante. */
export function deferWelcome() {
  deferred = true;
}

/** El diamante de la presentación se abre: suena la bienvenida si el visitante ya tocó. */
export function welcomeCue() {
  deferred = false;
  if (pending && soundWanted()) unlockThen(() => playWelcome());
  pending = false;
}

/** Al pulsar «Entrar»: bienvenida si aún no sonó; si no, el sonido de apertura. */
export function enterCue() {
  if (!soundWanted()) return;
  unlockThen(() => {
    if (!welcomeDone()) playWelcome();
    else if (performance.now() - welcomeAt > WELCOME_MS && !document.hidden) chimeEnter();
    sleepSoon();
  });
}

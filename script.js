'use strict';
/* ============ Canvas & constants ============ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const SAND_Y = 545;
const POLES = [
  { x: 210, baseX: 210, tipY: 245, baseY: SAND_Y, landed: 0 },
  { x: 430, baseX: 430, tipY: 245, baseY: SAND_Y, landed: 0 }
];
const DRIFT_LIMIT = POLES[0].tipY + 58; // rings can't float above this on their own
// Air jets blow up-and-inward. Default 55 degrees from horizontal; the player can
// rotate the pump knobs to adjust each jet between 30 and 75 degrees.
const JETS = {
  left:  { x: 105, originX: 105, originY: SAND_Y, angle: 55, dirSign: 1,  dx: 0.574, dy: -0.819, active: false },
  right: { x: 535, originX: 535, originY: SAND_Y, angle: 55, dirSign: -1, dx: -0.574, dy: -0.819, active: false }
};
function updateJetDir(j) {
  const rad = j.angle * Math.PI / 180;
  j.dx = j.dirSign * Math.cos(rad);
  j.dy = -Math.sin(rad);
}
// Small always-on vent between the two poles: blows slowly upward, much weaker
// than the side jets, only to keep the water moving. It never sets a ring's lift,
// so on its own it cannot push a ring over a pole tip.
const CENTER_VENT = { x: 320, originY: SAND_Y };
const RING_COLORS = ['#ef476f','#06d6a0','#ffd166','#118ab2','#9b5de5','#ff8c42',
                     '#ef476f','#ffd166','#06d6a0','#118ab2','#ff8c42','#9b5de5'];

const timerEl = document.getElementById('timer');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovText = document.getElementById('ovText');
const startBtn = document.getElementById('startBtn');
const bgmBtn = document.getElementById('bgmBtn');

/* ============ Audio: all synthesized, no files needed ============ */
let AC = null, bgmOn = true, sfxOn = true, bgmTimer = null, bgmStep = 0;
let bgmWanted = false, audioWatchStarted = false, mediaUnlockEl = null;
/* v7 audio unlock: external browsers (iOS Safari / WeChat webview) suspend the
   AudioContext and silently drop notes scheduled into it. So: unlock on ANY
   touch/click/key, retry resume on a watcher, hold the media session with a
   silent looping <audio>, and only start the BGM once the context is running. */
function ensureAudio() {
  // iOS: ask for 'playback' session so Web Audio is not silenced by the mute switch
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
    // 1-sample silent buffer: "plays" once to unlock the context
    try {
      const buf = AC.createBuffer(1, 1, AC.sampleRate);
      const src = AC.createBufferSource(); src.buffer = buf; src.connect(AC.destination); src.start(0);
    } catch (e) {}
    // silent looping <audio> holds the media session (iOS silent switch / WeChat)
    try {
      if (!mediaUnlockEl) {
        mediaUnlockEl = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        mediaUnlockEl.loop = true; mediaUnlockEl.volume = 0;
        mediaUnlockEl.play().catch(() => {});
      } else mediaUnlockEl.play().catch(() => {});
    } catch (e) {}
    AC.onstatechange = () => { if (AC.state === 'running') audioNowRunning(); };
    if (!audioWatchStarted) {
      audioWatchStarted = true;
      setInterval(() => {
        if (!AC) return;
        if (AC.state === 'suspended') AC.resume().catch(() => {});
        else if (AC.state === 'running') audioNowRunning();
      }, 600);
    }
  }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  else if (AC.state === 'running') audioNowRunning();
}
function audioNowRunning() {
  hideSoundBtn();
  if (bgmWanted && bgmOn && state === 'playing') startBGM();
}
/* Any touch / click / key anywhere unlocks audio (capture phase). */
['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(ev =>
  document.addEventListener(ev, ensureAudio, { capture: true, passive: true }));
document.addEventListener('WeixinJSBridgeReady', () => { ensureAudio(); if (mediaUnlockEl) mediaUnlockEl.play().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureAudio(); });
window.addEventListener('pageshow', ensureAudio);
function tone(midiOrFreq, dur = 0.15, type = 'square', vol = 0.1, delay = 0, slideTo = null, isMidi = false) {
  if (!AC) return;
  if (AC.state !== 'running') { ensureAudio(); return; } // never schedule into a suspended context
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  const f = isMidi ? 440 * Math.pow(2, (midiOrFreq - 69) / 12) : midiOrFreq;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
/* Soft pad tone for the BGM: slow attack, long release - no plucked "tick" transient. */
function padTone(midi, dur = 1.9, vol = 0.026, delay = 0) {
  if (!AC) return;
  if (AC.state !== 'running') { ensureAudio(); return; } // never schedule into a suspended context
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.3);
  g.gain.setValueAtTime(vol, t0 + dur - 0.45);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
const sfxRaw = {
  bubble() { /* removed: the per-press blip was deleted by request - pressing a knob now only makes the soft jet-air sound */ },
  poleHit() { /* removed in v6: repeated square-wave dings while rings bounce off poles were a main source of the "di-di-da-da" ticking */ },
  success() { [72, 76, 79, 84].forEach((n, i) => tone(n, 0.14, 'triangle', 0.13, i * 0.085, null, true)); },
  miss() { /* removed in v6: repeated descending tones while rings fell were also heard as ticking/clatter */ },
  /* tick() deleted in v6 sync: the old 1050 Hz square blip is gone entirely (it was dead code, never called, but must not survive into the GitHub version) */
  countDown(secLeft) {
    // last-10-seconds cue: soft wooden tok, rising and a little firmer in the final 3
    if (secLeft > 3) { tone(660, 0.09, 'sine', 0.09); tone(1320, 0.05, 'sine', 0.03); }
    else {
      const f = [0, 1047, 988, 880][secLeft] || 880;
      tone(f, 0.13, 'triangle', 0.13); tone(f * 2, 0.06, 'sine', 0.04);
    }
  },
  countStart() { [69, 76].forEach((n, i) => tone(n, 0.16, 'sine', 0.08, i * 0.11, null, true)); },
  start() { /* removed in v6 sync to match the online artifact: pressing Start makes no beep — the pad BGM simply begins. Call site in startGame() stays harmless. */ },
  victory() {
    stopBGM();
    [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => tone(n, 0.22, 'square', 0.11, i * 0.13, null, true));
    [48, 55, 60].forEach((n, i) => tone(n, 0.5, 'triangle', 0.08, i * 0.39, null, true));
  },
  sad() {
    stopBGM();
    [64, 62, 60, 59].forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      tone(f, 0.3, 'sawtooth', 0.07, i * 0.24, f * 0.86);
    });
  }
};
/* All sound effects go through this gate: the SFX toggle silences every effect
   (jet noise checks sfxOn separately), while BGM keeps its own toggle. */
const sfx = new Proxy(sfxRaw, {
  get: (target, prop) => (...args) => { if (!sfxOn) return; return target[prop](...args); }
});
/* BGM v6: slow PAD CHORDS, not plucked notes. Even the gentle music-box melody
   was heard as "di-da" ticking because every note had a short pluck envelope.
   Now four soft chords cross-fade every ~1.8s - a calm wash with no rhythm hits. */
/* BGM is per-mode now (sound effects are NOT changed - only the music):
   normal = the same slow gentle pads; hard = a faster minor-key chase
   ("you chase me, I chase you") with a soft bass pulse; easy = a cheerful
   major-key tune that sounds like it's giggling. All pad tones with slow
   attack - no plucked notes, so nothing can read as ticking. */
const BGM_SETS = {
  normal: { chords: [
    [48, 52, 55, 59],  // Cmaj7
    [45, 48, 52, 55],  // Am7
    [41, 45, 48, 52],  // Fmaj7
    [43, 47, 50, 55]   // G6
  ], interval: 1800 },
  hard: { chords: [
    [45, 52, 57, 60],  // Am
    [41, 48, 53, 57],  // F
    [38, 45, 50, 57],  // Dm
    [40, 44, 47, 52]   // E
  ], interval: 950, bass: true },
  easy: { chords: [
    [48, 52, 55, 60],  // C
    [43, 47, 50, 59],  // G
    [45, 52, 57, 60],  // Am
    [41, 48, 53, 57]   // F
  ], interval: 1400, bright: true }
};
function startBGM() {
  if (!bgmOn || bgmTimer) return;
  bgmWanted = true;
  if (!AC || AC.state !== 'running') { ensureAudio(); return; } // watcher starts it once running
  bgmStep = 0;
  const set = BGM_SETS[mode] || BGM_SETS.normal;
  const playChord = () => {
    const chord = set.chords[bgmStep % set.chords.length];
    chord.forEach(n => padTone(n, set.interval / 1000 + 0.3, 0.024));
    if (set.bass) padTone(chord[0] - 12, 1.0, 0.02);       // soft low pulse: the chase heartbeat
    else padTone(chord[1] + 12, 2.1, 0.01);
    if (set.bright) padTone(chord[0] + 12, 1.6, 0.012);    // bright top note: the giggle
    bgmStep++;
  };
  playChord();
  bgmTimer = setInterval(playChord, set.interval);
}
function stopBGM() { bgmWanted = false; if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }
/* Blowing sound: one continuous soft air/water noise while a jet is on.
   Deliberately NOT repeated beeps - the old per-bubble sine blips every 110ms
   were the harsh "di-di-di" the player complained about. */
let jetNoise = null;
function startJetNoise() {
  if (!AC || jetNoise || !sfxOn) return;
  if (AC.state !== 'running') { ensureAudio(); return; }
  try {
    const len = AC.sampleRate;
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = AC.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = 0.7;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.032, AC.currentTime + 0.12);
    src.connect(filter); filter.connect(g); g.connect(AC.destination);
    src.start();
    jetNoise = { src, g };
  } catch (e) { jetNoise = null; }
}
function stopJetNoise() {
  if (!jetNoise || !AC) { jetNoise = null; return; }
  const { src, g } = jetNoise; jetNoise = null;
  try {
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.12);
    src.stop(AC.currentTime + 0.16);
  } catch (e) {}
}
bgmBtn.addEventListener('click', () => {
  ensureAudio(); bgmOn = !bgmOn;
  bgmBtn.textContent = bgmOn ? '♪ BGM 开' : '♪ BGM 关';
  bgmBtn.classList.toggle('off', !bgmOn);
  if (bgmOn && state === 'playing') startBGM(); else stopBGM();
});
const sfxBtn = document.getElementById('sfxBtn');
sfxBtn.addEventListener('click', () => {
  ensureAudio(); sfxOn = !sfxOn;
  sfxBtn.textContent = sfxOn ? '🔊 音效 开' : '🔇 音效 关';
  sfxBtn.classList.toggle('off', !sfxOn);
  if (!sfxOn) stopJetNoise();
});
/* Big yellow sound button: visible until audio is really running, then hides itself.
   If the context is stuck, tapping it tears it down and rebuilds it once. */
const soundBtn = document.getElementById('soundBtn');
function hideSoundBtn() { if (soundBtn) soundBtn.style.display = 'none'; }
soundBtn.addEventListener('click', () => {
  ensureAudio();
  setTimeout(() => {
    if (AC && AC.state !== 'running') {
      try { AC.close(); } catch (e) {}
      AC = null; audioWatchStarted = false; ensureAudio();
    }
  }, 350);
});

/* ============ Game state ============ */
let state = 'idle'; // idle | playing | ended
let score = 0, timeLeft = 60, lastTickSecond = -1, lastTime = performance.now(), alerted10 = false;

/* ============ Modes: normal / hard (moving poles) / easy (invincible) ============ */
const MODES = {
  normal: { name: '普通版',
    desc: '12 个圈都在水里自己飘，但飘不到杆顶<br/>按住左右吹气按钮，把圈吹过杆尖套进去！',
    howto: '玩法：点开始后圈会自己慢慢飘（但到不了杆顶）→ 按住吹气把圈吹上去 → 对准杆尖落下套住。60 秒内套中越多越好，套中 6 个以上有胜利结局音效！' },
  hard: { name: '移动版',
    desc: '杆子会左右来回移动！<br/>等杆子移到圈的上方再吹气，套中更难啦',
    howto: '玩法：杆子来回移动！等杆子移到圈的上方再吹气 → 对准杆尖落下套住。60 秒内套中越多越好，套中 6 个以上有胜利结局音效！' },
  easy: { name: '无敌版',
    desc: '试试就知道！😉',
    howto: '玩法：这个版本有点不一样，亲自试一局就知道啦！' }
};
let mode = 'normal';
let closed = false; // the game was closed via the ✕ button; the big button reopens home first
let poleClock = 0, autoDone = false;
function driftLimit() { return mode === 'easy' ? POLES[0].tipY + 18 : DRIFT_LIMIT; }
let rings = [], bubbles = [], lastBubbleSfx = 0, lastMissSfx = 0;

const fishes = [
  { x: 120, baseY: 105, speed: 0.55, dir: 1, scale: 1.05, type: 'clown', phase: 0 },
  { x: 480, baseY: 185, speed: 0.42, dir: -1, scale: 0.95, type: 'tang', phase: 2.1 },
  { x: 300, baseY: 62, speed: 0.7, dir: 1, scale: 0.62, type: 'yellow', phase: 4.2 }
];

/* Easy (invincible) version gets 20 rings instead of 12, laid out 10 per row. */
let ringTotal = 12;
function makeRings() {
  ringTotal = mode === 'easy' ? 20 : 12;
  const perRow = ringTotal === 20 ? 10 : 7;
  const xs = ringTotal === 20 ? 38 : 62, dx = ringTotal === 20 ? 62 : 82;
  const y0 = ringTotal === 20 ? 458 : 452, dy = ringTotal === 20 ? 56 : 52;
  rings = Array.from({ length: ringTotal }, (_, i) => RING_COLORS[i % RING_COLORS.length]).map((color, i) => ({
    x: xs + (i % perRow) * dx + (Math.random() * 22 - 11),
    y: y0 + Math.floor(i / perRow) * dy + (Math.random() * 16 - 8),
    vx: 0, vy: 0, angle: Math.random() * 0.5 - 0.25, va: 0,
    r: 27, color, phase: Math.random() * Math.PI * 2,
    state: 'free', pole: -1, lift: 0, hitCd: 0, wasHigh: false, prevY: 0
  }));
}
makeRings();

function resetGame() {
  POLES.forEach(p => { p.landed = 0; p.x = p.baseX; });
  poleClock = 0; autoDone = false;
  score = 0; timeLeft = 60; lastTickSecond = -1; alerted10 = false; bubbles = [];
  makeRings(); updateHUD();
  timerEl.classList.remove('warn');
}
function updateHUD() {
  scoreEl.textContent = `RING ${score} / ${ringTotal}`;
  const s = Math.max(0, Math.ceil(timeLeft));
  timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startGame() {
  ensureAudio(); resetGame();
  state = 'playing';
  overlay.classList.add('hidden');
  stopBGM(); startBGM(); sfx.start();
}
function endGame() {
  if (state !== 'playing' && state !== 'ending') return; // the round was already left via 首页/关闭
  state = 'ended'; stopBGM(); stopJetNoise();
  JETS.left.active = JETS.right.active = false;
  document.querySelectorAll('.pump').forEach(b => b.classList.remove('pressed'));
  if (mode === 'easy') {
    ovTitle.textContent = '玩家无敌了！👑';
    ovText.innerHTML = `60 秒你套中了 <b>${score} / ${ringTotal}</b> 个圈！<br/>最后 6 秒圈圈自己飞上杆子——无敌！`;
    startBtn.textContent = '再来一局';
    overlay.classList.remove('hidden');
    sfx.victory();
    return;
  }
  const many = score >= 6;
  ovTitle.textContent = many ? '太厉害了！🎉' : '差一点点～';
  ovText.innerHTML = many
    ? `60 秒你套中了 <b>${score} / ${ringTotal}</b> 个圈！<br/>这手感，小时候的你都佩服`
    : `60 秒套中了 <b>${score} / ${ringTotal}</b> 个圈<br/>就差一点，多按两下吹气再试试`;
  startBtn.textContent = '再来一局';
  overlay.classList.remove('hidden');
  if (many) sfx.victory(); else sfx.sad();
}
/* The big button does double duty: on the closed screen it reopens the
   home screen; everywhere else it starts a game. */
function primaryAction() {
  if (closed) { closed = false; resetGame(); renderModeInfo(); return; }
  startGame();
}
startBtn.addEventListener('click', primaryAction);

/* Mode select on the home screen: three versions, picked before Start. */
const modeRow = document.getElementById('modeRow');
const hintEl = document.getElementById('hint');
function renderModeInfo() {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
  modeRow.style.display = '';
  ovTitle.textContent = '水中套圈';
  ovText.innerHTML = MODES[mode].desc;
  startBtn.textContent = `开始${MODES[mode].name} · 60 秒`;
  if (hintEl) hintEl.textContent = MODES[mode].howto;
}
modeRow.addEventListener('click', e => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  ensureAudio();
  mode = btn.dataset.mode;
  renderModeInfo();
});
renderModeInfo();

/* Long-press anywhere must never select text or pop the copy-paste menu:
   the whole page is a game controller, not a document. */
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

/* Home + Close: no more waiting out the 60 seconds or killing the page.
   Home stops the round and goes back to the mode-select screen; Close
   tries to close the page, and if the browser won't let it, shows a
   closed screen with a way back in. */
function stopRound() {
  state = 'idle'; stopBGM(); stopJetNoise();
  JETS.left.active = JETS.right.active = false;
  document.querySelectorAll('.pump').forEach(b => b.classList.remove('pressed'));
}
document.getElementById('homeBtn').addEventListener('click', () => {
  ensureAudio(); stopRound(); resetGame(); renderModeInfo();
  overlay.classList.remove('hidden');
});
document.getElementById('closeBtn').addEventListener('click', () => {
  ensureAudio(); stopRound(); closed = true;
  try { window.close(); } catch (e) {}
  modeRow.style.display = 'none';
  ovTitle.textContent = '游戏已关闭';
  ovText.innerHTML = '谢谢游玩！<br/>想再玩就点下面的按钮';
  startBtn.textContent = '重新打开游戏';
  overlay.classList.remove('hidden');
});

/* ============ Input: rotary pump knobs - one fluid gesture ============
   There are NO modes. Touching a knob blows IMMEDIATELY and keeps blowing
   while the finger is down; circling the finger at the same time rotates
   the knob and steers the jet (the light cone in the water follows).
   Releasing stops the air. Like a real game controller: everything at once. */
function setJetAngle(jet, deg, needleEl, labelEl) {
  jet.angle = Math.max(30, Math.min(75, Math.round(deg)));
  updateJetDir(jet);
  if (needleEl) needleEl.style.transform = `rotate(${jet.dirSign * (90 - jet.angle)}deg)`;
  if (labelEl) labelEl.textContent = `${jet.angle}°`;
}
function bindKnob(el, jet, needleEl, labelEl) {
  let down = null;
  const centerOf = () => { const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
  const stopBlow = () => { jet.active = false; el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); ensureAudio();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    const { cx, cy } = centerOf();
    down = { x: e.clientX, y: e.clientY, rot: jet.dirSign * (90 - jet.angle),
      lastA: Math.atan2(e.clientY - cy, e.clientX - cx), cx, cy };
    jet.active = true;                       // blow right away, no delay, no mode
    el.classList.add('pressed');
  });
  el.addEventListener('pointermove', e => {
    if (!down) return;                       // blowing continues the whole time
    const dx = e.clientX - down.x;
    down.x = e.clientX; down.y = e.clientY;
    /* steering-wheel rotation: accumulate the tangential part of every small
       finger movement, boosted, so circling anywhere on the knob steers it.
       Near the centre, a sideways drag rotates instead. */
    const vx = e.clientX - down.cx, vy = e.clientY - down.cy;
    let deltaDeg;
    if (Math.hypot(vx, vy) > 12) {
      const a = Math.atan2(vy, vx);
      let da = a - down.lastA;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      down.lastA = a;
      deltaDeg = da * 180 / Math.PI * 1.8;
    } else {
      deltaDeg = dx * 0.6;
    }
    down.rot += deltaDeg;
    const mag = Math.max(15, Math.min(60, Math.abs(down.rot)));
    down.rot = mag * jet.dirSign;
    setJetAngle(jet, 90 - mag, needleEl, labelEl);
  });
  const finish = () => { stopBlow(); down = null; };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
  el.addEventListener('wheel', e => {
    e.preventDefault(); ensureAudio();
    setJetAngle(jet, jet.angle + (e.deltaY < 0 ? 2 : -2), needleEl, labelEl);
  }, { passive: false });
  el.addEventListener('contextmenu', e => e.preventDefault());
  setJetAngle(jet, jet.angle, needleEl, labelEl);
}
bindKnob(document.getElementById('leftBtn'), JETS.left,
  document.getElementById('leftNeedle'), document.getElementById('leftAngle'));
bindKnob(document.getElementById('rightBtn'), JETS.right,
  document.getElementById('rightNeedle'), document.getElementById('rightAngle'));
const KEYMAP = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
document.addEventListener('keydown', e => {
  const j = KEYMAP[e.key.toLowerCase()];
  if (j) { ensureAudio(); JETS[j].active = true; document.getElementById(j + 'Btn').classList.add('pressed'); }
  if (e.key === ' ' && state !== 'playing') { e.preventDefault(); primaryAction(); }
});
document.addEventListener('keyup', e => {
  const j = KEYMAP[e.key.toLowerCase()];
  if (j) { JETS[j].active = false; document.getElementById(j + 'Btn').classList.remove('pressed'); }
});

/* Last 6 seconds of the invincible version: a few free rings fly onto the poles by themselves. */
function autoLandRings() {
  const free = rings.filter(r => r.state === 'free').sort((a, b) => b.y - a.y); // lowest first: nearest the pole bases
  free.slice(0, 4).forEach(r => {
    const p = POLES[0].landed <= POLES[1].landed ? POLES[0] : POLES[1];
    r.state = 'landing'; r.pole = POLES.indexOf(p); r.slot = p.landed++; r.vx = r.vy = 0;
  });
}

/* ============ Physics ============ */
function spawnBubble(x, y, big = false, vx = 0, vy = null) {
  bubbles.push({ x: x + (Math.random() * 30 - 15), y, r: big ? 3 + Math.random() * 5 : 1.5 + Math.random() * 3.5,
    vx, vy: vy === null ? -(0.7 + Math.random() * 1.1) : vy, wob: Math.random() * Math.PI * 2 });
}
function stepPhysics(t) {
  updateJetDir(JETS.left); updateJetDir(JETS.right);
  /* hard version: both poles slide left-right together, keeping their distance */
  if (mode === 'hard' && state === 'playing') {
    const off = Math.sin(poleClock / 850) * 55;
    POLES.forEach(p => p.x = p.baseX + off);
  }
  const jetOn = JETS.left.active || JETS.right.active;
  if (jetOn && state === 'playing') {
    for (const k of ['left', 'right']) if (JETS[k].active) {
      const j = JETS[k];
      for (let i = 0; i < 3; i++)
        spawnBubble(j.originX + j.dx * 14, j.originY - 8, true, j.dx * (1.6 + Math.random()), j.dy * (1.6 + Math.random()));
    }
    /* no repeated beeps while blowing - the soft jet noise below replaces them */
  }
  if (jetOn && state === 'playing') startJetNoise(); else stopJetNoise();
  if (Math.random() < 0.05) spawnBubble(40 + Math.random() * 560, SAND_Y - 4);
  /* centre vent: always on, slow small bubbles, slightly wider spread than v3 */
  if (Math.random() < 0.22) spawnBubble(CENTER_VENT.x + (Math.random() * 44 - 22), CENTER_VENT.originY - 6, false, (Math.random() - 0.5) * 0.2, -(0.45 + Math.random() * 0.3));
  bubbles.forEach(b => {
    b.vy += (-1.15 - b.vy) * 0.02;               // bubbles gradually turn to straight rise
    b.vx *= 0.98;
    b.y += b.vy; b.x += b.vx + Math.sin(t / 300 + b.wob) * 0.4;
  });
  bubbles = bubbles.filter(b => b.y > -12 && b.x > -12 && b.x < W + 12);

  for (const f of fishes) {
    f.x += f.speed * f.dir;
    if (f.dir > 0 && f.x > W + 110) f.x = -110;
    if (f.dir < 0 && f.x < -110) f.x = W + 110;
  }
  if (state !== 'playing') {
    /* ambient flow: even before Start / after the round, the water moves and
       carries the rings gently - they never sit perfectly still */
    for (const r of rings) {
      if (r.state !== 'free') continue;
      r.vy += 0.03 + Math.cos(t / 800 + r.x * 0.01) * 0.006;
      r.vx += Math.sin(t / 700 + r.y * 0.012 + r.phase) * 0.02;
      if (Math.abs(r.x - CENTER_VENT.x) < 66 && r.y > 150) r.vy -= 0.07; // gentle centre vent, wider range, same strength
      if (r.y < driftLimit()) r.vy += 0.14;
      r.vy *= 0.965; r.vx *= 0.982;
      r.x += r.vx; r.y += r.vy;
      r.angle = Math.max(-0.5, Math.min(0.5, r.angle + r.vx * 0.01));
      if (r.x < r.r) { r.x = r.r; r.vx = Math.abs(r.vx) * 0.5; }
      if (r.x > W - r.r) { r.x = W - r.r; r.vx = -Math.abs(r.vx) * 0.5; }
      if (r.y > SAND_Y - 14) { r.y = SAND_Y - 14; r.vy = -Math.abs(r.vy) * 0.2; r.vx *= 0.9; }
      if (r.y < 20) { r.y = 20; r.vy = Math.abs(r.vy) * 0.3; }
    }
    return;
  }

  for (const r of rings) {
    if (r.state === 'landed') { r.x = POLES[r.pole].x; continue; } // landed rings ride the moving poles
    if (r.state === 'landing') {
      const p = POLES[r.pole], targetY = p.baseY - 20 - r.slot * 15;
      r.y += 3.2; r.x += (p.x - r.x) * 0.35; r.angle *= 0.8;
      if (r.y >= targetY) {
        r.y = targetY; r.state = 'landed'; score++; updateHUD(); sfx.success();
        if (score >= ringTotal) { setTimeout(endGame, 450); state = 'ending'; }
      }
      continue;
    }
    r.prevY = r.y;
    /* --- water forces: a real circulating current, not still water --- */
    r.vy += 0.045;                                            // slow sinking
    r.vy += Math.sin(t / 650 + r.phase) * 0.006;              // gentle wobble
    // flow field: horizontal current that reverses with depth + a slow vertical swell.
    // It keeps every ring drifting and tumbling, but is far too weak to lift a ring over a pole tip.
    r.vx += Math.sin(t / 700 + r.y * 0.012 + r.phase) * 0.02 + Math.sin(t / 1400 + r.x * 0.004) * 0.012;
    r.vy += Math.cos(t / 800 + r.x * 0.01) * 0.009;
    r.lift = Math.max(0, r.lift - 1);
    for (const k of ['left', 'right']) {
      if (!JETS[k].active) continue;
      const j = JETS[k];
      const relX = r.x - j.originX, relY = r.y - j.originY;
      const along = relX * j.dx + relY * j.dy;                // distance along the 55-degree jet
      const perpX = relX - along * j.dx, perpY = relY - along * j.dy;
      const perp = Math.hypot(perpX, perpY);                  // distance from the jet axis
      if (along > 0 && along < 430 && perp < 46 + along * 0.17) {
        const a = (mode === 'easy' ? 1.15 : 0.78) * (1 - along / 470);
        r.vx += j.dx * a + (Math.random() - 0.5) * 0.1;
        r.vy += j.dy * a + (Math.random() - 0.5) * 0.06;
        r.lift = mode === 'easy' ? 40 : 26;
      }
    }
    /* centre vent: weak & slow, stirs the water and nudges rings, but never sets lift.
       v4: range widened a little (48 -> 68), strength unchanged as requested. */
    if (Math.abs(r.x - CENTER_VENT.x) < 68 && r.y > 140) {
      r.vy -= 0.15;
      r.vx += Math.sin(t / 900 + r.y * 0.012) * 0.012;
    }
    /* --- key rule: on its own a ring can NOT rise above the drift limit ---
       (invincible version: the limit is much higher, so rings float almost to the tips) */
    if (r.lift <= 0 && r.y < driftLimit()) r.vy += 0.16;
    if (r.lift <= 0 && r.y < driftLimit() - 42 && r.vy < 0.25) r.vy = 0.25;

    r.vy *= 0.965; r.vx *= 0.982;
    r.vy = Math.max(-5.2, Math.min(2.3, r.vy));
    r.vx = Math.max(-3.6, Math.min(3.6, r.vx));
    r.x += r.vx; r.y += r.vy;
    r.va = r.vx * 0.012 + Math.sin(t / 500 + r.phase) * 0.0015;
    r.angle = Math.max(-0.5, Math.min(0.5, r.angle + r.va));
    r.hitCd = Math.max(0, r.hitCd - 1);
    if (r.y < POLES[0].tipY - 26) r.wasHigh = true;

    /* --- walls & sand --- */
    if (r.x < r.r) { r.x = r.r; r.vx = Math.abs(r.vx) * 0.5; }
    if (r.x > W - r.r) { r.x = W - r.r; r.vx = -Math.abs(r.vx) * 0.5; }
    if (r.y < 20) { r.y = 20; r.vy = Math.abs(r.vy) * 0.3; }
    const floorY = SAND_Y - 14;
    if (r.y > floorY) {
      r.y = floorY;
      if (r.wasHigh && t - lastMissSfx > 900) { sfx.miss(); lastMissSfx = t; }
      r.wasHigh = false; r.vy = -Math.abs(r.vy) * 0.22; r.vx *= 0.86;
    }

    /* --- poles --- */
    POLES.forEach((p, pi) => {
      if (r.state !== 'free') return;
      const dx = r.x - p.x;
      // landing: falling, centred, centre crosses the tip
      const catchW = mode === 'easy' ? 22 : 11; // invincible version: a much wider catch
      if (r.vy > 0.1 && Math.abs(dx) < catchW && r.prevY < p.tipY && r.y >= p.tipY) {
        r.state = 'landing'; r.pole = pi; r.slot = p.landed++; r.vx = r.vy = 0;
        return;
      }
      // bounce off the tip
      const dTip = Math.hypot(dx, r.y - p.tipY);
      if (dTip < 30 && Math.abs(dx) >= 11) {
        const nx = dx / (dTip || 1), ny = (r.y - p.tipY) / (dTip || 1);
        r.x = p.x + nx * 30; r.y = p.tipY + ny * 30;
        r.vx = nx * 1.5; r.vy = Math.min(r.vy, ny * 1.2);
        if (r.hitCd <= 0) { sfx.poleHit(); r.hitCd = 22; }
        return;
      }
      // slide off the shaft sides
      if (r.y > p.tipY + 12 && r.y < p.baseY && Math.abs(dx) < r.r && Math.abs(dx) >= 11) {
        r.x = p.x + Math.sign(dx) * r.r; r.vx = Math.sign(dx) * Math.abs(r.vx) * 0.55;
        if (r.hitCd <= 0) { sfx.poleHit(); r.hitCd = 22; }
      }
    });
  }
  /* ring vs ring: soft separation */
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const a = rings[i], b = rings[j];
    if (a.state !== 'free' || b.state !== 'free') continue;
    const dx = b.x - a.x, dy = (b.y - a.y) * 1.7, d = Math.hypot(dx, dy);
    if (d > 0.01 && d < 52) {
      const push = (52 - d) / 2, nx = dx / d, ny = dy / d;
      a.x -= nx * push * 0.6; a.y -= ny * push * 0.35;
      b.x += nx * push * 0.6; b.y += ny * push * 0.35;
    }
  }
}

/* ============ Drawing ============ */
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d6f6ff'); g.addColorStop(0.38, '#8fd8f7');
  g.addColorStop(0.78, '#4fb0e6'); g.addColorStop(1, '#2f8fc9');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;   // pixel / mosaic grid
  for (let x = 0; x <= W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const ray = ctx.createLinearGradient(0, 0, 220, H);              // glass light
  ray.addColorStop(0, 'rgba(255,255,255,0.34)'); ray.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = ray; ctx.fillRect(0, 0, W, H);
  /* visible current: drifting streaks - upper water flows right, lower water flows back left */
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (let i = 0; i < 16; i++) {
    const y = 46 + (i * 61) % 440;
    const dir = y < 290 ? 1 : -1;
    const speed = 0.018 + (i % 3) * 0.008;
    let x = (i * 113 + dir * t * speed) % (W + 80);
    if (x < 0) x += W + 80;
    ctx.beginPath(); ctx.ellipse(x - 40, y + Math.sin(t / 500 + i) * 4, 17, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  /* sand: pixel blocks */
  for (let x = 0; x < W; x += 26) {
    ctx.fillStyle = ['#ffe27a', '#ffd43b', '#f5c542'][x / 26 % 3];
    ctx.fillRect(x, SAND_Y, 26, H - SAND_Y);
  }
  ctx.fillStyle = '#fff3b0'; ctx.fillRect(0, SAND_Y, W, 4);
  drawPlants(t);
  /* starfish + shell */
  ctx.fillStyle = '#fb923c'; ctx.font = '26px serif'; ctx.fillText('★', 292, SAND_Y + 46);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(352, SAND_Y + 42, 10, Math.PI, 0); ctx.stroke();
}
function drawPlants(t) {
  const sway = Math.sin(t / 800) * 5;
  ctx.lineCap = 'round';
  const blade = (x, h, c, s) => {
    ctx.strokeStyle = c; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x, SAND_Y + 4);
    ctx.quadraticCurveTo(x + sway * s, SAND_Y - h * 0.55, x + sway * 1.7 * s, SAND_Y - h); ctx.stroke();
  };
  blade(26, 92, '#0ea47a', 1); blade(50, 118, '#10b981', 0.7); blade(76, 76, '#059669', 1.2);
  blade(566, 84, '#f472b6', 1); blade(592, 108, '#fb7185', 0.7); blade(616, 70, '#e879a9', 1.2);
}
function drawPoles() {
  for (const p of POLES) {
    ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 13, p.baseY - 4, 26, 10); ctx.strokeRect(p.x - 13, p.baseY - 4, 26, 10);
    const g = ctx.createLinearGradient(p.x - 6, 0, p.x + 6, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#dbe4ee'); g.addColorStop(1, '#94a3b8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(p.x - 6, p.tipY, 12, p.baseY - p.tipY, 6); ctx.fill();
    const cap = ctx.createLinearGradient(0, p.tipY - 9, 0, p.tipY + 5);
    cap.addColorStop(0, '#ffe066'); cap.addColorStop(1, '#f59e0b');
    ctx.fillStyle = cap; ctx.strokeStyle = '#b45309';
    ctx.beginPath(); ctx.ellipse(p.x, p.tipY - 2, 14, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
function bodyPath(s) {
  ctx.beginPath();
  ctx.moveTo(-38 * s, 0);
  ctx.bezierCurveTo(-30 * s, -17 * s, 6 * s, -20 * s, 26 * s, -9 * s);
  ctx.bezierCurveTo(38 * s, -2 * s, 38 * s, 2 * s, 26 * s, 9 * s);
  ctx.bezierCurveTo(6 * s, 20 * s, -30 * s, 17 * s, -38 * s, 0);
  ctx.closePath();
}
function drawFish(f, t) {
  const s = f.scale, wag = Math.sin(t / 130 + f.phase) * 0.28;
  ctx.save();
  ctx.translate(f.x, f.baseY + Math.sin(t / 600 + f.phase) * 8);
  ctx.scale(f.dir * s, s);
  ctx.shadowColor = 'rgba(0,60,110,.3)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  /* tail */
  ctx.save(); ctx.translate(-34, 0); ctx.rotate(wag);
  ctx.fillStyle = f.type === 'tang' ? '#facc15' : f.type === 'yellow' ? '#eab308' : '#ea580c';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-17, -13); ctx.quadraticCurveTo(-11, 0, -17, 13); ctx.closePath(); ctx.fill();
  ctx.restore();
  /* body */
  const grad = ctx.createLinearGradient(0, -19, 0, 19);
  if (f.type === 'clown') { grad.addColorStop(0, '#ffb35c'); grad.addColorStop(1, '#f97316'); }
  else if (f.type === 'tang') { grad.addColorStop(0, '#38bdf8'); grad.addColorStop(1, '#0369a1'); }
  else { grad.addColorStop(0, '#fef08a'); grad.addColorStop(1, '#fde047'); }
  bodyPath(1); ctx.fillStyle = grad; ctx.fill();
  ctx.save(); bodyPath(1); ctx.clip();
  if (f.type === 'clown') {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.4;
    for (const [x, w] of [[-8, 10], [13, 8]]) {
      ctx.beginPath(); ctx.ellipse(x, 0, w / 2, 19, 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (f.type === 'tang') {
    ctx.fillStyle = 'rgba(15,23,42,.85)';
    ctx.beginPath(); ctx.moveTo(-30, -11); ctx.quadraticCurveTo(6, -17, 32, -3);
    ctx.quadraticCurveTo(8, -5, -16, 0); ctx.quadraticCurveTo(-28, 2, -30, -11); ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(249,115,22,.65)'; ctx.lineWidth = 3.4;
    for (const x of [-6, 7]) { ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x + 5, 18); ctx.stroke(); }
  }
  ctx.restore();
  /* fin + eye */
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.beginPath(); ctx.ellipse(2, 8, 10, 5.5, 0.5 + wag * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(27, -4, 3.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(28.3, -5.3, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawRing(r) {
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.angle);
  ctx.shadowColor = 'rgba(0,60,110,.28)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 3;
  ctx.lineWidth = 11; ctx.strokeStyle = r.color;
  ctx.beginPath(); ctx.ellipse(0, 0, r.r, 13, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(0, 0, r.r - 3, 10.5, 0, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
  ctx.restore();
}
function drawJets() {
  /* centre vent: faint slow updraft + a small grate on the sand */
  updateJetDir(JETS.left); updateJetDir(JETS.right);
  const cg = ctx.createLinearGradient(0, SAND_Y, 0, 300);
  cg.addColorStop(0, 'rgba(255,255,255,.16)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(CENTER_VENT.x - 38, SAND_Y); ctx.lineTo(CENTER_VENT.x - 22, 300);
  ctx.lineTo(CENTER_VENT.x + 22, 300); ctx.lineTo(CENTER_VENT.x + 38, SAND_Y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#475569'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(CENTER_VENT.x - 28, SAND_Y - 2, 56, 10, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#1f2937';
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(CENTER_VENT.x + i * 7, SAND_Y + 0.5); ctx.lineTo(CENTER_VENT.x + i * 7, SAND_Y + 5.5); ctx.stroke(); }

  for (const k of ['left', 'right']) {
    const j = JETS[k];
    if (j.active && state === 'playing') {
      const px = -j.dy, py = j.dx;                       // perpendicular to the jet
      const endX = j.originX + j.dx * 400, endY = j.originY + j.dy * 400;
      const g = ctx.createLinearGradient(j.originX, j.originY, endX, endY);
      g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(j.originX - px * 17, j.originY - py * 17);
      ctx.lineTo(endX - px * 82, endY - py * 82);
      ctx.lineTo(endX + px * 82, endY + py * 82);
      ctx.lineTo(j.originX + px * 17, j.originY + py * 17);
      ctx.closePath(); ctx.fill();
    }
    /* tilted nozzle, pointing 55 degrees up-and-inward */
    ctx.save();
    ctx.translate(j.originX, j.originY + 2);
    ctx.rotate(j.dirSign * (90 - j.angle) * Math.PI / 180);
    ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-9, -14, 18, 17, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.ellipse(0, -14, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function drawRingHalf(r, half) {
  // half = 'back' (upper arc, drawn behind the pole) or 'front' (lower arc, drawn over the pole)
  // Together with the pole drawn between them, a landed ring looks threaded onto the pole:
  // the pole passes through the hole instead of lying on top of the whole ring.
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.angle);
  ctx.lineWidth = 11; ctx.strokeStyle = r.color;
  ctx.beginPath();
  if (half === 'back') ctx.ellipse(0, 0, r.r, 13, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, r.r, 13, 0, 0, Math.PI);
  ctx.stroke();
  if (half === 'front') {
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(0, 0, r.r - 3, 10.5, 0, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
  }
  ctx.restore();
}
function drawBubbles() {
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6;
  for (const b of bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
}
function draw(t) {
  drawBackground(t);
  drawJets();
  fishes.forEach(f => drawFish(f, t));
  const threaded = rings.filter(r => r.state === 'landed' || r.state === 'landing');
  threaded.forEach(r => drawRingHalf(r, 'back'));   // back of the ring behind the pole
  drawPoles();                                       // pole passes through the ring's hole
  threaded.forEach(r => drawRingHalf(r, 'front'));  // front of the ring covers the pole
  rings.filter(r => r.state !== 'landed' && r.state !== 'landing').forEach(drawRing);
  drawBubbles();
  /* glass shine */
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(185, 0); ctx.lineTo(60, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
}

/* ============ Main loop ============ */
function frame(now) {
  const dt = Math.min(50, now - lastTime); lastTime = now;
  if (state === 'playing') {
    timeLeft -= dt / 1000;
    poleClock += dt;
    if (mode === 'easy' && !autoDone && timeLeft <= 6) { autoDone = true; autoLandRings(); }
    const s = Math.ceil(timeLeft);
    if (s <= 10 && s >= 1 && !alerted10) { alerted10 = true; sfx.countStart(); }
    if (s <= 10 && s >= 1 && s !== lastTickSecond) { lastTickSecond = s; sfx.countDown(s); }
    timerEl.classList.toggle('warn', timeLeft <= 10.5);
    if (timeLeft <= 0) { timeLeft = 0; updateHUD(); endGame(); }
    updateHUD();
  }
  /* run physics in fixed-ish steps relative to 60fps */
  const steps = Math.max(1, Math.round(dt / 16.7));
  for (let i = 0; i < steps; i++) stepPhysics(now);
  draw(now);
  requestAnimationFrame(frame);
}
updateHUD();
requestAnimationFrame(frame);

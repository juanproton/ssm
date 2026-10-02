// =====================================================================================================
//  PARTICLES · SHADER SKETCH
//
//   0.  GENERAL
//   1.  CAMERA AND PARTICLE MOTION
//   2.  STATES AND TRACKS: how they are chosen and timed
//
//   GROUP A · MOTION STATES  (own track: they run one at a time, with their own rests)
//   3.  ROTATION
//   4.  VELOCITY
//   5.  APERTURE             (own value -> 0 or max -> back)
//   6.  APERTURE SWING       (own value -> +max -> -max -> back)
//
//   GROUP B · SKIN STATES    (another track, independent from the motion one, with its own rests)
//   7.  FREQUENCY
//   8.  SUM                  (second pulse interference, final + final2)
//   9.  RGB SHIFT            (chromatic aberration)
//
//  10.  TRACKS REGISTRY
//  11.  VARIANTS (not states):  RUN (rings flow)  ·  ZONE (a random screen segment wakes up)
//  12.  SHADERS
//  13.  SETUP
//  14.  UPDATE
//  15.  DRAW
// =====================================================================================================


// =====================================================================================================
//  0. GENERAL
// =====================================================================================================
let shaderProgram;
let postShader;            // pass 2: pixelation rectangles
let pass1;                 // offscreen buffer where the particles are drawn
let vertCount;
let DIM = Math.max(window.innerWidth, window.innerHeight);

const numParticles = 1000; // fewer = sparser field

// pixelation rectangles (live in world space, like the particles)
const NUM_RECTS = 1;
const PIXEL_SIZE = 8;      // size of the "big pixels" inside the rectangles (screen px)
let rects = [];


// =====================================================================================================
//  1. CAMERA AND PARTICLE MOTION
// =====================================================================================================
let camPos = [0, 0];
let camVel = [0.0001, 0];  // camera speed per frame: [x, y]. Positive x = camera moves right
const HALF = 1.3;          // world is a loop of width 2*HALF around the camera (always off-screen at the edge)
const WRAP = HALF * 2;
const CULL_LIM = 1.22;     // beyond this (screen space) a particle isn't drawn

// own motion of every particle (a random direction that slowly wanders)
const DRIFT_MIN = 0.0002;          // every particle picks its own speed between MIN and MAX
const DRIFT_MAX = 0.0012;
const DRIFT_BREATH = 0.6;          // 0 = constant speed. 0.6 = the speed slowly swings between 40% and 160%
const DRIFT_BREATH_RATE = [0.1, 0.5]; // rad/s of that swing (every particle picks its own)
const WANDER = 0.03;               // max random turn per frame (radians). 0 = straight lines


// =====================================================================================================
//  2. STATES AND TRACKS
//     The states are split in two groups. Each group is a TRACK that works on its own:
//     it picks a random state, the state does its whole trip (go -> hold -> come back), the track rests
//     for a while, and picks the next one. The two tracks do NOT wait for each other, and each one has
//     its own durations, so motion changes and skin changes overlap in different ways every time.
// =====================================================================================================
const MOTION_TRACK = {
  timeScale: 1.5,          // multiplies every duration of the motion states. Higher = slower changes
  rest: [12, 30],          // seconds of rest between two motion states (x timeScale)
  maxRepeat: 2,            // the same state never runs more than this many times in a row
  startWith: {},           // chance (0..1) of STARTING the program already inside a state, e.g. { aperture: 0.2 }
};
const SKINS_TRACK = {
  timeScale: 1.5,
  rest: [9, 24],           // different from the motion rests, so the two tracks drift apart
  maxRepeat: 2,
  // When the program starts, with these chances it is ALREADY in that state (fully on, in its "hold"
  // phase) and then it eases back to normal. The rest of the chances (here 40%) start in the normal look.
  startWith: { sum: 0.3, chroma: 0.3 },
  onStateStart: () => runOnStateStart(),   // the "run" variant can start with a skin state
  onStateEnd:   () => runOnStateEnd(),
};

// Every transition picks a random PATTERN: the ORDER in which the particles change
//   0 left>right   1 right>left   2 top>bottom   3 bottom>top
//   4 TL>BR   5 BR>TL   6 BL>TR   7 TR>BL (diagonals)
//   8 center>edges   9 edges>center   10 random   11 clockwise sweep   12 all at once
const PATTERN_COUNT = 13;
const STAGGER_MIN = 0.4;   // how much of a smooth transition is used to delay the particles (0 = no delay)
const STAGGER_MAX = 0.8;

function ease(t) {
  t = constrain(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// A list of phases that runs once. Each phase lasts a random time inside its [min, max] range
// (x the timeScale of its track). apply(k) gets the (linear) progress k 0..1 of the phase.
class Cycle {
  constructor(phases) {
    this.phases = phases;
    this.scale = 1;
    this.i = 0; this.t = 0; this.dur = 1;
  }
  start() { this.begin(0); }
  // starts directly inside phase i (the onStart of the earlier phases still runs, to prepare their random values)
  startAt(i) {
    for (let j = 0; j < i; j++) if (this.phases[j].onStart) this.phases[j].onStart();
    this.begin(i);
  }
  begin(i) {
    this.i = i;
    this.t = 0;
    const ph = this.phases[i];
    this.dur = random(ph.range[0], ph.range[1]) * this.scale;
    if (ph.onStart) ph.onStart();
  }
  // returns true when the last phase is over
  update(dt) {
    this.t += dt;
    const ph = this.phases[this.i];
    ph.apply(min(this.t / this.dur, 1));
    if (this.t >= this.dur) {
      if (this.i + 1 >= this.phases.length) return true;
      this.begin(this.i + 1);
    }
    return false;
  }
}

// A group of states that run one at a time.
// every state is { name, make: () => Cycle, idle: () => void, uniforms: (shader) => void }
class Track {
  constructor(name, cfg, states) {
    this.name = name;
    this.cfg = cfg;
    this.states = states;
    this.current = -1;     // index of the state running now (-1 = resting)
    this.hist = [];        // the last states that ran (to limit repetitions)
    this.rest = 5;
  }
  init() {
    this.states.forEach(st => { st.cycle = st.make(); st.cycle.scale = this.cfg.timeScale; });
    this.current = -1;
    this.hist = [];
    this.rest = random(this.cfg.rest[0], this.cfg.rest[1]) * this.cfg.timeScale;

    // sometimes the program starts already inside a state (see cfg.startWith)
    const start = this.pickStart();
    if (start >= 0) {
      this.current = start;
      const st = this.states[start];
      st.cycle.startAt(st.start || 0);
    }
  }
  pickStart() {
    const chances = this.cfg.startWith || {};
    let r = random(), acc = 0;
    for (const name of Object.keys(chances)) {
      acc += chances[name];
      if (r < acc) return this.states.findIndex(st => st.name === name);
    }
    return -1;               // normal start
  }
  running() { return this.current >= 0 ? this.states[this.current].name : null; }
  pick() {
    let options = this.states.map((s, i) => i);
    const n = this.hist.length, m = this.cfg.maxRepeat;
    if (n >= m && this.hist.slice(-m).every(v => v === this.hist[n - 1])) {
      options = options.filter(i => i !== this.hist[n - 1]);
    }
    return random(options);
  }
  update(dt) {
    this.states.forEach(st => st.idle());     // everything at its normal value...
    if (this.current < 0) {
      this.rest -= dt;
      if (this.rest <= 0) {
        this.current = this.pick();
        this.states[this.current].cycle.start();
        if (this.cfg.onStateStart) this.cfg.onStateStart();
      }
    } else {
      // ...except the state that is running now, which overrides its own values
      const finished = this.states[this.current].cycle.update(dt);
      if (finished) {
        this.hist.push(this.current);
        if (this.hist.length > this.cfg.maxRepeat) this.hist.shift();
        this.current = -1;
        this.rest = random(this.cfg.rest[0], this.cfg.rest[1]) * this.cfg.timeScale;
        if (this.cfg.onStateEnd) this.cfg.onStateEnd();
        this.states.forEach(st => st.idle());
      }
    }
  }
}

// random order pattern (and stagger) for the next transition of a state
function setPattern(st) {
  st.pat = floor(random(PATTERN_COUNT));
  if ('st' in st) st.st = st.pat === 12 ? 0 : random(STAGGER_MIN, STAGGER_MAX);
}

// sends the usual group of values of a state to the shader: u_<pre>K / From / To / Pat / St
function uState(sh, pre, s) {
  sh.setUniform('u_' + pre + 'K', s.k);
  sh.setUniform('u_' + pre + 'From', s.from);
  sh.setUniform('u_' + pre + 'To', s.to);
  sh.setUniform('u_' + pre + 'Pat', s.pat);
  sh.setUniform('u_' + pre + 'St', s.st);
}

// the same two functions the vertex shader uses (orderOf / localProg), for the things done in JS
function orderOfJS(pat, qx, qy, rnd) {
  let o;
  switch (pat) {
    case 0:  o = (qx + 1) * 0.5; break;
    case 1:  o = 1 - (qx + 1) * 0.5; break;
    case 2:  o = (1 - qy) * 0.5; break;
    case 3:  o = (qy + 1) * 0.5; break;
    case 4:  o = (qx - qy + 2) * 0.25; break;
    case 5:  o = 1 - (qx - qy + 2) * 0.25; break;
    case 6:  o = (qx + qy + 2) * 0.25; break;
    case 7:  o = 1 - (qx + qy + 2) * 0.25; break;
    case 8:  o = Math.hypot(qx, qy) / 1.4142; break;
    case 9:  o = 1 - Math.hypot(qx, qy) / 1.4142; break;
    case 10: o = rnd; break;
    case 11: o = (Math.atan2(qy, qx) + Math.PI) / TWO_PI; break;
    default: o = 0;
  }
  return constrain(o, 0, 1);
}
function localProgJS(k, o, st) {
  const l = constrain((k - o * st) / Math.max(1 - st, 0.001), 0, 1);
  return l * l * (3 - 2 * l);
}


// #####################################################################################################
// #####################################   GROUP A · MOTION STATES   ###################################
// #####################################################################################################

// =====================================================================================================
//  3. MOTION · ROTATION
//     slow down -> every particle eases to angle 0 -> hold -> release -> speed up
//     The rotation speed changes (a little, slowly) from time to time, when the frequency changes.
// =====================================================================================================
const ROTATION = {
  times: {                 // seconds (random inside each range, x MOTION_TRACK.timeScale)
    slow:    [4, 8],       // rotation speed goes to 0
    align:   [10, 20],     // every particle eases to angle 0
    hold:    [4, 10],      // everybody stays at angle 0
    release: [10, 20],     // angles go back to their random values
    speedup: [4, 8],       // rotation speed comes back
  },
  speedOptions: [0.05, 0.1, 0.2], // rotation speed (rad/s) -- gentle on purpose
  speedChangeChance: 0.4,  // probability that a frequency change also changes the speed
  speedEase: 10,           // seconds the speed takes to reach the new value (so it goes unnoticed)
};
const rotS = { k: 0, from: 0, to: 0, pat: 12, st: 0 };   // values sent to the shader
let rotRate = 1;           // 0..1 multiplier of the rotation speed (the "slow down" / "speed up" phases)
let rotT = 0;              // accumulated rotation angle (only advances while rotating; includes the speed)
let rotSpeed = 0.1;        // current speed
let rotSpeedTarget = 0.1;

function rotIdle() { rotRate = 1; rotS.from = 0; rotS.to = 0; rotS.k = 0; }

function rotMaybeChangeSpeed() {   // called by the FREQUENCY state every time the frequency changes
  if (random() < ROTATION.speedChangeChance) rotSpeedTarget = random(ROTATION.speedOptions);
}

function rotUpdate(dt) {
  // the speed eases to its target, and the angle accumulates it (so a speed change never makes the angle jump)
  rotSpeed += (rotSpeedTarget - rotSpeed) * (1 - exp(-dt / ROTATION.speedEase));
  rotT += rotRate * rotSpeed * dt;
}

function makeRotationCycle() {
  const T = ROTATION.times;
  return new Cycle([
    { range: T.slow,    apply: k => { rotRate = 1 - ease(k); } },
    { range: T.align,   onStart: () => setPattern(rotS),
      apply: k => { rotRate = 0; rotS.from = 0; rotS.to = 1; rotS.k = k; } },
    { range: T.hold,    apply: k => { rotRate = 0; rotS.from = 1; rotS.to = 1; rotS.k = 1; } },
    { range: T.release, onStart: () => setPattern(rotS),
      apply: k => { rotRate = 0; rotS.from = 1; rotS.to = 0; rotS.k = k; } },
    { range: T.speedup, apply: k => { rotRate = ease(k); rotS.from = 0; rotS.to = 0; rotS.k = 0; } },
  ]);
}

function rotUniforms(sh) {
  sh.setUniform('u_rotT', rotT);
  uState(sh, 'rot', rotS);
}


// =====================================================================================================
//  4. MOTION · VELOCITY
//     the speed of ALL the particles eases to a fixed multiplier (0 = they freeze, > 1 = they rush),
//     holds, and comes back to their own speed.
// =====================================================================================================
const VELOCITY = {
  targets: [0, 4],         // speed multiplier it goes to (random each time). 0 = stop, 4 = four times faster
  times: {
    toTarget: [10, 20],
    hold:     [4, 10],
    back:     [10, 20],
  },
};
const velS = { k: 0, from: 1, to: 1, pat: 12, st: 0 };   // speed multiplier before / after (used in JS)
let velTarget = 1;

function velIdle() { velS.from = 1; velS.to = 1; velS.k = 0; }

function makeVelocityCycle() {
  const T = VELOCITY.times;
  return new Cycle([
    { range: T.toTarget, onStart: () => { velTarget = random(VELOCITY.targets); setPattern(velS); },
      apply: k => { velS.from = 1; velS.to = velTarget; velS.k = k; } },
    { range: T.hold,     apply: k => { velS.from = velTarget; velS.to = velTarget; velS.k = 1; } },
    { range: T.back,     onStart: () => setPattern(velS),
      apply: k => { velS.from = velTarget; velS.to = 1; velS.k = k; } },
  ]);
}

function velUniforms(sh) { /* the velocity is applied in JS (see the particle loop in draw) */ }

// speed multiplier of ONE particle, given its screen position and its random number
function velMultiplier(sx, sy, rnd) {
  if (velS.from === velS.to) return velS.from;
  const o = orderOfJS(velS.pat, sx, sy, rnd);
  return lerp(velS.from, velS.to, localProgJS(velS.k, o, velS.st));
}


// =====================================================================================================
//  5. MOTION · APERTURE
//     own value (by distance to the center) -> eases to a fixed value (0 or max) -> hold -> back
//     While the aperture is held at 0 the "rows" of the pattern change (invisibly; they show when it returns).
// =====================================================================================================
const APERTURE = {
  max: 0.09,               // the "maximum" aperture, also the top of the normal distance-based range
  times: {
    toFixed: [10, 20],
    hold:    [3, 8],
    back:    [10, 20],
  },
  rowOptions: [3, 7, 9, 11, 13, 15],  // possible number of rows of the interference pattern
  // With many rows (cuts) the frequency is kept HIGH, so the thin rows are filled with rings.
  // While rows > `above`, the frequency can't go below  minFreq + (rows - above) * perRow
  // (rows 11 -> 23, 13 -> 26, 15 -> 29). It eases in / out over `ease` seconds, so it isn't a jump.
  highRows: { above: 9, minFreq: 20, perRow: 1.5, ease: 6 },
};
// values sent to the shader. The aperture of a particle goes from A to B:
//   A / B = its own aperture (oa / ob = 1)  or a fixed value (va / vb)
const aptS = { k: 0, pat: 12, st: 0, va: 0, vb: 0, oa: 1, ob: 1 };
let aptTarget = 0;
let rows = 9;
let freqFloor = 0;        // current minimum frequency (eases to the value that the rows ask for)

// helper: set "from" and "to", each one either 'own' or a number
function aptSet(k, from, to) {
  aptS.k = k;
  aptS.oa = from === 'own' ? 1 : 0;  aptS.va = from === 'own' ? 0 : from;
  aptS.ob = to === 'own' ? 1 : 0;    aptS.vb = to === 'own' ? 0 : to;
}

function aptIdle() { aptSet(0, 'own', 'own'); }

// keeps the frequency high while there are many rows
function aptUpdate(dt) {
  const H = APERTURE.highRows;
  const target = rows > H.above ? H.minFreq + (rows - H.above) * H.perRow : 0;
  freqFloor += (target - freqFloor) * (1 - exp(-dt / H.ease));
}

function makeApertureCycle() {
  const T = APERTURE.times;
  return new Cycle([
    { range: T.toFixed, onStart: () => { aptTarget = random() < 0.5 ? 0 : APERTURE.max; setPattern(aptS); },
      apply: k => aptSet(k, 'own', aptTarget) },
    { range: T.hold,
      onStart: () => { if (aptTarget === 0) rows = random(APERTURE.rowOptions.filter(r => r !== rows)); },
      apply: k => aptSet(1, aptTarget, aptTarget) },
    { range: T.back,    onStart: () => setPattern(aptS),
      apply: k => aptSet(k, aptTarget, 'own') },
  ]);
}

function aptUniforms(sh) {
  sh.setUniform('u_aptK', aptS.k);
  sh.setUniform('u_aptPat', aptS.pat);
  sh.setUniform('u_aptSt', aptS.st);
  sh.setUniform('u_aptVA', aptS.va);
  sh.setUniform('u_aptVB', aptS.vb);
  sh.setUniform('u_aptOA', aptS.oa);
  sh.setUniform('u_aptOB', aptS.ob);
  sh.setUniform('u_rows', rows);
  sh.setUniform('u_freqFloor', freqFloor);
}


// =====================================================================================================
//  6. MOTION · APERTURE SWING
//     own value -> +max -> (smoothly through 0) -> -max -> back to the own value.
//     Uses the same aperture values as the state above (they never run at the same time).
// =====================================================================================================
const APERTURE_SWING = {
  times: {
    toMax:    [10, 20],    // own value -> +max
    holdMax:  [2, 5],
    swing:    [12, 24],    // +max -> -max
    holdNeg:  [2, 5],
    back:     [10, 20],    // -max -> own value
  },
};

function makeApertureSwingCycle() {
  const T = APERTURE_SWING.times;
  const M = APERTURE.max;
  return new Cycle([
    { range: T.toMax,   onStart: () => setPattern(aptS),  apply: k => aptSet(k, 'own', M) },
    { range: T.holdMax, apply: k => aptSet(1, M, M) },
    { range: T.swing,   onStart: () => setPattern(aptS),  apply: k => aptSet(k, M, -M) },
    { range: T.holdNeg, apply: k => aptSet(1, -M, -M) },
    { range: T.back,    onStart: () => setPattern(aptS),  apply: k => aptSet(k, -M, 'own') },
  ]);
}


// #####################################################################################################
// ######################################   GROUP B · SKIN STATES   ####################################
// #####################################################################################################

// =====================================================================================================
//  7. SKIN · FREQUENCY
//     normal -> STEP (not smooth) to another value -> hold -> step back to normal
//     (every change can also change the rotation speed, see ROTATION.speedChangeChance)
// =====================================================================================================
const FREQ_BASE = [10, 15, 20, 25][Math.floor(Math.random() * 4)];   // normal frequency: random every time the program runs
const FREQUENCY = {
  base: FREQ_BASE,
  spread: 0,               // > 0 = every particle also gets its own random +/- variation of the frequency
  options: [0, 10, 15, 20, 25].filter(f => f !== FREQ_BASE),   // the step goes to one of these (random each time)
  times: {
    sweepTo:   [4, 10],    // time the "wave" of steps takes to cross all the particles
    hold:      [4, 10],
    sweepBack: [4, 10],
  },
};
const frqS = { k: 0, a: 1, b: 1, pat: 12 };   // a / b = frequency multipliers before / after the step
let frqTarget = FREQ_BASE;

function frqIdle() { frqS.a = 1; frqS.b = 1; frqS.k = 0; }

function makeFrequencyCycle() {
  const T = FREQUENCY.times;
  const ratio = () => frqTarget / FREQUENCY.base;
  return new Cycle([
    { range: T.sweepTo,   onStart: () => { frqTarget = random(FREQUENCY.options); setPattern(frqS); rotMaybeChangeSpeed(); },
      apply: k => { frqS.a = 1; frqS.b = ratio(); frqS.k = k; } },
    { range: T.hold,      apply: k => { frqS.a = ratio(); frqS.b = frqS.a; frqS.k = 1; } },
    { range: T.sweepBack, onStart: () => { setPattern(frqS); rotMaybeChangeSpeed(); },
      apply: k => { frqS.a = ratio(); frqS.b = 1; frqS.k = k; } },
  ]);
}

function frqUniforms(sh) {
  sh.setUniform('u_freqK', frqS.k);
  sh.setUniform('u_freqA', frqS.a);
  sh.setUniform('u_freqB', frqS.b);
  sh.setUniform('u_freqPat', frqS.pat);
}


// =====================================================================================================
//  9. SKIN · RGB SHIFT (chromatic aberration)
//     R, G and B are drawn shifted: the shifts go from 0 to some random values (the same for every
//     particle), hold, and come back to 0.
// =====================================================================================================
const CHROMA = {
  min: 0.05,               // every component of the R, G, B shifts is random inside [min, max]
  max: 0.1,                // (units: particle uv, the quad spans -1..1)
  randomSign: false,       // true = each component also gets a random sign (+/-)
  times: {
    toValues: [10, 20],    // 0 -> the random shifts
    hold:     [3, 8],
    back:     [10, 20],    // shifts -> 0
  },
};
const caS = { k: 0, from: 0, to: 0, pat: 12, st: 0, r: [0, 0], g: [0, 0], b: [0, 0] };

function caIdle() { caS.from = 0; caS.to = 0; caS.k = 0; }

function makeChromaCycle() {
  const T = CHROMA.times;
  const rnd = () => random(CHROMA.min, CHROMA.max) * (CHROMA.randomSign && random() < 0.5 ? -1 : 1);
  return new Cycle([
    { range: T.toValues, onStart: () => {
        caS.r = [rnd(), rnd()]; caS.g = [rnd(), rnd()]; caS.b = [rnd(), rnd()];
        setPattern(caS);
      },
      apply: k => { caS.from = 0; caS.to = 1; caS.k = k; } },
    { range: T.hold,     apply: k => { caS.from = 1; caS.to = 1; caS.k = 1; } },
    { range: T.back,     onStart: () => setPattern(caS),
      apply: k => { caS.from = 1; caS.to = 0; caS.k = k; } },
  ]);
}

function caUniforms(sh) {
  uState(sh, 'ca', caS);
  sh.setUniform('u_caR', caS.r);
  sh.setUniform('u_caG', caS.g);
  sh.setUniform('u_caB', caS.b);
}


// =====================================================================================================
//  8. SKIN · SUM
//     the second layer of rings (final2) fades in and is ADDED to the colour (final + final2),
//     holds, and fades out.
// =====================================================================================================
const SUM = {
  times: {
    toValues: [10, 20],
    hold:     [3, 8],
    back:     [10, 20],
  },
};
const sumS = { k: 0, from: 0, to: 0, pat: 12, st: 0 };

function sumIdle() { sumS.from = 0; sumS.to = 0; sumS.k = 0; }

function makeSumCycle() {
  const T = SUM.times;
  return new Cycle([
    { range: T.toValues, onStart: () => setPattern(sumS),
      apply: k => { sumS.from = 0; sumS.to = 1; sumS.k = k; } },
    { range: T.hold,     apply: k => { sumS.from = 1; sumS.to = 1; sumS.k = 1; } },
    { range: T.back,     onStart: () => setPattern(sumS),
      apply: k => { sumS.from = 1; sumS.to = 0; sumS.k = k; } },
  ]);
}

function sumUniforms(sh) { uState(sh, 'sum', sumS); }


// =====================================================================================================
// 10. TRACKS REGISTRY  (add / remove / reorder states here)
// =====================================================================================================
const MOTION_STATES = [
  { name: 'rotation',      make: makeRotationCycle,      idle: rotIdle, uniforms: rotUniforms },
  { name: 'velocity',      make: makeVelocityCycle,      idle: velIdle, uniforms: velUniforms },
  { name: 'aperture',      make: makeApertureCycle,      idle: aptIdle, uniforms: aptUniforms },
  { name: 'apertureSwing', make: makeApertureSwingCycle, idle: aptIdle, uniforms: aptUniforms },
];
const SKIN_STATES = [
  { name: 'frequency', make: makeFrequencyCycle, idle: frqIdle, uniforms: frqUniforms },
  { name: 'sum',       make: makeSumCycle,       idle: sumIdle, uniforms: sumUniforms,    start: 1 },   // start: phase to begin in (1 = hold)
  { name: 'chroma',    make: makeChromaCycle,    idle: caIdle,  uniforms: caUniforms,     start: 1 },
];
const motionTrack = new Track('motion', MOTION_TRACK, MOTION_STATES);
const skinsTrack  = new Track('skins',  SKINS_TRACK,  SKIN_STATES);

function rotationIsRunning() {
  return motionTrack.running() === 'rotation';
}


// =====================================================================================================
// 11. VARIANTS (not states: they happen "sometimes", on top of whatever is going on)
// =====================================================================================================

// ---- 11a. RUN: the second value of pulseOsc (the phase) runs a little, so the rings slowly flow ----
const RUN = {
  chance: 0.35,            // probability that a state starts with the rings running
  speed: [0.1, 0.4],       // phase cycles per second (random each time)
  ease: 2,                 // seconds to fade the running in / out
};
let runT = 0;              // accumulated phase (kept in 0..1: the rings repeat every 1)
let runRate = 0;           // current running speed (eases to runTarget)
let runTarget = 0;

function runOnStateStart() { runTarget = random() < RUN.chance ? random(RUN.speed[0], RUN.speed[1]) : 0; }
function runOnStateEnd()   { runTarget = 0; }
function runUpdate(dt) {
  runRate += (runTarget - runRate) * (1 - exp(-dt / RUN.ease));
  runT = (runT + runRate * dt) % 1;
}
function runUniforms(sh) { sh.setUniform('u_runT', runT); }

// ---- 11b. ZONE: suddenly a random segment of the screen wakes up: the particles inside it start to
//          move faster, rotate, or both. It fades in, stays a while and fades out. ----
const ZONE = {
  wait: [20, 50],          // seconds between two events
  duration: [10, 20],      // seconds an event lasts
  fade: 0.3,               // fraction of the duration used to fade in and to fade out
  halfW: [0.25, 0.6],      // half width / half height of the segment (screen units, the screen is -1..1)
  halfH: [0.25, 0.6],
  soft: 0.15,              // softness of the edges
  types: ['move', 'rotate', 'both'],  // what wakes up (random each time)
  moveBoost: 6,            // inside the zone the speed is multiplied by (1 + moveBoost)
  rotSpeed: 1.0,           // extra rotation (rad/s) inside the zone; every particle picks its own direction
};
const zone = { active: false, wait: 15, t: 0, dur: 1, cx: 0, cy: 0, hw: 0.4, hh: 0.4, type: 'move', env: 0 };

function zoneUpdate(dt) {
  if (!zone.active) {
    zone.env = 0;
    zone.wait -= dt;
    if (zone.wait <= 0) {
      zone.active = true;
      zone.t = 0;
      zone.dur = random(ZONE.duration[0], ZONE.duration[1]);
      zone.hw = random(ZONE.halfW[0], ZONE.halfW[1]);
      zone.hh = random(ZONE.halfH[0], ZONE.halfH[1]);
      zone.cx = random(-0.8, 0.8);
      zone.cy = random(-0.8, 0.8);
      zone.type = random(ZONE.types);
    }
    return;
  }
  zone.t += dt;
  const f = ZONE.fade * zone.dur;
  zone.env = ease(min(zone.t / f, (zone.dur - zone.t) / f, 1));
  if (zone.t >= zone.dur) {
    zone.active = false;
    zone.env = 0;
    zone.wait = random(ZONE.wait[0], ZONE.wait[1]);
  }
}

function smoothStep(a, b, x) {
  const t = constrain((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// 0..1: how much the zone affects a particle that is at (sx, sy) on the screen
function zoneWeight(sx, sy) {
  if (!zone.active) return 0;
  const wx = 1 - smoothStep(zone.hw - ZONE.soft, zone.hw, abs(sx - zone.cx));
  const wy = 1 - smoothStep(zone.hh - ZONE.soft, zone.hh, abs(sy - zone.cy));
  return zone.env * wx * wy;
}


// =====================================================================================================
// 12. SHADERS
// =====================================================================================================
const VERT = `
    precision mediump float;
    uniform float u_time;
    uniform float u_rotT;
    // rotation state
    uniform float u_rotK;  uniform float u_rotFrom;  uniform float u_rotTo;  uniform float u_rotPat;  uniform float u_rotSt;
    // aperture state: from A to B, each one = the own aperture (O = 1) or a fixed value (V)
    uniform float u_aptK;  uniform float u_aptPat;   uniform float u_aptSt;
    uniform float u_aptVA; uniform float u_aptVB;    uniform float u_aptOA;   uniform float u_aptOB;
    // frequency state (step)
    uniform float u_freqK; uniform float u_freqA;    uniform float u_freqB;   uniform float u_freqPat;
    uniform float u_freqFloor;   // minimum frequency (high while the pattern has many rows)
    // chromatic aberration state
    uniform float u_caK;   uniform float u_caFrom;   uniform float u_caTo;    uniform float u_caPat;   uniform float u_caSt;
    // sum state (final + final2)
    uniform float u_sumK;  uniform float u_sumFrom;  uniform float u_sumTo;   uniform float u_sumPat;  uniform float u_sumSt;
    uniform vec2  u_resolution;

    attribute vec2 aPos;
    attribute vec2 aOff;
    attribute float aSize;
    attribute float aID;
    attribute vec2 aUV;
    attribute vec2 aVel;
    attribute float aRotSpeed;
    attribute float aRotExtra;    // extra rotation of this particle (the ZONE variant), accumulated in JS
    attribute float aTimeOffset;
    attribute float aFreq;
    attribute float aAperture;
    attribute float aRand;

    varying float vID;
    varying vec2  vUV;
    varying float vTimeOffset;
    varying float vFreq;
    varying vec2 vPos;
    varying float rot;
    varying float vAperture;
    varying float vCA;
    varying float vSum;

    // order (0..1) in which a particle changes, depending on the chosen pattern.
    // q = particle position on screen (-1..1)
    float orderOf(float pat, vec2 q, float rnd) {
      float o = 0.0;
      if (pat < 0.5)       o = (q.x + 1.0) * 0.5;                  // left > right
      else if (pat < 1.5)  o = 1.0 - (q.x + 1.0) * 0.5;            // right > left
      else if (pat < 2.5)  o = (1.0 - q.y) * 0.5;                  // top > bottom
      else if (pat < 3.5)  o = (q.y + 1.0) * 0.5;                  // bottom > top
      else if (pat < 4.5)  o = (q.x - q.y + 2.0) * 0.25;           // top-left > bottom-right
      else if (pat < 5.5)  o = 1.0 - (q.x - q.y + 2.0) * 0.25;     // bottom-right > top-left
      else if (pat < 6.5)  o = (q.x + q.y + 2.0) * 0.25;           // bottom-left > top-right
      else if (pat < 7.5)  o = 1.0 - (q.x + q.y + 2.0) * 0.25;     // top-right > bottom-left
      else if (pat < 8.5)  o = length(q) / 1.4142;                 // center > edges
      else if (pat < 9.5)  o = 1.0 - length(q) / 1.4142;           // edges > center
      else if (pat < 10.5) o = rnd;                                // random
      else if (pat < 11.5) o = (atan(q.y, q.x) + 3.14159265) / 6.2831853; // clockwise-ish sweep
      else                 o = 0.0;                                // all at once
      return clamp(o, 0.0, 1.0);
    }

    // smooth progress of ONE particle: it starts at k = o*st and lasts (1 - st) of the transition
    float localProg(float k, float o, float st) {
      float l = clamp((k - o * st) / max(1.0 - st, 0.001), 0.0, 1.0);
      return l * l * (3.0 - 2.0 * l);
    }

    void main() {
      // chromatic aberration amount (0..1) of this particle
      float oC = orderOf(u_caPat, aOff, fract(aRand + 0.53));
      vCA = mix(u_caFrom, u_caTo, localProg(u_caK, oC, u_caSt));
      // sum amount (0..1) of this particle: how much of final2 is added
      float oS = orderOf(u_sumPat, aOff, fract(aRand + 0.19));
      vSum = mix(u_sumFrom, u_sumTo, localProg(u_sumK, oS, u_sumSt));
      vID = aID;
      vUV = aUV;
      // frequency: STEP. each particle switches from A to B when the wave (k) reaches it
      float oF = orderOf(u_freqPat, aOff, fract(aRand + 0.71));
      vFreq = max(aFreq * (u_freqK >= oF ? u_freqB : u_freqA), u_freqFloor);
      vPos = aPos;
      // aperture: own value -> fixed value, particle by particle
      float oA = orderOf(u_aptPat, aOff, fract(aRand + 0.37));
      float pA = localProg(u_aptK, oA, u_aptSt);
      float apFrom = mix(u_aptVA, aAperture, u_aptOA);
      float apTo   = mix(u_aptVB, aAperture, u_aptOB);
      vAperture = mix(apFrom, apTo, pA);

      vTimeOffset = aTimeOffset;

      vec2 offset = aOff + 0. * 0.;

      // free rotation angle of this particle
      float raw = aRotSpeed + vTimeOffset + u_rotT + aRotExtra;
      // nearest full turn = "angle 0" for this particle (shortest way home)
      float home = 6.2831853 * floor(raw / 6.2831853 + 0.5);
      float oR = orderOf(u_rotPat, aOff, aRand);
      float mR = mix(u_rotFrom, u_rotTo, localProg(u_rotK, oR, u_rotSt));
      float angle = mix(raw, home, mR);
      rot = angle;
      float c = cos(angle), s = sin(angle);
      vec2 rPos = vec2(
        aPos.x * c - aPos.y * s,
        aPos.x * s + aPos.y * c
      );

      vec2 scaled = rPos * aSize;
      vec2 p = scaled + offset;

      float aspect = u_resolution.y / u_resolution.x;
      vec2 p_corr = vec2(p.x * aspect, p.y);

      gl_Position = vec4(p_corr, 0.0, 1.0);
    }
  `;

const FRAG = `
    precision mediump float;

    varying float vID;
    varying vec2  vUV;
    varying float vTimeOffset;
    varying float vFreq;
    varying vec2 vPos;
    varying float rot;
    varying float vAperture;
    varying float vCA;
    varying float vSum;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_rows; // number of "rows" of the interference pattern (it was 9)
    uniform float u_runT; // "run" variant: extra phase added to the second value of pulseOsc (0..1)
    uniform vec2 u_caR;   // uv shift of each colour channel at full aberration
    uniform vec2 u_caG;
    uniform vec2 u_caB;

    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
        dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    vec3 pulseOsc(float _freq, float speed, float coord) {
      float ramp = fract(coord * _freq + speed);

      float mmm = mix(vUV.y,0.1,1.4);
      float mmm2 = mix(vAperture,0.1,6.);
      // mmm+=mmm2;
      float pulse = 1.0 - smoothstep(0.4, 0.45, ramp);
      return vec3(pulse);
    }

    float interference(vec2 uv, float c, float aperture) {
      return distance(
        vec2( aperture * floor(uv.y* c + 0.5), 0.0),
        uv
      );
    }

    vec3 threshold(vec3 color, float thresh) {
      float brightness = dot(color, vec3(0.5, 0.587, 0.5));
      return brightness > thresh ? vec3(1.0) : vec3(0.0);
    }

    vec4 Render(vec2 newLoc) {
      vec2 uv = vUV + newLoc;

      float d = interference(uv, u_rows, vAperture);

      // chromatic aberration: one distance per colour channel, each with its own uv shift
      // (shift = channel offset * vCA). With vCA = 0 the three channels are identical.
      vec3 dRGB = vec3(d);
      if (vCA > 0.001) {
        dRGB = vec3(
          interference(uv + u_caR * vCA, u_rows, vAperture),
          interference(uv + u_caG * vCA, u_rows, vAperture),
          interference(uv + u_caB * vCA, u_rows, vAperture)
        );
      }
      // (u_runT is the "run" variant: it moves the second value of pulseOsc, so the rings flow)
      vec3 final = vec3(
        pulseOsc(vFreq, vAperture*5. + u_runT, dRGB.r).x,
        pulseOsc(vFreq, vAperture*5. + u_runT, dRGB.g).x,
        pulseOsc(vFreq, vAperture*5. + u_runT, dRGB.b).x
      );

      // second layer of rings (final2): only computed while the "sum" state is on
      vec3 final2 = vec3(0.0);
      if (vSum > 0.001) {
        float d2 = interference(uv+vec2(sin(vTimeOffset*2.)*0.05,0.01), u_rows, vAperture);
        final2 = pulseOsc(vFreq, 0.26 + u_runT, d2);
      }

      if (min(dRGB.r, min(dRGB.g, dRGB.b)) > 0.5) discard;   // outside in every channel

      float noiseVal = snoise(vec2(uv.x/20.,uv.y/20.) * 2.0+vTimeOffset)+
      (sin(uv.y*1.));

      float noiseVal2 = snoise(vec2(uv.x,uv.y) * 3.+vTimeOffset)*
      (sin(d*2.+rot-0.5));

      float noiseVal3 = snoise(vec2(uv.x,uv.y) * 2.+vTimeOffset)*
      (sin(uv.y*+500.-0.5)*0.2);

      float threshNoise = (noiseVal*noiseVal3) > abs(sin(d*mix(2.,100.,sin(d*1.+vTimeOffset))+vTimeOffset*2.)) ? 1.0 : 0.0;
      float threshNoise2 = sin(noiseVal2*2.) > abs(sin(d*2.+vTimeOffset)) ? 1.0 : 0.0;

      // final2 is added in the amount of the "sum" state (vSum 0..1)
      final = vec3(final + final2 * vSum + threshNoise);

      // a channel that is outside the shape shows the white background
      vec3 inside = step(dRGB, vec3(0.5));
      final = mix(vec3(1.0), final, inside);

      return vec4((final),1.0);
    }

    void main() {
      vec4 nF = vec4(0.0);
      float offset = 0.27993 / u_resolution.y;

      nF += Render(vec2( offset,  0.0));
      nF += Render(vec2(-offset,  0.0));
      nF += Render(vec2( 0.0,     offset));
      nF += Render(vec2( 0.0,    -offset));
      nF += Render(vec2( offset,  offset));
      nF += Render(vec2(-offset,  offset));
      nF += Render(vec2( offset, -offset));
      nF += Render(vec2(-offset, -offset));

      nF /= 8.0;

      gl_FragColor = vec4(nF.rgb, 1.0);
    }
  `;

const POST_VERT = `
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying vec2 vTexCoord;
    void main() {
      vTexCoord = aTexCoord;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
    }
  `;

const POST_FRAG = `
    precision mediump float;
    #define NUM_RECTS ${NUM_RECTS}

    varying vec2 vTexCoord;
    uniform sampler2D tex0;
    uniform vec2 u_resolution;
    uniform float u_pixelSize;
    uniform vec4 u_rects[NUM_RECTS];   // xy = center (uv), zw = half size (uv)

    void main() {
      vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
      vec3 col = texture2D(tex0, uv).rgb;

      for (int i = 0; i < NUM_RECTS; i++) {
        vec4 r = u_rects[i];
        vec2 d = abs(uv - r.xy);

        if (d.x < r.z && d.y < r.w) {
          // square pixelation
          float tiles = u_resolution.x / u_pixelSize;
          vec2 pUV = (floor(uv * tiles) + 0.5) / tiles;
          col = step(0.5, texture2D(tex0, pUV).rgb);   // 1-bit per colour channel

          // thin border so the rectangle is visible over empty areas
          vec2 e = (r.zw - d) * u_resolution;
          if (min(e.x, e.y) < 1.5) col = vec3(0.0);
          break;
        }
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;


// =====================================================================================================
// 13. SETUP
// =====================================================================================================
let posArray = [];
let velArray = [];
let driftPhase = [];       // per particle: phase / rate of the slow speed swing (DRIFT_BREATH)
let driftRate = [];

let basePosData = [];
let uvData = [];
let sizeData = [];
let idData = [];
let freqData = [];
let velData = [];
let rotSpeedData = [];
let rotExtraData = [];
let timeOffsetData = [];
let baseApertureData = [];
let randData = [];

let offBuffer;
let drawOrder;
let buffers = {};

function setup() {
  createCanvas(DIM, DIM, WEBGL);
  pixelDensity(2);
  noStroke();

  // offscreen buffer for pass 1 (particles)
  pass1 = createGraphics(DIM, DIM, WEBGL);
  pass1.pixelDensity(2);
  pass1.noStroke();

  shaderProgram = pass1.createShader(VERT, FRAG);
  postShader = createShader(POST_VERT, POST_FRAG);

  // force compilation on the offscreen context so we can query attribute locations
  pass1.shader(shaderProgram);
  pass1.rect(0, 0, 0, 0);
  pass1.clear();

  const gl = pass1._renderer.GL;
  const prog = shaderProgram._glProgram;
  gl.useProgram(prog);

  const posLoc = gl.getAttribLocation(prog, 'aPos');
  const offLoc = gl.getAttribLocation(prog, 'aOff');
  const sizeLoc = gl.getAttribLocation(prog, 'aSize');
  const idLoc = gl.getAttribLocation(prog, 'aID');
  const uvLoc = gl.getAttribLocation(prog, 'aUV');
  const velLoc = gl.getAttribLocation(prog, 'aVel');
  const rotSpeedLoc = gl.getAttribLocation(prog, 'aRotSpeed');
  const rotExtraLoc = gl.getAttribLocation(prog, 'aRotExtra');
  const timeOffsetLoc = gl.getAttribLocation(prog, 'aTimeOffset');
  const freqLoc = gl.getAttribLocation(prog, 'aFreq');
  const apertureLoc = gl.getAttribLocation(prog, 'aAperture');
  const randLoc = gl.getAttribLocation(prog, 'aRand');

  const basePos = [
    -0.5, -0.5,  0.5, -0.5,  0.5, 0.5,
    -0.5, -0.5,  0.5,  0.5, -0.5, 0.5
  ];

  const baseUV = [
    -1, -1,  1, -1,  1, 1,
    -1, -1,  1, 1,  -1, 1
  ];

  vertCount = numParticles * 6;

  for(let i=0; i<numParticles; i++) {
    // random position in the world, random direction, random own speed
    let px = random(-HALF, HALF);
    let py = random(-HALF, HALF);
    posArray.push([px, py]);

    let angle = random(TWO_PI);
    let speed = random(DRIFT_MIN, DRIFT_MAX);
    velArray.push([cos(angle) * speed, sin(angle) * speed]);
    driftPhase.push(random(TWO_PI));
    driftRate.push(random(DRIFT_BREATH_RATE[0], DRIFT_BREATH_RATE[1]));

    let s = random(0.5,0.5);
    let rs = random(PI);
    let to = random(0.,1.0);
    let freq = FREQUENCY.base + random(-FREQUENCY.spread, FREQUENCY.spread);
    let apt = 0.;
    let rnd = random();

    for(let v=0; v<6; v++) {
      basePosData.push(basePos[v*2], basePos[v*2+1]);
      uvData.push(baseUV[v*2], baseUV[v*2+1]);
      sizeData.push(s);
      idData.push(i);
      freqData.push(freq);
      velData.push(velArray[i][0], velArray[i][1]);
      rotSpeedData.push(rs);
      rotExtraData.push(0);
      timeOffsetData.push(to);
      baseApertureData.push(apt);
      randData.push(rnd);
    }
  }

  function makeBuffer(data, loc, size, usage=gl.STATIC_DRAW){
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), usage);
    if (loc !== -1) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    return buf;
  }

  buffers = {
    posBuffer: makeBuffer(basePosData, posLoc, 2),
    uvBuffer: makeBuffer(uvData, uvLoc, 2),
    sizeBuffer: makeBuffer(sizeData, sizeLoc, 1, gl.DYNAMIC_DRAW),
    idBuffer: makeBuffer(idData, idLoc, 1),
    velBuffer: makeBuffer(velData, velLoc, 2, gl.DYNAMIC_DRAW),
    rotSpeedBuffer: makeBuffer(rotSpeedData, rotSpeedLoc, 1),
    rotExtraBuffer: makeBuffer(rotExtraData, rotExtraLoc, 1, gl.DYNAMIC_DRAW),
    timeOffsetBuffer: makeBuffer(timeOffsetData, timeOffsetLoc, 1),
    freqBuffer: makeBuffer(freqData, freqLoc, 1),
    apertureBuffer: makeBuffer(baseApertureData, apertureLoc, 1, gl.DYNAMIC_DRAW),
    randBuffer: makeBuffer(randData, randLoc, 1),
  };

  offBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, offBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, numParticles * 6 * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(offLoc);
  gl.vertexAttribPointer(offLoc, 2, gl.FLOAT, false, 0, 0);
  buffers.offBuffer = offBuffer;

  drawOrder = [...Array(numParticles).keys()];

  // states: build every cycle of both tracks, and start resting
  motionTrack.init();
  skinsTrack.init();
  zone.wait = random(ZONE.wait[0], ZONE.wait[1]);

  // rectangles: start spread over the screen and to the right
  for (let i = 0; i < NUM_RECTS; i++) {
    let r = { x: 0, y: 0, hw: 0, hh: 0 };
    spawnRect(r, true);
    rects.push(r);
  }
}

// place a rectangle in world space.
// initial = true  -> anywhere in the visible area / just right of it
// initial = false -> fully off-screen to the right, so it slides in with the camera
function spawnRect(r, initial) {
  r.hw = random(0.15, 0.4);
  r.hh = random(0.15, 0.4);
  r.y  = camPos[1] + random(-0.9, 0.9);
  r.x  = camPos[0] + (initial ? random(-1, 2.2) : 1.05 + r.hw + random(0, 1.0));
}


// =====================================================================================================
// 14. UPDATE  (dt in seconds)
// =====================================================================================================
let frameDt = 0.016;

function updateStates(dt) {
  motionTrack.update(dt);      // rotation / velocity / aperture / aperture swing
  skinsTrack.update(dt);       // frequency / sum / rgb shift   (independent from the motion track)
  rotUpdate(dt);
  aptUpdate(dt);
}

function updateVariants(dt) {
  runUpdate(dt);
  zoneUpdate(dt);
}


// =====================================================================================================
// 15. DRAW
// =====================================================================================================
function draw() {
  // ==========================================
  // PASS 1: particles -> offscreen buffer
  // ==========================================
  pass1.background(255);

  pass1.shader(shaderProgram);
  shaderProgram.setUniform('u_time', millis() * 0.001);
  shaderProgram.setUniform('u_resolution', [DIM, DIM]);

  frameDt = min(deltaTime / 1000, 0.1);
  updateStates(frameDt);
  updateVariants(frameDt);
  [...MOTION_STATES, ...SKIN_STATES].forEach(st => st.uniforms(shaderProgram));
  runUniforms(shaderProgram);

  const gl = pass1._renderer.GL;
  gl.useProgram(shaderProgram._glProgram);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  // --- camera ---
  camPos[0] += camVel[0];
  camPos[1] += camVel[1];

  const tSec = millis() * 0.001;
  const zoneMoves = zone.active && zone.type !== 'rotate';
  const zoneRotates = zone.active && zone.type !== 'move' && !rotationIsRunning();

  let respawnIndices = [];

  for (let i = 0; i < numParticles; i++) {
    let pos = posArray[i];
    let vel = velArray[i];

    // slowly change direction randomly
    let turn = random(-WANDER, WANDER);
    let cs = cos(turn), sn = sin(turn);
    let vx = vel[0] * cs - vel[1] * sn;
    let vy = vel[0] * sn + vel[1] * cs;
    vel[0] = vx;
    vel[1] = vy;

    // screen position before moving
    const sx0 = pos[0] - camPos[0];
    const sy0 = pos[1] - camPos[1];

    // zone variant: how much this particle is "awake" (0 outside the zone, 1 in its center)
    const zw = (zoneMoves || zoneRotates) ? zoneWeight(sx0, sy0) : 0;

    // speed: its own, slowly swinging, changed by the VELOCITY state, and boosted inside the zone
    let speedMul = 1 + DRIFT_BREATH * sin(tSec * driftRate[i] + driftPhase[i]);
    speedMul *= velMultiplier(sx0, sy0, (randData[i * 6] + 0.63) % 1);
    if (zoneMoves) speedMul *= 1 + zw * ZONE.moveBoost;

    // particle moves in world space
    pos[0] += vel[0] * speedMul;
    pos[1] += vel[1] * speedMul;

    // zone variant: extra rotation (accumulated per particle, so it never jumps), random direction each
    if (zoneRotates && zw > 0) {
      const dir = randData[i * 6] < 0.5 ? -1 : 1;
      const add = dir * zw * ZONE.rotSpeed * frameDt;
      for (let v = 0; v < 6; v++) rotExtraData[i * 6 + v] += add;
    }

    // screen-space position = world - camera
    let sx = pos[0] - camPos[0];
    let sy = pos[1] - camPos[1];

    // wrap around: a particle leaving on the left re-enters on the right (off-screen),
    // at the same height, exactly as if it had been there all along
    if (sx < -HALF) pos[0] += WRAP;
    else if (sx > HALF) pos[0] -= WRAP;
    if (sy < -HALF) pos[1] += WRAP;
    else if (sy > HALF) pos[1] -= WRAP;

    if (pos[0] - camPos[0] !== sx || pos[1] - camPos[1] !== sy) {
      respawnIndices.push(i);
      sx = pos[0] - camPos[0];
      sy = pos[1] - camPos[1];
    }

    // aperture based on distance from screen center
    let apt = map(dist(sx, sy, 0, 0), 0, 1, 0, APERTURE.max);
    for (let v = 0; v < 6; v++) baseApertureData[i * 6 + v] = apt;
  }

  // newly (re)spawned particles go to the back of the draw order
  if (respawnIndices.length > 0) {
    let respawnSet = new Set(respawnIndices);
    drawOrder = drawOrder.filter(i => !respawnSet.has(i));
    drawOrder = [...respawnIndices, ...drawOrder];
  }

  // --- culling: only keep particles whose quad can be on screen ---
  let orderedIndices = [];
  for (let idx of drawOrder) {
    let sx = posArray[idx][0] - camPos[0];
    let sy = posArray[idx][1] - camPos[1];
    if (abs(sx) < CULL_LIM && abs(sy) < CULL_LIM) orderedIndices.push(idx);
  }
  const visibleCount = orderedIndices.length;

  // offsets are sent in screen space
  let flatOffsets = [];
  for (let idx of orderedIndices) {
    let sx = posArray[idx][0] - camPos[0];
    let sy = posArray[idx][1] - camPos[1];
    for (let v = 0; v < 6; v++) flatOffsets.push(sx, sy);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, offBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(flatOffsets));

  function reorderAttributeArray(attrArray, components = 1) {
    let out = [];
    for (let idx of orderedIndices) {
      let start = idx * 6 * components;
      for (let i = 0; i < 6 * components; i++) out.push(attrArray[start + i]);
    }
    return out;
  }

  const upload = (buf, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
  };

  upload(buffers.posBuffer,        reorderAttributeArray(basePosData, 2));
  upload(buffers.uvBuffer,         reorderAttributeArray(uvData, 2));
  upload(buffers.sizeBuffer,       reorderAttributeArray(sizeData, 1));
  upload(buffers.velBuffer,        reorderAttributeArray(velData, 2));
  upload(buffers.rotSpeedBuffer,   reorderAttributeArray(rotSpeedData, 1));
  upload(buffers.rotExtraBuffer,   reorderAttributeArray(rotExtraData, 1));
  upload(buffers.timeOffsetBuffer, reorderAttributeArray(timeOffsetData, 1));
  upload(buffers.freqBuffer,       reorderAttributeArray(freqData, 1));
  upload(buffers.idBuffer,         reorderAttributeArray(idData, 1));
  upload(buffers.apertureBuffer,   reorderAttributeArray(baseApertureData, 1));
  upload(buffers.randBuffer,       reorderAttributeArray(randData, 1));

  // draw only the visible particles
  if (visibleCount > 0) gl.drawArrays(gl.TRIANGLES, 0, visibleCount * 6);

  // ==========================================
  // rectangles: move with the camera, recycle on the right
  // ==========================================
  let rectData = [];
  for (let r of rects) {
    let sx = r.x - camPos[0];
    let sy = r.y - camPos[1];
    if (sx + r.hw < -1.05 || abs(sy) - r.hh > 1.05) {
      spawnRect(r, false);
      sx = r.x - camPos[0];
      sy = r.y - camPos[1];
    }
    // clip space (-1..1) -> uv space (0..1)
    rectData.push((sx + 1) / 2, (sy + 1) / 2, r.hw / 2, r.hh / 2);
  }

  // ==========================================
  // PASS 2: offscreen buffer -> canvas, pixelating inside the rectangles
  // ==========================================
  background(0);
  shader(postShader);
  postShader.setUniform('tex0', pass1);
  postShader.setUniform('u_resolution', [width, height]);
  postShader.setUniform('u_pixelSize', PIXEL_SIZE);
  postShader.setUniform('u_rects', rectData);
  rect(-width / 2, -height / 2, width, height);
}

function keyPressed(){
  if(key=='s'){
    save();
  }
}

// =====================================================================================================
//  INTERFERENCES · SHADER SKETCH
//
//  Every particle is an INTERFERENCE. An interference has three groups of properties:
//
//      SHAPE       what it is drawn as            cuts (rows) · aperture
//      SKINS       how it is painted              frequency · rgb shift · sum (the double) · run
//      TRANSFORM   where it is and how it moves   position (drift, velocity, camera) · rotation
//
//  The properties change over time through STATES (a state moves one property away from its normal value,
//  holds it, and comes back) and through a few VARIANTS. Everything about one property -- its parameters,
//  its live values and the states that act on it -- is together in the same block.
//
//  The console prints ALL the parameters of the current state: press P, and every time a state starts
//  or ends (see section 9, CONSOLE REPORT, to change it).
//
//   INDEX
//    0.  GENERAL
//    M.  STATE MACHINERY      patterns · Cycle · Track  (shared tools, and the two timelines)
//
//    1.  SHAPE
//         1.1  CUTS             rows of the pattern, and the frequency they ask for
//         1.2  APERTURE         max aperture, its cap by cuts · states: aperture, aperture swing
//    2.  SKINS
//         2.1  FREQUENCY        state: frequency
//         2.2  RGB SHIFT        state: chroma
//         2.3  SUM              state: sum  (final + final2, "the double")
//         2.4  RUN              variant: the rings flow
//    3.  TRANSFORM
//         3.1  POSITION         camera, drift  · state: velocity
//         3.2  ROTATION         state: rotation
//         3.3  ZONE             variant: a screen segment wakes up (moves / rotates)
//
//    4.  TRACKS REGISTRY    which states run in which timeline
//    5.  SHADERS
//    6.  SETUP
//    7.  UPDATE
//    8.  DRAW
//    9.  CONSOLE REPORT
// =====================================================================================================


// =====================================================================================================
//  0. GENERAL
// =====================================================================================================
let shaderProgram;
let postShader;            // pass 2: pixelation rectangles
let pass1;                 // offscreen buffer where the interferences are drawn
let vertCount;
let DIM = Math.max(window.innerWidth, window.innerHeight);

const numInterferences = 1000; // fewer = sparser field

// pixelation rectangles (live in world space, like the interferences)
const NUM_RECTS = 1;
const PIXEL_SIZE = 8;      // size of the "big pixels" inside the rectangles (screen px)
let rects = [];


// =====================================================================================================
//  M. STATE MACHINERY
//     The states run in two independent TRACKS (timelines):
//        MOTION track   the states of the SHAPE and TRANSFORM groups: aperture, aperture swing, rotation, velocity
//        SKINS  track   the states of the SKINS group: frequency, sum, rgb shift
//     Each track picks a random state, the state does its whole trip (go -> hold -> come back), the track
//     rests for a while, and picks the next one. The two tracks do NOT wait for each other, and each one has
//     its own durations, so the changes overlap in different ways every time.
// =====================================================================================================
const MOTION_TRACK = {
  timeScale: 1.,          // multiplies every duration of the motion states. Higher = slower changes
  rest: [12, 30],          // seconds of rest between two motion states (x timeScale)
  maxRepeat: 1,            // the same state never runs more than this many times in a row
  startWith: {},           // chance (0..1) of STARTING the program already inside a state, e.g. { aperture: 0.2 }
};
const SKINS_TRACK = {
  timeScale: 1.5,
  rest: [9, 24],           // different from the motion rests, so the two tracks drift apart
  maxRepeat: 1,
  // When the program starts, with these chances it is ALREADY in that state (fully on, in its "hold"
  // phase) and then it eases back to normal. The rest of the chances (here 40%) start in the normal look.
  startWith: { sum: 0.3, chroma: 0.3 },
  onStateStart: () => runOnStateStart(),   // the "run" variant can start with a skin state
  onStateEnd:   () => runOnStateEnd(),
};

// Every transition picks a random PATTERN: the ORDER in which the interferences change
//   0 left>right   1 right>left   2 top>bottom   3 bottom>top
//   4 TL>BR   5 BR>TL   6 BL>TR   7 TR>BL (diagonals)
//   8 center>edges   9 edges>center   10 random   11 clockwise sweep   12 all at once
const PATTERN_COUNT = 13;
const PATTERN_NAMES = ['left>right', 'right>left', 'top>bottom', 'bottom>top', 'TL>BR', 'BR>TL', 'BL>TR', 'TR>BL',
                       'center>edges', 'edges>center', 'random', 'clockwise', 'all at once'];
const STAGGER_MIN = 0.4;   // how much of a smooth transition is used to delay the interferences (0 = no delay)
const STAGGER_MAX = 0.8;

function ease(t) {
  t = constrain(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// A list of phases that runs once. Each phase lasts a random time inside its [min, max] range
// (x the timeScale of its track, / the speed of this run). apply(k) gets the (linear) progress k 0..1.
class Cycle {
  constructor(phases) {
    this.phases = phases;
    this.scale = 1;        // set by the track (its timeScale)
    this.speed = 1;        // a state can change it at its start (> 1 = faster transitions)
    this.i = 0; this.t = 0; this.dur = 1;
  }
  get phaseName() { return this.phases[this.i].name || ('phase ' + this.i); }
  get progress() { return min(this.t / this.dur, 1); }
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
    if (ph.onStart) ph.onStart();      // (before the duration: onStart may change this.speed)
    this.dur = random(ph.range[0], ph.range[1]) * this.scale / this.speed;
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
// every state is { name, group, make: () => Cycle, idle: () => void, uniforms: (shader) => void,
//                  report: () => object, weight?, start? }
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
    // states can have a `weight` (default 1): the higher, the more often it is picked
    const weights = options.map(i => this.states[i].weight || 1);
    let r = random(weights.reduce((a, b) => a + b, 0));
    for (let j = 0; j < options.length; j++) {
      r -= weights[j];
      if (r <= 0) return options[j];
    }
    return options[options.length - 1];
  }
  // what this track is doing (used by the console report)
  status() {
    const st = this.current >= 0 ? this.states[this.current] : null;
    const out = {
      state: st ? st.name + ' (' + st.group + ')' : 'resting',
      phase: st ? st.cycle.phaseName : '-',
      phase_progress: st ? r3(st.cycle.progress) : 0,
      rest_left_s: st ? 0 : r3(Math.max(this.rest, 0)),
      last_states: this.hist.map(i => this.states[i].name).join(' > ') || '-',
    };
    if (st && st.report) out.state_params = st.report();
    return out;
  }
  update(dt) {
    this.states.forEach(st => st.idle());     // everything at its normal value...
    if (this.current < 0) {
      this.rest -= dt;
      if (this.rest <= 0) {
        this.current = this.pick();
        this.states[this.current].cycle.start();
        if (this.cfg.onStateStart) this.cfg.onStateStart();
        if (LOG.onChange) logState(this.name + ' track: "' + this.states[this.current].name + '" STARTS');
      }
    } else {
      // ...except the state that is running now, which overrides its own values
      const finished = this.states[this.current].cycle.update(dt);
      if (finished) {
        const name = this.states[this.current].name;
        this.hist.push(this.current);
        if (this.hist.length > this.cfg.maxRepeat) this.hist.shift();
        this.current = -1;
        this.rest = random(this.cfg.rest[0], this.cfg.rest[1]) * this.cfg.timeScale;
        if (this.cfg.onStateEnd) this.cfg.onStateEnd();
        this.states.forEach(st => st.idle());
        if (LOG.onChange) logState(this.name + ' track: "' + name + '" ENDS');
      }
    }
  }
}

// random order pattern (and stagger) for the next transition of a state
function setPattern(st) {
  st.pat = floor(random(PATTERN_COUNT));
  if ('st' in st) st.st = st.pat === 12 ? 0 : random(STAGGER_MIN, STAGGER_MAX);
}

// pattern and stagger of a state, for the console report
function patInfo(s) {
  return { pattern: PATTERN_NAMES[s.pat], stagger: r3('st' in s ? s.st : 0) };
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
// ##########################################   1 · SHAPE   ############################################
// #####################################################################################################
//  What the interference is drawn as:  CUTS (how many rows it is cut in)  and  APERTURE (how much each
//  row is shifted).  A row j is shifted by  aperture * j.


// =====================================================================================================
//  1.1  SHAPE · CUTS
//       The number of cuts (rows) of the interference pattern. It changes only while the aperture is held
//       at 0 (the aperture state does it, see 1.2): there the cuts can't be seen, so the change is invisible
//       and shows up when the aperture comes back.
// =====================================================================================================
const CUTS = {
  options: [3, 7, 9, 11, 13, 15, 17],  // possible numbers of cuts
  start: 11,                            // number of cuts when the program starts

  // With many cuts the FREQUENCY is kept HIGH, so the thin rows are filled with rings.
  // While cuts > `above`, the frequency can't go below  minFreq + (cuts - above) * perRow
  // (11 cuts -> 23, 13 -> 26, 15 -> 29). It eases in / out over `ease` seconds, so it isn't a jump.
  highFreq: { above: 9, minFreq: 20, perRow: 1.5, ease: 6 },
};
let rows = CUTS.start;     // current number of cuts
let freqFloor = 0;         // current minimum frequency (eases to the value that the cuts ask for)

function cutsUpdate(dt) {
  const H = CUTS.highFreq;
  const floorTarget = rows > H.above ? H.minFreq + (rows - H.above) * H.perRow : 0;
  freqFloor += (floorTarget - freqFloor) * (1 - exp(-dt / H.ease));
}

function cutsUniforms(sh) {
  sh.setUniform('u_rows', rows);
  sh.setUniform('u_freqFloor', freqFloor);
}


// =====================================================================================================
//  1.2  SHAPE · APERTURE
//
//       THE PROPERTY
//         * Every interference has its OWN aperture: it grows with the distance from the screen center,
//           up to the current MAX aperture.
//         * The MAX aperture is not fixed: from time to time it eases to a new random value.
//         * The max aperture ALLOWED depends on the cuts (many cuts -> small aperture): apertureCap().
//
//       ITS STATES
//         APERTURE        own value -> a fixed value (0, or a random peak) -> hold -> back.
//                         While it is held at 0 the cuts change (and a new max aperture is picked).
//         APERTURE SWING  own value -> +peak -> (smoothly through 0) -> -peak -> back.
//         Every time one of them starts, its transitions get a random speed.
//         When they go to a non-zero value they don't always reach the cap: they go to a random peak.
// =====================================================================================================
const APERTURE = {
  // ---- the property ----
  max: 0.2,                // START value of the max aperture (it changes later; never above the cap of the cuts)
  minMax: 0.04,            // the max aperture never goes below this
  maxChangeEvery: [20, 50],  // the max aperture changes to a random value (between minMax and the cap) every so often
  maxEase: 12,               // seconds it takes to reach the new value

  // MAX APERTURE ALLOWED for a number of cuts: it goes through these two points (cuts, max aperture).
  // A row j is shifted by aperture * j, so the shift of the last rows is ~ aperture * cuts. With
  // capMode 'inverse' that product is kept ~constant (the cap goes like 1 / cuts); with 'linear'
  // the cap is a straight line between the two points.
  //   cuts:  3     7     9     11    13    15    17
  //   cap:   0.50  0.21  0.16  0.13  0.11  0.09  0.08      (capMode 'inverse')
  capPoints: [[3, 0.5], [17, 0.08]],
  capMode: 'inverse',

  // ---- its states ----
  zeroChance: 0.75,        // probability that the aperture state goes to 0 (otherwise to a peak). Cuts only change at 0
  peakFraction: [0.25, 1], // the peak is a random value between these fractions of the cap of the current cuts
                           // (the same value for all the interferences).   [1, 1] = always the cap
  speed: [0.5, 1.4],       // random speed of the transitions of each aperture state (< 1 slower, > 1 faster)
  times: {                 // APERTURE state: seconds (random inside each range, x the track timeScale / speed)
    toFixed: [10, 20],
    hold:    [3, 8],
    back:    [10, 20],
  },
};
const APERTURE_SWING = {
  times: {                 // APERTURE SWING state
    toMax:    [10, 20],    // own value -> +peak
    holdMax:  [2, 5],
    swing:    [12, 24],    // +peak -> -peak
    holdNeg:  [2, 5],
    back:     [10, 20],    // -peak -> own value
  },
};

// max aperture allowed for a given number of cuts
function apertureCap(r) {
  const [[r0, a0], [r1, a1]] = APERTURE.capPoints;
  const t = constrain((r - r0) / (r1 - r0), 0, 1);
  if (APERTURE.capMode === 'linear') return lerp(a0, a1, t);
  return lerp(a0 * r0, a1 * r1, t) / r;        // 'inverse': (aperture * cuts) goes from a0*r0 to a1*r1
}

// live values
let aptMax = APERTURE.max; // current max aperture
let aptMaxTarget = APERTURE.max;
let aptMaxWait = 20;       // seconds until the next change of the max aperture
let aptPeak = APERTURE.max; // the non-zero value the current state goes to (random, up to the cap of the cuts)
let aptToMax = false;      // the fixed value of the current aperture state: false = 0, true = the peak

// values sent to the shader. The aperture of an interference goes from A to B:
//   A / B = its own aperture (oa / ob = 1)  or a fixed value (va / vb)
const aptS = { k: 0, pat: 12, st: 0, va: 0, vb: 0, oa: 1, ob: 1 };

// random value for a state that goes "to the peak": between peakFraction of the cap allowed by the cuts
function pickPeak() {
  return apertureCap(rows) * random(APERTURE.peakFraction[0], APERTURE.peakFraction[1]);
}

// the fixed value of the current aperture state
function aptFixed() { return aptToMax ? aptPeak : 0; }

// helper: set "from" and "to", each one either 'own' or a number
function aptSet(k, from, to) {
  aptS.k = k;
  aptS.oa = from === 'own' ? 1 : 0;  aptS.va = from === 'own' ? 0 : from;
  aptS.ob = to === 'own' ? 1 : 0;    aptS.vb = to === 'own' ? 0 : to;
}

function aptIdle() { aptSet(0, 'own', 'own'); }

function aptInit() {
  aptMax = min(APERTURE.max, apertureCap(rows));
  aptMaxTarget = aptMax;
  aptMaxWait = random(APERTURE.maxChangeEvery[0], APERTURE.maxChangeEvery[1]);
}

// new random cuts + a new max aperture that is allowed for them (called while the aperture is 0: invisible)
function aptNewRows() {
  rows = random(CUTS.options.filter(r => r !== rows));
  aptMax = random(APERTURE.minMax, apertureCap(rows));
  aptMaxTarget = aptMax;
}

// every frame: moves the max aperture
function aptUpdate(dt) {
  aptMaxWait -= dt;
  if (aptMaxWait <= 0) {
    aptMaxTarget = random(APERTURE.minMax, apertureCap(rows));
    aptMaxWait = random(APERTURE.maxChangeEvery[0], APERTURE.maxChangeEvery[1]);
  }
  aptMax += (aptMaxTarget - aptMax) * (1 - exp(-dt / APERTURE.maxEase));
  aptMax = min(aptMax, apertureCap(rows));
}

// ---- state: APERTURE ----
function makeApertureCycle() {
  const T = APERTURE.times;
  const cyc = new Cycle([
    { name: 'toFixed', range: T.toFixed, onStart: () => {
        cyc.speed = random(APERTURE.speed[0], APERTURE.speed[1]);     // random speed for this run
        aptToMax = random() >= APERTURE.zeroChance;
        if (aptToMax) aptPeak = pickPeak();                           // random value, not always the cap
        setPattern(aptS);
      },
      apply: k => aptSet(k, 'own', aptFixed()) },
    { name: 'hold', range: T.hold,
      onStart: () => { if (!aptToMax) aptNewRows(); },
      apply: k => aptSet(1, aptFixed(), aptFixed()) },
    { name: 'back', range: T.back, onStart: () => setPattern(aptS),
      apply: k => aptSet(k, aptFixed(), 'own') },
  ]);
  return cyc;
}

// ---- state: APERTURE SWING ----
function makeApertureSwingCycle() {
  const T = APERTURE_SWING.times;
  const cyc = new Cycle([
    { name: 'toMax', range: T.toMax, onStart: () => {
        cyc.speed = random(APERTURE.speed[0], APERTURE.speed[1]);
        aptPeak = pickPeak();                                         // random value, not always the cap
        setPattern(aptS);
      },
      apply: k => aptSet(k, 'own', aptPeak) },
    { name: 'holdMax', range: T.holdMax, apply: k => aptSet(1, aptPeak, aptPeak) },
    { name: 'swing',   range: T.swing,   onStart: () => setPattern(aptS),  apply: k => aptSet(k, aptPeak, -aptPeak) },
    { name: 'holdNeg', range: T.holdNeg, apply: k => aptSet(1, -aptPeak, -aptPeak) },
    { name: 'back',    range: T.back,    onStart: () => setPattern(aptS),  apply: k => aptSet(k, -aptPeak, 'own') },
  ]);
  return cyc;
}

function aptUniforms(sh) {
  sh.setUniform('u_aptK', aptS.k);
  sh.setUniform('u_aptPat', aptS.pat);
  sh.setUniform('u_aptSt', aptS.st);
  sh.setUniform('u_aptVA', aptS.va);
  sh.setUniform('u_aptVB', aptS.vb);
  sh.setUniform('u_aptOA', aptS.oa);
  sh.setUniform('u_aptOB', aptS.ob);
}

function aptReport()   { return { goes_to: aptToMax ? 'peak ' + r3(aptPeak) : 'zero', ...patInfo(aptS) }; }
function swingReport() { return { swing_between: '+' + r3(aptPeak) + ' and -' + r3(aptPeak), ...patInfo(aptS) }; }


// #####################################################################################################
// ##########################################   2 · SKINS   ############################################
// #####################################################################################################
//  How the interference is painted:  FREQUENCY (rings per unit)  ·  RGB SHIFT (chromatic aberration)  ·
//  SUM (a second layer of rings added to the colour: "the double", final + final2)  ·  RUN (the rings flow).


// =====================================================================================================
//  2.1  SKINS · FREQUENCY
//       state FREQUENCY: normal -> STEP (not smooth) to another value -> hold -> step back to normal
//       (every change can also change the rotation speed, see ROTATION.speedChangeChance)
//       The cuts can raise a minimum frequency (see CUTS.highFreq).
// =====================================================================================================
const FREQ_BASE = [10, 15, 20, 25][Math.floor(Math.random() * 4)];   // normal frequency: random every time the program runs
const FREQUENCY = {
  base: FREQ_BASE,
  spread: 0,               // > 0 = every interference also gets its own random +/- variation of the frequency
  options: [0, 10, 15, 20, 25].filter(f => f !== FREQ_BASE),   // the step goes to one of these (random each time)
  times: {
    sweepTo:   [4, 10],    // time the "wave" of steps takes to cross all the interferences
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
    { name: 'sweepTo', range: T.sweepTo, onStart: () => { frqTarget = random(FREQUENCY.options); setPattern(frqS); rotMaybeChangeSpeed(); },
      apply: k => { frqS.a = 1; frqS.b = ratio(); frqS.k = k; } },
    { name: 'hold', range: T.hold, apply: k => { frqS.a = ratio(); frqS.b = frqS.a; frqS.k = 1; } },
    { name: 'sweepBack', range: T.sweepBack, onStart: () => { setPattern(frqS); rotMaybeChangeSpeed(); },
      apply: k => { frqS.a = ratio(); frqS.b = 1; frqS.k = k; } },
  ]);
}

function frqUniforms(sh) {
  sh.setUniform('u_freqK', frqS.k);
  sh.setUniform('u_freqA', frqS.a);
  sh.setUniform('u_freqB', frqS.b);
  sh.setUniform('u_freqPat', frqS.pat);
}

function frqReport() { return { steps_to: frqTarget, ...patInfo(frqS) }; }


// =====================================================================================================
//  2.2  SKINS · RGB SHIFT (chromatic aberration)
//       state CHROMA: R, G and B are drawn shifted: the shifts go from 0 to some random values (the same
//       for every interference), hold, and come back to 0.
// =====================================================================================================
const CHROMA = {
  min: 0.05,               // every component of the R, G, B shifts is random inside [min, max]
  max: 0.1,                // (units: interference uv, the quad spans -1..1)
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
    { name: 'toValues', range: T.toValues, onStart: () => {
        caS.r = [rnd(), rnd()]; caS.g = [rnd(), rnd()]; caS.b = [rnd(), rnd()];
        setPattern(caS);
      },
      apply: k => { caS.from = 0; caS.to = 1; caS.k = k; } },
    { name: 'hold', range: T.hold, apply: k => { caS.from = 1; caS.to = 1; caS.k = 1; } },
    { name: 'back', range: T.back, onStart: () => setPattern(caS),
      apply: k => { caS.from = 1; caS.to = 0; caS.k = k; } },
  ]);
}

function caUniforms(sh) {
  uState(sh, 'ca', caS);
  sh.setUniform('u_caR', caS.r);
  sh.setUniform('u_caG', caS.g);
  sh.setUniform('u_caB', caS.b);
}

function caReport() { return patInfo(caS); }


// =====================================================================================================
//  2.3  SKINS · SUM  ("the double")
//       state SUM: the second layer of rings (final2) fades in and is ADDED to the colour
//       (final + final2), holds, and fades out.
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
    { name: 'toValues', range: T.toValues, onStart: () => setPattern(sumS),
      apply: k => { sumS.from = 0; sumS.to = 1; sumS.k = k; } },
    { name: 'hold', range: T.hold, apply: k => { sumS.from = 1; sumS.to = 1; sumS.k = 1; } },
    { name: 'back', range: T.back, onStart: () => setPattern(sumS),
      apply: k => { sumS.from = 1; sumS.to = 0; sumS.k = k; } },
  ]);
}

function sumUniforms(sh) { uState(sh, 'sum', sumS); }

function sumReport() { return patInfo(sumS); }


// =====================================================================================================
//  2.4  SKINS · RUN   (variant, not a state)
//       SOMETIMES, when a skin state starts, the second value of pulseOsc (the phase) runs a little, so the
//       rings slowly flow. It fades in and stops when that state ends.
// =====================================================================================================
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


// #####################################################################################################
// ########################################   3 · TRANSFORM   ##########################################
// #####################################################################################################
//  Where the interference is and how it moves:  POSITION (drift, velocity, camera)  ·  ROTATION.


// =====================================================================================================
//  3.1  TRANSFORM · POSITION
//       * The CAMERA moves slowly through the world (the world is a loop around it).
//       * Every interference DRIFTS in its own random direction (which slowly wanders), at its own speed
//         (which slowly swings).
//       * state VELOCITY: the speed of ALL the interferences eases to a fixed multiplier (0 = they freeze,
//         > 1 = they rush), holds, and comes back to their own speed.
// =====================================================================================================
let camPos = [0, 0];
let camVel = [0.0001, 0];  // camera speed per frame: [x, y]. Positive x = camera moves right
const HALF = 1.3;          // world is a loop of width 2*HALF around the camera (always off-screen at the edge)
const WRAP = HALF * 2;
const CULL_LIM = 1.22;     // beyond this (screen space) an interference isn't drawn

// own motion of every interference (a random direction that slowly wanders)
const DRIFT_MIN = 0.0002;          // every interference picks its own speed between MIN and MAX
const DRIFT_MAX = 0.0012;
const DRIFT_BREATH = 0.6;          // 0 = constant speed. 0.6 = the speed slowly swings between 40% and 160%
const DRIFT_BREATH_RATE = [0.1, 0.5]; // rad/s of that swing (every interference picks its own)
const WANDER = 0.03;               // max random turn per frame (radians). 0 = straight lines

// ---- state: VELOCITY ----
const VELOCITY = {
  targets: [0, 3],         // speed multiplier it goes to (random each time). 0 = stop, 3 = three times faster
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
    { name: 'toTarget', range: T.toTarget, onStart: () => { velTarget = random(VELOCITY.targets); setPattern(velS); },
      apply: k => { velS.from = 1; velS.to = velTarget; velS.k = k; } },
    { name: 'hold', range: T.hold, apply: k => { velS.from = velTarget; velS.to = velTarget; velS.k = 1; } },
    { name: 'back', range: T.back, onStart: () => setPattern(velS),
      apply: k => { velS.from = velTarget; velS.to = 1; velS.k = k; } },
  ]);
}

function velUniforms(sh) { /* the velocity is applied in JS (see the interference loop in draw) */ }

function velReport() { return { goes_to_speed_x: velTarget, ...patInfo(velS) }; }

// speed multiplier of ONE interference, given its screen position and its random number
function velMultiplier(sx, sy, rnd) {
  if (velS.from === velS.to) return velS.from;
  const o = orderOfJS(velS.pat, sx, sy, rnd);
  return lerp(velS.from, velS.to, localProgJS(velS.k, o, velS.st));
}


// =====================================================================================================
//  3.2  TRANSFORM · ROTATION
//       state ROTATION: slow down -> every interference eases to angle 0 -> hold -> release -> speed up
//       The rotation speed changes (a little, slowly) from time to time, when the frequency changes.
// =====================================================================================================
const ROTATION = {
  times: {                 // seconds (random inside each range, x MOTION_TRACK.timeScale)
    slow:    [4, 8],       // rotation speed goes to 0
    align:   [10, 20],     // every interference eases to angle 0
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
    { name: 'slow', range: T.slow, apply: k => { rotRate = 1 - ease(k); } },
    { name: 'align', range: T.align, onStart: () => setPattern(rotS),
      apply: k => { rotRate = 0; rotS.from = 0; rotS.to = 1; rotS.k = k; } },
    { name: 'hold', range: T.hold, apply: k => { rotRate = 0; rotS.from = 1; rotS.to = 1; rotS.k = 1; } },
    { name: 'release', range: T.release, onStart: () => setPattern(rotS),
      apply: k => { rotRate = 0; rotS.from = 1; rotS.to = 0; rotS.k = k; } },
    { name: 'speedup', range: T.speedup, apply: k => { rotRate = ease(k); rotS.from = 0; rotS.to = 0; rotS.k = 0; } },
  ]);
}

function rotUniforms(sh) {
  sh.setUniform('u_rotT', rotT);
  uState(sh, 'rot', rotS);
}

function rotReport() { return patInfo(rotS); }

function rotationIsRunning() {
  return motionTrack.running() === 'rotation';
}


// =====================================================================================================
//  3.3  TRANSFORM · ZONE   (variant, not a state; it touches POSITION and ROTATION)
//       Suddenly a random segment of the screen wakes up: the interferences inside it start to move
//       faster, rotate, or both. It fades in, stays a while and fades out.
// =====================================================================================================
const ZONE = {
  wait: [20, 50],          // seconds between two events
  duration: [10, 20],      // seconds an event lasts
  fade: 0.3,               // fraction of the duration used to fade in and to fade out
  halfW: [0.25, 0.6],      // half width / half height of the segment (screen units, the screen is -1..1)
  halfH: [0.25, 0.6],
  soft: 0.15,              // softness of the edges
  types: ['move', 'rotate', 'both'],  // what wakes up (random each time)
  moveBoost: 6,            // inside the zone the speed is multiplied by (1 + moveBoost)
  rotSpeed: 1.0,           // extra rotation (rad/s) inside the zone; every interference picks its own direction
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
      if (LOG.onChange) logState('zone variant STARTS (' + zone.type + ')');
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
    if (LOG.onChange) logState('zone variant ENDS');
  }
}

function smoothStep(a, b, x) {
  const t = constrain((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// 0..1: how much the zone affects an interference that is at (sx, sy) on the screen
function zoneWeight(sx, sy) {
  if (!zone.active) return 0;
  const wx = 1 - smoothStep(zone.hw - ZONE.soft, zone.hw, abs(sx - zone.cx));
  const wy = 1 - smoothStep(zone.hh - ZONE.soft, zone.hh, abs(sy - zone.cy));
  return zone.env * wx * wy;
}


// =====================================================================================================
//  4. TRACKS REGISTRY  (add / remove / reorder states here)
//     group:  the property group the state acts on (just for the console report)
//     weight: how often a state is picked (default 1).   start: phase to begin in at program start (1 = hold)
// =====================================================================================================
const MOTION_STATES = [
  { name: 'rotation',      group: 'transform', make: makeRotationCycle,      idle: rotIdle, uniforms: rotUniforms, report: rotReport },
  { name: 'velocity',      group: 'transform', make: makeVelocityCycle,      idle: velIdle, uniforms: velUniforms, report: velReport },
  { name: 'aperture',      group: 'shape',     make: makeApertureCycle,      idle: aptIdle, uniforms: aptUniforms, report: aptReport, weight: 3 },   // the one that changes the cuts
  { name: 'apertureSwing', group: 'shape',     make: makeApertureSwingCycle, idle: aptIdle, uniforms: aptUniforms, report: swingReport },
];
const SKIN_STATES = [
  { name: 'frequency', group: 'skins', make: makeFrequencyCycle, idle: frqIdle, uniforms: frqUniforms, report: frqReport },
  { name: 'sum',       group: 'skins', make: makeSumCycle,       idle: sumIdle, uniforms: sumUniforms, report: sumReport, start: 1 },
  { name: 'chroma',    group: 'skins', make: makeChromaCycle,    idle: caIdle,  uniforms: caUniforms,  report: caReport,  start: 1 },
];
const motionTrack = new Track('motion', MOTION_TRACK, MOTION_STATES);
const skinsTrack  = new Track('skins',  SKINS_TRACK,  SKIN_STATES);


// =====================================================================================================
//  5. SHADERS
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

    vec3 pulseOsc(vec2 uv, float _freq, float speed, float coord) {
      float ramp = fract(coord * _freq + speed);

      float mmm = mix(vUV.y,0.1,1.4);
      float mmm2 = mix(vAperture,0.1,6.);
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


      vec3 dRGB = vec3(d);
      if (vCA > 0.001) {
        dRGB = vec3(
          interference(uv + u_caR * vCA, u_rows, vAperture),
          interference(uv + u_caG * vCA, u_rows, vAperture),
          interference(uv + u_caB * vCA, u_rows, vAperture)
        );
      }

      vec3 final = vec3(
        pulseOsc(uv,vFreq, vAperture*5. + u_runT, dRGB.r).x,
        pulseOsc(uv,vFreq, vAperture*5. + u_runT, dRGB.g).x,
        pulseOsc(uv,vFreq, vAperture*5. + u_runT, dRGB.b).x
      );

      vec3 final2 = vec3(0.0);
      if (vSum > 0.001) {
        float d2 = interference(uv+vec2(sin(vTimeOffset*2.)*0.05,0.01), u_rows, vAperture);
        final2 = pulseOsc(uv,vFreq, 0.26 + u_runT, d2);
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


      // if(d<0.03){
      // final = vec3(1.0);
      // }

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
//  6. SETUP
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

  vertCount = numInterferences * 6;

  for(let i=0; i<numInterferences; i++) {
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
  gl.bufferData(gl.ARRAY_BUFFER, numInterferences * 6 * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(offLoc);
  gl.vertexAttribPointer(offLoc, 2, gl.FLOAT, false, 0, 0);
  buffers.offBuffer = offBuffer;

  drawOrder = [...Array(numInterferences).keys()];

  // states: build every cycle of both tracks, and start resting
  motionTrack.init();
  skinsTrack.init();
  aptInit();
  zone.wait = random(ZONE.wait[0], ZONE.wait[1]);

  // rectangles: start spread over the screen and to the right
  for (let i = 0; i < NUM_RECTS; i++) {
    let r = { x: 0, y: 0, hw: 0, hh: 0 };
    spawnRect(r, true);
    rects.push(r);
  }

  logState('start');
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
//  7. UPDATE  (dt in seconds)
// =====================================================================================================
let frameDt = 0.016;

function updateStates(dt) {
  motionTrack.update(dt);      // aperture / aperture swing / rotation / velocity
  skinsTrack.update(dt);       // frequency / sum / rgb shift   (independent from the motion track)
  rotUpdate(dt);               // rotation speed and angle
  aptUpdate(dt);               // max aperture
  cutsUpdate(dt);              // frequency floor asked by the cuts
}

function updateVariants(dt) {
  runUpdate(dt);
  zoneUpdate(dt);
  logTick(dt);
}


// =====================================================================================================
//  8. DRAW
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
  cutsUniforms(shaderProgram);
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

  for (let i = 0; i < numInterferences; i++) {
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

    // own aperture: grows with the distance from the screen center, up to the current max aperture
    let apt = constrain(map(dist(sx, sy, 0, 0), 0, 1, 0, aptMax), 0, aptMax);
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
  if (key === LOG.key) logState('manual (key ' + LOG.key + ')');   // print every parameter in the console
}


// =====================================================================================================
//  9. CONSOLE REPORT
//     Prints ALL the parameters of the current state: the two tracks, and the SHAPE, SKINS and TRANSFORM
//     properties of the interference.
// =====================================================================================================
const LOG = {
  enabled: true,
  onChange: true,          // print every time a state (or the zone variant) starts or ends
  everySeconds: 0,         // > 0 = also print every N seconds
  key: 'p',                // press this key to print on demand
};
let logTimer = 0;

function r3(x) { return Math.round(x * 1000) / 1000; }

// everything that defines the current state, grouped like the interference: SHAPE / SKINS / TRANSFORM
function snapshot() {
  const arr = a => a.map(r3);
  return {
    t: Math.round(millis() / 1000),

    states: {
      motion_track: motionTrack.status(),
      skins_track: skinsTrack.status(),
    },

    shape: {
      cuts: { rows, options: CUTS.options },
      aperture: {
        max_now: r3(aptMax),
        max_target: r3(aptMaxTarget),
        cap_for_these_cuts: r3(apertureCap(rows)),
        peak_of_state: r3(aptPeak),
        transition_from: aptS.oa ? 'own' : r3(aptS.va),
        transition_to: aptS.ob ? 'own' : r3(aptS.vb),
        transition_progress: r3(aptS.k),
        next_max_change_in_s: r3(Math.max(aptMaxWait, 0)),
      },
    },

    skins: {
      frequency: {
        base: FREQUENCY.base,
        step_target: frqTarget,
        multiplier_before: r3(frqS.a),
        multiplier_after: r3(frqS.b),
        step_progress: r3(frqS.k),
        minimum_asked_by_cuts: r3(freqFloor),
      },
      rgb_shift: {
        amount_from: r3(caS.from),
        amount_to: r3(caS.to),
        progress: r3(caS.k),
        shift_r: arr(caS.r),
        shift_g: arr(caS.g),
        shift_b: arr(caS.b),
      },
      sum_double: {
        amount_from: r3(sumS.from),
        amount_to: r3(sumS.to),
        progress: r3(sumS.k),
      },
      run: { rate: r3(runRate), phase: r3(runT) },
    },

    transform: {
      position: {
        camera: arr(camPos),
        camera_velocity: camVel,
        drift_speed_range: [DRIFT_MIN, DRIFT_MAX],
        velocity_multiplier_from: r3(velS.from),
        velocity_multiplier_to: r3(velS.to),
        velocity_progress: r3(velS.k),
      },
      rotation: {
        speed_now: r3(rotSpeed),
        speed_target: r3(rotSpeedTarget),
        rate: r3(rotRate),
        angle_accumulated: r3(rotT),
        toward_zero_from: r3(rotS.from),
        toward_zero_to: r3(rotS.to),
        toward_zero_progress: r3(rotS.k),
      },
      zone: zone.active
        ? { type: zone.type, center: arr([zone.cx, zone.cy]), half_size: arr([zone.hw, zone.hh]), strength: r3(zone.env) }
        : { active: false, next_in_s: r3(Math.max(zone.wait, 0)) },
    },
  };
}

// object -> indented text, one "name: value" per line (so everything is visible without opening anything)
function formatLines(o, ind = '') {
  let out = '';
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out += ind + k + '\n' + formatLines(v, ind + '    ');
    } else if (Array.isArray(v)) {
      out += ind + k + ': [' + v.join(', ') + ']\n';
    } else {
      out += ind + k + ': ' + v + '\n';
    }
  }
  return out;
}

function logState(reason) {
  if (!LOG.enabled) return;
  const s = snapshot();
  console.log(
    '\n══════ ' + reason + '  ·  t = ' + s.t + ' s ══════\n' +
    'STATES\n'                    + formatLines(s.states, '    ') +
    'INTERFERENCE · SHAPE\n'      + formatLines(s.shape, '    ') +
    'INTERFERENCE · SKINS\n'      + formatLines(s.skins, '    ') +
    'INTERFERENCE · TRANSFORM\n'  + formatLines(s.transform, '    ')
  );
}

function logTick(dt) {
  if (LOG.everySeconds <= 0) return;
  logTimer += dt;
  if (logTimer >= LOG.everySeconds) {
    logTimer = 0;
    logState('every ' + LOG.everySeconds + ' s');
  }
}

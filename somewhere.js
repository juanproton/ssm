window.onload = setup;
let p = null;

let w,h
let r
let pad
let black,white
let wFix = 1080;let hFix = 1350;let drawScale;
let cols = ['#FF0000','#0000FF','#55D042']
let arrayOfPaths

let a3Width = 500;
let a3Height = 500;
let effWidth, effHeight;
let orientation = 'ladnscape'

let previewW, previewH;
let scaleFactor;
let strokeWidthMM = 0.4;

let config = {
  type:0,
  stroke:false
}
let forceSharedEdge = true

const PAD = 300
const CUTS = 11
const FREQ = 25
const ROT = 0
const APERTURE = 0.95
const FIRST_BLACK = true

const FPS = 14
const AUTOPLAY = true
const APERTURE_PERIOD = 24*2.5

const BRUSH = {
  count: 1,
  size: [0.1, 0.5],
  sizeChance: 0.2,
  sizeEase: 0.2,
  colorSpread: true,
  maxTrail: 1400,
  tailTaper: 0.2,
  gradientLen: [100, 2000],
  step: 1,
  density: 0,
  holdDots: 0,
  dot: [1.2, 4],
  dotAlpha: [8, 34],
  hazeAlpha: 100,
  hazeLayers: 20,
  core: 2,
  sigma: 0.1,
  substeps: 4,
  seed: 7
}

const AUTO = {
  ring: [0.6, 1.5],
  minHop: 0.3,
  hopSpeed: [0.03, 1.1],
  liftChance: 0,
  strokes: [4, 100],
  strokeLen: [0.01, 4.5],
  lenMix: 1,
  lenSteps: 2.5,
  strokeFrames: [3, 7],
  angleJitter: 0.2,
  angleTurn: [-2, 2],
  drift: [0.01, 0.01]
}

const GRID = {
  show: true,
  cell: [0.15, 0.15],
  stroke: '#1c1c1c',
  strokeWidth: 1,
  fill: null,
  gray: [0., 1.],
  sample: 10
}

const COORD = {
  show: true,
  everyN: 2,
  numbersPerChange: [1, 3],
  fontSize: 0.1,
  font: 'Helvetica, Arial, sans-serif',
  color: '#1c1c1c',
  gap: 1.8
}

function randomCosmicCoords(){
  let raHours = Math.floor(Math.random() * 24);
  let raMinutes = Math.floor(Math.random() * 60);
  let raSeconds = (Math.random() * 60).toFixed(2);

  let decSign = Math.random() < 0.5 ? -1 : 1;
  let decDegrees = Math.floor(Math.random() * 90);
  let decMinutes = Math.floor(Math.random() * 60);
  let decSeconds = (Math.random() * 60).toFixed(2);

  let ra  = raHours + "h " + raMinutes + "m " + raSeconds + "s";
  let dec = (decSign * decDegrees) + "° " + decMinutes + "' " + decSeconds + '"';

  return ra + ", " + dec;
}

const TAU2 = Math.PI * 2
const SPRAY_OPACITY = 1
const SPRAY_BLEND = 'multiply'

const PALETTE = [
  [30, 90, 220],
  [0, 170, 230],
  [60, 190, 80],
  [245, 230, 0],
  [255, 140, 20],
  [240, 50, 70],
  [235, 40, 150]
]

let interference = null
let parts = []
let baseAperture = 0
let sprayRaster = null
let sprayCanvas = null
let sprayCenter = { x: 0, y: 0 }
let frame = 0
let playing = false
let timer = null
let animBtn, resetBtn

let bs = { unit: 1 }
let brushes = []

let gridGroup = null
let gridCells = new Map()
let outers = []

let coordText = null
let coordParts = []
let coordNumIdx = []

function setup() {
  p = paper;
  pad = PAD
  const canvas = document.getElementById('canvasId');
  effWidth  = (orientation === "portrait") ? a3Width  : a3Height;
  effHeight = (orientation === "portrait") ? a3Height : a3Width;

  let a3Ratio = effHeight / effWidth;

  let winW = window.innerWidth;
  let winH = window.innerHeight;

  if (winW / winH > effWidth / effHeight) {
    previewH = winH * 0.95;
    previewW = previewH / a3Ratio;
  } else {
    previewW = winW * 0.95;
    previewH = previewW * a3Ratio;
  }
  scaleFactor = previewW / a3Width;
  [w, h] = [previewW, previewH];

  canvas.width = previewW;
  canvas.height = previewH;

  canvas.style.backgroundColor = 'white';
  p.setup(canvas);
  var tool = new p.Tool();
  tool.onKeyDown = kdown;
  let tokenData = genTokenData(123);
  r = new Random(tokenData)
  drawScale = Math.min(w / wFix, h / hFix);
  white = new p.Color(251/255,250/255,245/255)
  black = new p.Color(0.11)
  cols.push(black)

  createUI()
  playing = AUTOPLAY
  generate();
  updateButtons()

  timer = setInterval(tick, 1000 / FPS)
}

function makeButton(label, onClick) {
  const b = document.createElement('button')
  b.textContent = label
  b.style.cssText = 'padding:6px 14px;margin-right:6px;font:13px sans-serif;cursor:pointer'

  b.addEventListener('click', () => { onClick(); b.blur() })
  return b
}

function createUI() {
  if (animBtn) return
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;top:10px;left:10px;z-index:10'
  animBtn = makeButton('Pause', togglePlay)
  resetBtn = makeButton('Reset', resetAnim)
  bar.append(animBtn, resetBtn)
  document.body.appendChild(bar)
}

function updateButtons() {
  if (!animBtn) return
  animBtn.textContent = playing ? 'Pause' : (frame > 0 ? 'Resume' : 'Animate')
}

function togglePlay() {
  playing = !playing
  updateButtons()
}

function resetAnim() {
  playing = false
  frame = 0
  resetBrush()
  applyFrame(0)
  updateButtons()
}

function buildFills(interf) {
  const out = []
  const count = interf.rects.length

  for (let j = 0; j < count; j++) {
    for (let i = 0; i < interf.donuts.length; i++) {
      const res = interf.rects[j].intersect(interf.donuts[i])
      if (!res) continue

      p.project.activeLayer.addChild(res)

      const empty = (res instanceof p.CompoundPath)
        ? res.children.length === 0
        : (!res.segments || res.segments.length === 0)
      if (empty) { res.remove(); continue }

      if (interf.rot) res.rotate(interf.rot, interf.position)

      const isBlack = (i % 2 === 0) === FIRST_BLACK
      res.strokeColor = null
      res.fillColor = isBlack ? black : white
      interf.output(res)

      out.push({ path: res, j, i, curOff: new p.Point(0, 0) })
    }
  }
  return out
}

function setAperture(k) {
  const it = interference
  const count = it.rects.length
  const mid = Math.floor(count / 2)
  it.aperture = baseAperture * k

  for (const part of parts.concat(outers)) {
    const off = (part.j === mid) ? 0 : it.offsetFor(part.j, count)
    const v = new p.Point(off, 0).rotate(it.rot || 0)
    part.path.translate(v.subtract(part.curOff))
    part.curOff = v
  }
}

function makeOuters() {
  outers = []
  const it = interference
  const c = new p.Point(it.position.x, it.position.y)
  for (let j = 0; j < it.rects.length; j++) {
    const disc = new p.Path.Circle({ center: c, radius: bs.unit, insert: false })
    const piece = disc.intersect(it.rects[j], { insert: false })
    if (!piece) continue
    if (it.rot) piece.rotate(it.rot, c)
    outers.push({ path: piece, j, curOff: new p.Point(0, 0) })
  }
}

function gridCell(ix, iy, cs) {
  const item = new p.Path.Rectangle({
    point: [sprayCenter.x + ix * cs, sprayCenter.y + iy * cs],
    size: [cs, cs],
    strokeColor: GRID.stroke,
    strokeWidth: 1,
    insert: false
  })

  const g = GRID.gray[0] + Math.random() * (GRID.gray[1] - GRID.gray[0])

  gridGroup.addChild(item)
}

function updateGrid() {
  if (!GRID.show || !gridGroup || !outers.length) return

  const cellNow = GRID.cell[0] + Math.random() * (GRID.cell[1] - GRID.cell[0])
  const cs = bs.unit * cellNow
  gridGroup.removeChildren()

  const step = cs / Math.max(1, GRID.sample)
  const nudge = 1.5
  const seen = new Set()

  for (const o of outers) {
    for (const sp of (o.path.children || [o.path])) {
      const L = sp.length
      if (!L) continue
      const n = Math.max(2, Math.ceil(L / step))
      for (let k = 0; k < n; k++) {
        const off = L * k / n
        const pt = sp.getPointAt(off)
        const nr = sp.getNormalAt(off)
        if (!pt || !nr) continue

        let q = pt.add(nr.multiply(nudge))
        if (o.path.contains(q)) q = pt.subtract(nr.multiply(nudge))
        let covered = false
        for (const o2 of outers) {
          if (o2 !== o && o2.path.bounds.contains(q) && o2.path.contains(q)) { covered = true; break }
        }
        if (covered) continue

        const ix = Math.floor((pt.x - sprayCenter.x) / cs)
        const iy = Math.floor((pt.y - sprayCenter.y) / cs)
        const key = ix + ',' + iy
        if (seen.has(key)) continue
        seen.add(key)
        gridCell(ix, iy, cs)
      }
    }
  }
}

const splitCoords = (s) => s.split(/(-?\d+(?:\.\d+)?)/)

function setCoordParts(s) {
  coordParts = splitCoords(s)
  coordNumIdx = []
  coordParts.forEach((c, i) => { if (i % 2 === 1) coordNumIdx.push(i) })
}

function makeCoords() {
  coordText = null
  if (!COORD.show) return
  const fs = Math.max(9, bs.unit * COORD.fontSize)

  const yBottom = sprayCenter.y + bs.unit * (1 + GRID.cell[1])
  coordText = new p.PointText({
    point: [sprayCenter.x, Math.min(yBottom + fs * COORD.gap, h - fs * 0.5)],
    justification: 'center',
    fontFamily: COORD.font,
    fontSize: fs,
    fontWeight: 'bold',
    fillColor: COORD.color,
    content: ''
  })
  setCoordParts(randomCosmicCoords())
  coordText.content = coordParts.join('')
}

function updateCoords(f) {
  if (!coordText) return
  if (f === 0) {
    setCoordParts(randomCosmicCoords())
    coordText.content = coordParts.join('')
    return
  }
  if (f % COORD.everyN !== 0) return
  const fresh = splitCoords(randomCosmicCoords())

  if (fresh.length !== coordParts.length) {
    setCoordParts(randomCosmicCoords())
  } else {
    const [lo, hi] = COORD.numbersPerChange
    const count = Math.floor(lo + Math.random() * (hi - lo + 1))
    for (let k = 0; k < count; k++) {
      const i = coordNumIdx[Math.floor(Math.random() * coordNumIdx.length)]
      coordParts[i] = fresh[i]
    }
  }
  coordText.content = coordParts.join('')
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const brnd = (b, lo, hi) => lo + b.rnd() * (hi - lo)
const brr = (b, range) => brnd(b, range[0], range[1])
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t)
const easeOut = (t) => 1 - Math.pow(1 - t, 2)

function gaussian(b, sd) {
  const u = Math.max(1e-9, b.rnd()), v = b.rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU2 * v) * sd
}

function gradientColor(u) {
  const n = PALETTE.length
  const s = (((u % 1) + 1) % 1) * n
  const i = Math.floor(s) % n
  const f = s - Math.floor(s)
  const a = PALETTE[i], b = PALETTE[(i + 1) % n]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

function newBrush(i) {
  const b = {
    i,
    rnd: mulberry32(r.random_dec()*200+ i * 7919),
    trail: [],
    prev: null,
    phase0: BRUSH.colorSpread ? i / BRUSH.count : 0,
    phase: 0,
    gradLen: 1,
    size: 0,
    targetSize: 0,
    ap: { x: 0, y: 0, down: true, queue: [], seg: null, angle: 0 }
  }
  b.size = b.targetSize = brr(b, BRUSH.size)
  b.phase = b.phase0
  b.gradLen = brr(b, BRUSH.gradientLen)
  b.ap.x = sprayCenter.x + brnd(b, -1, 1) * bs.unit
  b.ap.y = sprayCenter.y + brnd(b, -1, 1) * bs.unit
  b.ap.angle = brnd(b, 0, TAU2)
  return b
}

function resetBrush() {
  brushes = []
  for (let i = 0; i < BRUSH.count; i++) brushes.push(newBrush(i))
}

function planNext(b) {
  const ap = b.ap
  const u = bs.unit
  const m = 5
  const W = p.view.viewSize.width, H = p.view.viewSize.height
  let tx, ty
  for (let tries = 0; tries < 20; tries++) {
    const a = brnd(b, 0, TAU2)
    const rad = u * brr(b, AUTO.ring)
    tx = clamp(sprayCenter.x + Math.cos(a) * rad, m, W - m)
    ty = clamp(sprayCenter.y + Math.sin(a) * rad, m, H - m)
    if (Math.hypot(tx - ap.x, ty - ap.y) >= u * AUTO.minHop) break
  }

  if (b.rnd() < BRUSH.sizeChance) b.targetSize = brr(b, BRUSH.size)

  b.gradLen = brr(b, BRUSH.gradientLen)

  const d = Math.hypot(tx - ap.x, ty - ap.y)
  ap.queue.push({
    x: tx, y: ty,
    frames: clamp(d / (u * brr(b, AUTO.hopSpeed)), 5, 26),
    down: b.rnd() >= AUTO.liftChance
  })

  ap.angle += brr(b, AUTO.angleTurn) * (b.rnd() < 0.5 ? -1 : 1)
  const base = ap.angle
  const perp = base + Math.PI / 2
  const n = Math.floor(brr(b, AUTO.strokes))
  const clusterLen = u * brr(b, AUTO.strokeLen)
  const slide = u * brr(b, AUTO.drift) * (b.rnd() < 0.5 ? -1 : 1)
  const lo = u * AUTO.strokeLen[0], hi = u * AUTO.strokeLen[1]
  for (let i = 0; i < n; i++) {
    const a = base + brnd(b, -AUTO.angleJitter, AUTO.angleJitter)
    const own = lo + (hi - lo) * Math.pow(b.rnd(), AUTO.lenSteps)
    const l = clusterLen + (own - clusterLen) * AUTO.lenMix
    const sign = i % 2 === 0 ? 1 : -1
    const cx = tx + Math.cos(perp) * slide * i
    const cy = ty + Math.sin(perp) * slide * i
    ap.queue.push({
      x: clamp(cx + Math.cos(a) * l * 0.5 * sign, m, W - m),
      y: clamp(cy + Math.sin(a) * l * 0.5 * sign, m, H - m),
      frames: brr(b, AUTO.strokeFrames),
      down: true
    })
  }
}

function stepAuto(b) {
  const ap = b.ap
  if (!ap.seg) {
    if (!ap.queue.length) planNext(b)
    ap.seg = ap.queue.shift()
    ap.seg.t = 0
    ap.seg.x0 = ap.x
    ap.seg.y0 = ap.y
    ap.down = ap.seg.down
  }
  const g = ap.seg
  g.t += 1 / g.frames
  const e = easeInOut(Math.min(1, g.t))
  ap.x = g.x0 + (g.x - g.x0) * e
  ap.y = g.y0 + (g.y - g.y0) * e
  if (g.t >= 1) ap.seg = null
}

const hazeSprites = {}
function hazeSprite(rgb) {
  const R = rgb[0] >> 3, G = rgb[1] >> 3, B = rgb[2] >> 3
  const key = R + ',' + G + ',' + B
  if (hazeSprites[key]) return hazeSprites[key]

  const S = 128
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g2 = c.getContext('2d')
  g2.fillStyle = 'rgba(' + (R * 8 + 4) + ',' + (G * 8 + 4) + ',' + (B * 8 + 4) + ',' + (BRUSH.hazeAlpha / BRUSH.hazeLayers / 255) + ')'
  for (let L = 0; L < BRUSH.hazeLayers; L++) {
    const s = Math.pow((L + 1) / BRUSH.hazeLayers, BRUSH.core)
    g2.beginPath()
    g2.arc(S / 2, S / 2, (S / 2) * s, 0, TAU2)
    g2.fill()
  }
  hazeSprites[key] = c
  return c
}

function makePoint(b, x, y, n) {
  const c = gradientColor(b.phase)
  const rgb = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
  const R = bs.unit * b.size * 0.5
  const sigma = bs.unit * b.size * BRUSH.sigma

  const dots = []
  for (let i = 0; i < n; i++) {
    let ox = gaussian(b, sigma), oy = gaussian(b, sigma)
    const m = Math.hypot(ox, oy)
    if (m > R) { ox *= R / m; oy *= R / m }
    const edge = Math.min(1, Math.hypot(ox, oy) / R)
    dots.push({
      ox, oy,
      d: brr(b, BRUSH.dot),
      a: brr(b, BRUSH.dotAlpha) * (1 - Math.pow(edge, 1.5))
    })
  }
  return { x, y, c: rgb, sprite: hazeSprite(rgb), R, dots }
}

function addPoints(b, x, y, down) {
  if (!down) { b.prev = null; return }
  if (!b.prev) { b.prev = { x, y }; b.phase = b.phase0 }

  const d = Math.hypot(x - b.prev.x, y - b.prev.y)
  if (d < 0.01) {
    if (BRUSH.holdDots > 0) b.trail.push(makePoint(b, x, y, BRUSH.holdDots))
  } else {
    const steps = Math.max(1, Math.ceil(d / BRUSH.step))
    const inc = d / steps
    for (let i = 1; i <= steps; i++) {
      b.phase += inc / b.gradLen
      b.trail.push(makePoint(
        b,
        b.prev.x + (x - b.prev.x) * i / steps,
        b.prev.y + (y - b.prev.y) * i / steps,
        Math.round(BRUSH.density * inc)
      ))
    }
  }
  b.prev = { x, y }
  if (b.trail.length > BRUSH.maxTrail) b.trail.splice(0, b.trail.length - BRUSH.maxTrail)
}

function stepBrush() {
  for (let k = 0; k < BRUSH.substeps; k++) {
    for (const b of brushes) {
      stepAuto(b)
      b.size += (b.targetSize - b.size) * BRUSH.sizeEase
      addPoints(b, b.ap.x, b.ap.y, b.ap.down)
    }
  }
}

function tailFactor(i, len) {
  if (BRUSH.tailTaper <= 0) return 1
  return easeOut(Math.min(1, i / Math.max(1, len * BRUSH.tailTaper)))
}

function renderSpray() {
  if (!sprayRaster) return
  const ctx = sprayRaster.getContext(true)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, sprayCanvas.width, sprayCanvas.height)

  const vs = p.view.viewSize
  ctx.setTransform(sprayCanvas.width / vs.width, 0, 0, sprayCanvas.height / vs.height, 0, 0)

  for (const b of brushes) {
    const trail = b.trail
    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i]
      const f = tailFactor(i, trail.length)
      const sf = 0.15 + 0.85 * f
      const R = pt.R * sf

      ctx.globalAlpha = f
      ctx.drawImage(pt.sprite, pt.x - R, pt.y - R, R * 2, R * 2)

      if (pt.dots.length) {
        const rgb = pt.c[0] + ',' + pt.c[1] + ',' + pt.c[2]
        ctx.globalAlpha = 1
        for (const dot of pt.dots) {
          ctx.fillStyle = 'rgba(' + rgb + ',' + (dot.a * f / 255) + ')'
          ctx.beginPath()
          ctx.arc(pt.x + dot.ox * sf, pt.y + dot.oy * sf, dot.d / 2, 0, TAU2)
          ctx.fill()
        }
      }
    }
  }
  ctx.globalAlpha = 1
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function applyFrame(f) {

  setAperture(Math.cos(TAU2 * f / APERTURE_PERIOD))
  updateGrid()
  updateCoords(f)
  renderSpray()
  p.view.update()
}

function tick() {
  if (!playing || !interference) return
  frame++
  stepBrush()
  applyFrame(frame)
}

function generate() {
  deleteAllElements()
  arrayOfPaths = []
  frame = 0

  let bg = new p.Path.Rectangle({
    point: [0, 0],
    size: [w, h],
    fillColor: white,
    strokeColor: white
  })
  bg.sendToBack()

  gridGroup = new p.Group()
  gridCells = new Map()
  outers = []

  const size = (Math.min(w, h) - PAD * 2) / 2
  const pos = createVector(w / 2, h / 2)

  interference = new Interference(
    0,
    pos,
    size,
    CUTS,
    size * APERTURE,
    FREQ,
    ROT,
    1
  )
  baseAperture = size * APERTURE
  parts = buildFills(interference)

  let box = null
  for (const part of parts) box = box ? box.unite(part.path.bounds) : part.path.bounds.clone()
  if (box) {
    sprayCenter = { x: box.center.x, y: box.center.y }
    bs.unit = Math.min(box.width, box.height) / 2
  } else {
    sprayCenter = { x: w / 2, y: h / 2 }
    bs.unit = size
  }
  makeOuters()
  resetBrush()
  makeCoords()

  const vs = p.view.viewSize
  sprayCanvas = document.createElement('canvas')
  sprayCanvas.width = Math.round(vs.width)
  sprayCanvas.height = Math.round(vs.height)
  sprayRaster = new p.Raster(sprayCanvas)
  sprayRaster.fitBounds(p.view.bounds)
  sprayRaster.blendMode = SPRAY_BLEND
  sprayRaster.opacity = SPRAY_OPACITY
  sprayRaster.bringToFront()
  if (coordText) coordText.bringToFront()

  applyFrame(0)
}

function kdown(event) {
  if (event.key === 's') {
    save = true
    saveSVG();
    save = false
  }

  if (event.key === 'g') {
    generate();
    updateButtons()
  }

  if (event.key === 'space' || event.key === ' ' || event.key === 'a') {
    togglePlay()
  }
  if (event.key === 'r') {
    resetAnim()
  }
}

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

const PAD = 0.65
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

let bs = { unit: 1 }
let brushes = []

let gridGroup = null
let gridCells = new Map()
let outers = []

let coordText = null
let coordParts = []
let coordNumIdx = []

function computeSize() {
  const canvas = document.getElementById('canvasId')
  const host = canvas.parentElement
  effWidth  = (orientation === "portrait") ? a3Width  : a3Height
  effHeight = (orientation === "portrait") ? a3Height : a3Width

  const ratio = effHeight / effWidth
  const availW = (host && host.clientWidth) || window.innerWidth
  const availH = window.innerHeight * 0.95

  if (availW / availH > effWidth / effHeight) {
    previewH = availH
    previewW = previewH / ratio
  } else {
    previewW = availW
    previewH = previewW * ratio
  }
  w = Math.max(100, Math.floor(previewW))
  h = Math.max(100, Math.floor(previewH))
  scaleFactor = w / a3Width
  drawScale = Math.min(w / wFix, h / hFix)
}

let resizeTimer = null
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    const oldW = w, oldH = h
    computeSize()
    if (Math.abs(w - oldW) < 1 && Math.abs(h - oldH) < 1) return
    p.view.viewSize = new p.Size(w, h)
    generate()
  }, 150)
}

function setup() {
  p = paper
  const canvas = document.getElementById('canvasId')
  computeSize()
  canvas.width = w
  canvas.height = h
  canvas.style.backgroundColor = 'transparent'
  p.setup(canvas)
  const tool = new p.Tool()
  tool.onKeyDown = kdown
  const tokenData = genTokenData(123)
  r = new Random(tokenData)
  white = new p.Color(1)
  black = new p.Color(0.11)
  cols.push(black)

  playing = AUTOPLAY
  generate()

  window.addEventListener('resize', onResize)
  timer = setInterval(tick, 1000 / FPS)
}

function togglePlay() {
  playing = !playing
}

function resetAnim() {
  playing = false
  frame = 0
  resetBrush()
  applyFrame(0)
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
function radians(degrees){var pi = Math.PI;return degrees * (pi/180);}

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

  gridGroup = new p.Group()
  gridCells = new Map()
  outers = []

  const size = Math.min(w, h) * (1 - PAD * 2) / 2
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
  }

  if (event.key === 'space' || event.key === ' ' || event.key === 'a') {
    togglePlay()
  }
  if (event.key === 'r') {
    resetAnim()
  }
}

class Random {
    constructor(o) {
        (this.tokenData = o), (this.useA = !1);
        let e = function (o) {
            let e = parseInt(o.substr(0, 8), 16),
                n = parseInt(o.substr(8, 8), 16),
                r = parseInt(o.substr(16, 8), 16),
                a = parseInt(o.substr(24, 8), 16);
            return function () {
                let o = ((((e |= 0) + (n |= 0)) | 0) + (a |= 0)) | 0;
                return (a = (a + 1) | 0), (e = n ^ (n >>> 9)), (n = ((r |= 0) + (r << 3)) | 0), (r = ((r = (r << 21) | (r >>> 11)) + o) | 0), (o >>> 0) / 4294967296;
            };
        };
        (this.prngA = new e(this.tokenData.hash.substr(2, 32))), (this.prngB = new e(this.tokenData.hash.substr(34, 32)));
        for (let o = 0; o < 1e6; o += 2) this.prngA(), this.prngB();
    }
    random_dec() {
        return (this.useA = !this.useA), this.useA ? this.prngA() : this.prngB();
    }
    random_num(o, e) {
        return o + (e - o) * this.random_dec();
    }
    random_int(o, e) {
        return Math.floor(this.random_num(o, e));
    }
    random_int2(o, e) {
        return Math.floor(this.random_num(o, e + 1));
    }
    random_choice(o) {
        return o[this.random_int2(0, o.length - 1)];
    }
}

class Interference {
  // midRatio: height of the middle band relative to the top/bottom bands
  //   1 = all bands equal, 0.2 = middle band is 20% of the edge bands
  constructor(index, pos, size, cuts, aperture, freq, rot, midRatio = 1) {
    this.position = pos
    this.index = index
    this.size = size
    this.cuts = Math.max(2, Math.round(cuts))   // integer >= 2
    this.aperture = aperture
    this.freq = Math.max(1, Math.round(freq))   // integer >= 1
    this.rot = rot
    this.midRatio = Math.max(0.01, midRatio)

    this.rects = []
    this.bands = []
    this.radii = []
    this.concentrics = []
    this.donuts = []
    this.lines = []
    this.polygons = []

    this.generate()

    this.groupLines = Array.from({ length: this.rects.length }, () => [])

    this.generateLines()
    // Drawing is done by you: displayLines() / transformVertical() /
    // transformGroups() / displayPolygon2()
  }

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------

  // Safe push into the global output array
  output(path) {
    if (typeof arrayOfPaths === 'undefined' || !arrayOfPaths) {
      arrayOfPaths = []
    }
    arrayOfPaths.push(path)
  }

  // Copy a path keeping curve handles
  copyPath(src) {
    let path = new p.Path()
    for (let seg of src.segments) {
      path.add(new p.Segment(
        seg.point.clone(),
        seg.handleIn.clone(),
        seg.handleOut.clone()
      ))
    }
    path.closed = src.closed
    return path
  }

  // Aperture offset for band j (-aperture ... +aperture)
  offsetFor(j, count) {
    return -this.aperture + (this.aperture * 2 * j) / (count - 1)
  }

  // ---------------------------------------------------------------
  // generate(): builds the data (bands, radii, rect paths, circles)
  // ---------------------------------------------------------------
  generate() {
    const start = this.position.y - this.size          // top of the circle
    const totalH = this.size * 2                       // full diameter

    // Band weights: edge bands = 1, middle band = midRatio, linear in between
    const half = (this.cuts - 1) / 2
    const weights = []
    for (let i = 0; i < this.cuts; i++) {
      const t = Math.abs(i - half) / half              // 0 at the center ... 1 at the ends
      weights.push(this.midRatio + (1 - this.midRatio) * t)
    }
    const weightSum = weights.reduce((a, b) => a + b, 0)

    // Horizontal bands that tile the full diameter exactly
    let y0 = start
    for (let i = 0; i < this.cuts; i++) {
      const bandH = totalH * weights[i] / weightSum
      const y1 = y0 + bandH
      this.bands.push({ y0, y1 })

      // kept because transformGroups() uses this.rects[j].bounds
      const rect = new p.Path.Rectangle(
        createVector(this.position.x - this.size * 2, y0),
        this.size * 3,
        bandH
      )
      this.rects.push(rect)
      rect.remove()

      y0 = y1
    }

    // Radii of the concentric circles, OUTER FIRST (index 0 = biggest)
    const amp = this.size / this.freq
    for (let i = 0; i <= this.freq; i++) {
      this.radii.push(this.size - amp * i)
    }

    // Full circles, inner -> outer (same order as the original code)
    for (let i = this.radii.length - 1; i >= 0; i--) {
      const ccc = createCircle(this.position, this.radii[i], null, null)
      this.concentrics.push(ccc)
      ccc.remove()
    }

    // Rings (used by generatePolygons)
    const reverse = reverseArray(this.concentrics)
    for (let i = 0; i < reverse.length - 1; i++) {
      const nPath = reverse[i].subtract(reverse[i + 1])
      this.donuts.push(nPath)
      nPath.remove()
    }
  }

  // ---------------------------------------------------------------
  // generateLines(): for every band j and every circle i keep ONLY
  // the part of the circle that lies inside the band (open arcs).
  // ---------------------------------------------------------------
  generateLines() {
    const cx = this.position.x
    const cy = this.position.y

    for (let j = 0; j < this.bands.length; j++) {
      const { y0, y1 } = this.bands[j]

      for (let i = 0; i < this.radii.length; i++) {
        const R = this.radii[i]
        if (R <= 1e-6) continue                       // radius 0 = a point

        for (const arc of this.arcsInBand(cx, cy, R, y0, y1)) {
          arc.remove()                                // keep it off the canvas
          const obj = { polygon: arc, index: i, file: j }
          this.lines.push(obj)
          this.groupLines[j].push(obj)
        }
      }
    }
  }

  // Exact intersection of circle (cx, cy, R) with the band y0..y1.
  // Circle: x = cx + R cos(a), y = cy + R sin(a). The band keeps the
  // angles where  s0 <= sin(a) <= s1.
  arcsInBand(cx, cy, R, y0, y1) {
    const EPS = 1e-9
    const s0 = (y0 - cy) / R
    const s1 = (y1 - cy) / R

    // band completely above or below the circle
    if (s0 >= 1 - EPS || s1 <= -1 + EPS) return []

    const hasTop = s0 <= -1 + EPS       // band contains the circle's top
    const hasBottom = s1 >= 1 - EPS     // band contains the circle's bottom

    const clamp = v => Math.max(-1, Math.min(1, v))
    const a0 = Math.asin(clamp(s0))
    const a1 = Math.asin(clamp(s1))

    const pt = a => new p.Point(cx + R * Math.cos(a), cy + R * Math.sin(a))
    const arc = (from, to) =>
      new p.Path.Arc(pt(from), pt((from + to) / 2), pt(to))

    // whole circle inside the band
    if (hasTop && hasBottom) {
      return [new p.Path.Circle(new p.Point(cx, cy), R)]
    }

    // contains the bottom: right side -> bottom -> left side
    if (hasBottom) {
      return [arc(a0, Math.PI - a0)]
    }

    // contains the top: left side -> top -> right side
    if (hasTop) {
      return [arc(Math.PI - a1, 2 * Math.PI + a1)]
    }

    // only crosses the sides: two arcs (right and left)
    if (a1 - a0 < 1e-6) return []
    return [
      arc(a0, a1),                          // right
      arc(Math.PI - a1, Math.PI - a0)       // left
    ]
  }

  // ---------------------------------------------------------------
  // optional polygon (filled) version
  // ---------------------------------------------------------------
  generatePolygons() {
    for (let j = 0; j < this.rects.length; j++) {
      for (let i = 0; i < this.donuts.length; i++) {
        let offset = this.offsetFor(j, this.rects.length)
        let isMid = j == Math.floor(this.rects.length / 2)

        let nPath = this.rects[j].intersect(this.donuts[i])
        if (!nPath) continue

        if (nPath instanceof p.CompoundPath) {
          let g1 = extractPathsFromCompound(nPath)
          for (let ggg of g1.children) {
            if (!isMid) ggg.position.x += offset
            this.polygons.push({ polygon: ggg, index: i, file: j })
          }
        } else {
          if (!isMid) nPath.position.x += offset
          this.polygons.push({ polygon: nPath, index: i, file: j })
        }
      }
    }
  }

  displayPolygon2() {
    let sourceCircle = this.concentrics[this.concentrics.length - 1]
    if (!sourceCircle) return

    for (let j = 0; j < this.rects.length; j++) {
      let offset = this.offsetFor(j, this.rects.length)

      let circle = sourceCircle.clone()
      let result = this.rects[j].clone({ insert: false }).intersect(circle)
      circle.remove()

      if (!result) continue

      let sources = (result instanceof p.CompoundPath) ? [...result.children] : [result]

      for (let src of sources) {
        if (!src.segments || src.segments.length == 0) continue
        let poly = this.copyPath(src)
        poly.closed = true
        poly.position.x += offset * 2
        poly.position.y += offset * 2
        poly.strokeColor = black
        poly.fillColor = white
        this.output(poly)
      }

      result.remove()
    }
  }

  displayPolygon() {
    let off = r.random_num(0, 10)
    let colsB = [black, white]

    for (let finalPath of this.polygons) {
      finalPath.polygon.strokeColor = null

      let idx = Math.floor(
        finalPath.file * r.random_num(0.2, 1) +
        Math.sin(radians(finalPath.file + finalPath.index / 5 + off / 2)) +
        Math.cos(radians(finalPath.index * 50 + off))
      )
      let ccc = colsB[((idx % 2) + 2) % 2]   // avoid negative index

      if (ccc == colsB[0]) {
        finalPath.polygon.fillColor = null
        finalPath.polygon.strokeColor = new p.Color(0)
        this.output(finalPath.polygon)
      }
    }
  }

  // ---------------------------------------------------------------
  // display: each band's arcs are shifted horizontally by the aperture
  // ---------------------------------------------------------------
  displayLines() {
    let mid = Math.floor(this.rects.length / 2)

    for (let j = 0; j < this.groupLines.length; j++) {
      let offset = (j == mid) ? 0 : this.offsetFor(j, this.rects.length)

      for (let finalPath of this.groupLines[j]) {
        let src = finalPath.polygon
        if (!src || !src.segments || src.segments.length == 0) continue

        let path = this.copyPath(src)
        path.position.x += offset
        
        if (this.rot) {
          path.rotate(this.rot, this.position)
        }

        path.strokeColor = black
        path.fillColor = null
        path.strokeWidth=5
        this.output(path)
      }
    }
  }
  // ---------------------------------------------------------------
  // 3D: the figure lies on the FLOOR of an isometric-style view.
  // Rotate it around the vertical axis (yaw), tilt the floor towards
  // the viewer (tilt), project to 2D, then extrude every arc along a
  // direction on the screen and close it into a NEW polygon.
  //
  //   yawDeg         rotation of the floor around the vertical axis (45 = isometric)
  //   tiltDeg        camera elevation over the floor:
  //                  90 = seen from above (flat), 35.264 = true isometric,
  //                  30 = 2:1 "game" isometric
  //   perspective    0 = orthographic, small values (0.001 ~ 0.003) add depth
  //   bottomY        canvas y where the extrusion stops (only used when
  //                  extrudeLength is null)
  //   fill           fill the polygons with `white` so later ones hide earlier ones
  //   bottomLast     true  = the pieces farthest along the extrusion direction
  //                          are drawn LAST (on top); false = opposite order
  //   extrudeAngle   direction of the extrusion on the screen, in degrees
  //                  (y points down): 90 = straight down, 45 = down-right,
  //                  135 = down-left, 0 = right, 180 = left
  //   extrudeLength  fixed extrusion length in px (the polygon is the arc, plus
  //                  the arc moved by that length)
  //                  null = extrude until the flat line y = bottomY
  //   gradient       color every polygon by the concentric circle it belongs to:
  //                  outermost circle = black ... innermost = white (needs fill = true).
  //                  All pieces of the same circle get exactly the same color
  //   gradientFlip   true = innermost black ... outermost white
  //   fade           true = inside every polygon the ring color fades to white, from
  //                  the top of the polygon to its bottom (needs gradient = true)
  // ---------------------------------------------------------------
  displayExtruded(yawDeg = 45, tiltDeg = 35.264, perspective = 0, bottomY = null,
                  fill = true, bottomLast = true, extrudeAngle = 90, extrudeLength = null,
                  gradient = false, gradientFlip = false, fade = true) {
    const cx = this.position.x
    const cy = this.position.y
    if (bottomY === null) bottomY = cy + this.size * 1.5

    const yaw = yawDeg * Math.PI / 180
    const tilt = tiltDeg * Math.PI / 180
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    const sinT = Math.sin(tilt)
    const cosT = Math.cos(tilt)
    const mid = Math.floor(this.rects.length / 2)

    // extrusion direction on screen, and the axis perpendicular to it
    const ea = extrudeAngle * Math.PI / 180
    const dirX = Math.cos(ea)
    const dirY = Math.sin(ea)
    const perpX = -dirY
    const perpY = dirX

    // until the flat bottom line (needs a direction that goes downwards),
    // otherwise a fixed length
    const toBottom = extrudeLength === null && dirY > 1e-6
    const L = (extrudeLength === null) ? this.size : extrudeLength

    // figure (x, y) -> floor (u = X, v = Z) -> yaw -> tilt -> screen
    const project = (x, y) => {
      const u = x - cx
      const v = y - cy
      const X1 = u * cosY + v * sinY
      const Z1 = -u * sinY + v * cosY          // > 0 = closer to the viewer
      const away = -Z1 * cosT                  // > 0 = farther from the viewer
      const f = 1 / (1 + perspective * away)   // perspective scale
      return { X: cx + X1 * f, Y: cy + Z1 * sinT * f, f, z: away }
    }

    // 1) sample + project every arc (with its aperture offset applied)
    const items = []

    const addItem = (pts, closed, index) => {
      if (!closed && pts.length < 2) return

      // s = position ACROSS the extrusion direction, u = position ALONG it
      const S = pts.map(q => q.X * perpX + q.Y * perpY)
      const U = pts.map(q => q.X * dirX + q.Y * dirY)
      let sum = 0
      for (const u of U) sum += u

      if (!closed && S[0] > S[S.length - 1]) {   // make S ascending
        S.reverse()
        U.reverse()
      }

      items.push({
        pts,
        closed,
        index,                               // 0 = outermost circle
        S,
        U,
        sMin: Math.min(...S),
        sMax: Math.max(...S),
        key: sum / pts.length                // mean position along the extrusion direction
      })
    }

    for (let j = 0; j < this.groupLines.length; j++) {
      const offset = (j == mid) ? 0 : this.offsetFor(j, this.rects.length)

      for (const finalPath of this.groupLines[j]) {
        const src = finalPath.polygon
        if (!src || !src.segments || src.segments.length == 0) continue

        const len = src.length
        if (!len) continue

        const n = Math.max(8, Math.ceil(len / 3))
        const count = src.closed ? n : n + 1
        const pts = []

        for (let k = 0; k < count; k++) {
          const pt = src.getPointAt(Math.min(len, (len * k) / n))
          if (!pt) continue
          pts.push(project(pt.x + offset, pt.y))
        }
        if (pts.length < 2) continue

        // full circles have no first/last point: outline only
        if (src.closed) {
          addItem(pts, true, finalPath.index)
          continue
        }

        // An arc can fold back on itself when measured ACROSS the extrusion
        // direction. Extruding a folded arc as one polygon makes the edges cross
        // the polygon itself, so cut the arc wherever that coordinate reverses.
        // Every piece is then a simple "curtain" that can be extruded safely.
        let start = 0
        let dir = 0
        for (let k = 1; k < pts.length; k++) {
          const ds = (pts[k].X - pts[k - 1].X) * perpX + (pts[k].Y - pts[k - 1].Y) * perpY
          if (Math.abs(ds) < 1e-6) continue
          const d = ds > 0 ? 1 : -1
          if (dir !== 0 && d !== dir) {
            addItem(pts.slice(start, k), false, finalPath.index)   // start .. k-1
            start = k - 1                                          // shared turning point
          }
          dir = d
        }
        addItem(pts.slice(start), false, finalPath.index)
      }
    }

    // highest circle index that actually has pieces (used for the color ramp)
    const maxIndex = items.reduce((m, it) => Math.max(m, it.index), 0)

    // 2) draw order: compare pieces pairwise where they overlap (see orderPieces)
    //    so that a piece is always drawn AFTER every piece it is in front of.
    //    For a straight-down extrusion: the lower piece (nearer) goes on top.
    const ordered = this.orderPieces(items, bottomLast)

    // 3) build the polygons
    for (const it of ordered) {
      const pts = it.pts
      const poly = new p.Path()
      for (const q of pts) poly.add(new p.Point(q.X, q.Y))

      if (it.closed) {
        // full circles: just the projected outline
        poly.closed = true
        poly.fillColor = null
      } else if (toBottom) {
        // slide the first and last point along the direction until y = bottom
        const endOf = q => {
          const targetY = cy + (bottomY - cy) * q.f
          const t = (targetY - q.Y) / dirY
          return new p.Point(q.X + dirX * t, targetY)
        }
        poly.add(endOf(pts[pts.length - 1]))
        poly.add(endOf(pts[0]))
        poly.closed = true
        poly.fillColor = fill ? white : null
      } else {
        // fixed length: go back along the arc moved by (dir * L)
        for (let k = pts.length - 1; k >= 0; k--) {
          poly.add(new p.Point(pts[k].X + dirX * L, pts[k].Y + dirY * L))
        }
        poly.closed = true
        poly.fillColor = fill ? white : null
      }

      if (!it.closed && fill && gradient) {
        const ring = this.ringColor(it.index, maxIndex, gradientFlip)

        if (fade) {
          // ring color at the top of the polygon -> white at its bottom
          const b = poly.bounds
          poly.fillColor = new p.Color({
            gradient: { stops: [ring, white] },
            origin: new p.Point(b.center.x, b.top),
            destination: new p.Point(b.center.x, b.bottom)
          })
        } else {
          poly.fillColor = ring
        }
      }

      poly.strokeColor = black
      poly.strokeWidth = 0
      this.output(poly)
    }
  }

  // Color of a concentric circle: index 0 (outermost) = black ... last (innermost) = white.
  // Every piece of the same circle gets exactly the same color.
  ringColor(index, maxIndex, flip = false) {
    let t = maxIndex > 0 ? index / maxIndex : 0
    if (flip) t = 1 - t

    const a = black.convert('rgb')
    const b = white.convert('rgb')
    return new p.Color(
      a.red + (b.red - a.red) * t,
      a.green + (b.green - a.green) * t,
      a.blue + (b.blue - a.blue) * t
    )
  }

  // Draw order for the extruded pieces.
  // Every piece is a "curtain": measured across the extrusion direction (s) it is a
  // function u(s), where u is the position along the extrusion direction.
  // Where two pieces overlap in s, the one with the larger u (further along the
  // extrusion direction) is in FRONT, so it must be drawn after the other.
  // That gives a partial order, solved with a topological sort. Ties (and the very
  // rare cycles) fall back to the mean position `key`.
  orderPieces(items, bottomLast = true) {
    const n = items.length
    const sign = bottomLast ? 1 : -1

    // u at position s (linear interpolation; S is ascending)
    const at = (pc, s) => {
      const S = pc.S
      const U = pc.U
      let lo = 0
      let hi = S.length - 1
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1
        if (S[m] <= s) lo = m
        else hi = m
      }
      const ds = S[hi] - S[lo]
      if (ds < 1e-9) return U[lo]
      return U[lo] + (U[hi] - U[lo]) * ((s - S[lo]) / ds)
    }

    const out = Array.from({ length: n }, () => [])   // out[a] = pieces drawn after a
    const indeg = new Array(n).fill(0)

    for (let a = 0; a < n; a++) {
      const A = items[a]
      if (A.closed) continue

      for (let b = a + 1; b < n; b++) {
        const B = items[b]
        if (B.closed) continue

        const lo = Math.max(A.sMin, B.sMin)
        const hi = Math.min(A.sMax, B.sMax)
        if (hi - lo < 0.5) continue                   // (almost) no overlap

        let d = 0
        for (const t of [0.2, 0.5, 0.8]) {
          const s = lo + (hi - lo) * t
          d += at(B, s) - at(A, s)                    // > 0: B is in front of A
        }
        if (Math.abs(d) < 1e-6) continue

        if (d * sign > 0) { out[a].push(b); indeg[b]++ }
        else { out[b].push(a); indeg[a]++ }
      }
    }

    const placed = new Array(n).fill(false)
    const ready = []
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i)

    const result = []
    while (result.length < n) {
      let pick = -1

      if (ready.length > 0) {
        // smallest key first (largest if bottomLast is false)
        let bi = 0
        for (let k = 1; k < ready.length; k++) {
          if (sign * items[ready[k]].key < sign * items[ready[bi]].key) bi = k
        }
        pick = ready[bi]
        ready.splice(bi, 1)
      } else {
        // cycle: force the unplaced piece with the smallest key
        for (let i = 0; i < n; i++) {
          if (placed[i]) continue
          if (pick === -1 || sign * items[i].key < sign * items[pick].key) pick = i
        }
      }

      if (placed[pick]) continue
      placed[pick] = true
      result.push(items[pick])

      for (const y of out[pick]) {
        if (placed[y]) continue
        indeg[y]--
        if (indeg[y] === 0) ready.push(y)
      }
    }

    return result
  }

  transformVertical() {
    let mid = Math.floor(this.rects.length / 2)

    for (let j = 0; j < this.groupLines.length; j++) {
      let offset = (j == mid) ? 0 : this.offsetFor(j, this.rects.length)

      for (let finalPath of this.groupLines[j]) {
        let src = finalPath.polygon
        if (!src || !src.segments || src.segments.length == 0) continue

        let path = this.copyPath(src)
        path.position.y += offset
        path.rotate(270, this.position)
        path.strokeColor = black
        path.fillColor = null

        finalPath.rendered = path
        this.output(path)
      }
    }
  }

  transformGroups() {
    this.groupTransforms = []

    let placed = []
    let pad = 5

    let order = [...Array(this.groupLines.length).keys()]
    order.sort((a, b) => this.rects[b].bounds.area - this.rects[a].bounds.area)

    for (let j of order) {
      let baseRect = this.rects[j]
      let success = false
      let tries = 0
      let tx = baseRect.bounds.center.x
      let ty = baseRect.bounds.center.y
      let ang = 0

      while (!success && tries < 3000) {
        ang = r.random_num(0, 360)

        let candidate = baseRect.clone()
        candidate.rotate(ang)

        let bw = candidate.bounds.width
        let bh = candidate.bounds.height

        tx = r.random_num(pad + bw / 2, w - pad - bw / 2)
        ty = r.random_num(pad + bh / 2, h - pad - bh / 2)

        candidate.position = new p.Point(tx, ty)
        candidate.scale(
          (candidate.bounds.width + pad) / candidate.bounds.width,
          (candidate.bounds.height + pad) / candidate.bounds.height
        )

        let b = candidate.bounds
        let outside = b.left < pad || b.right > w - pad || b.top < pad || b.bottom > h - pad

        let collide = false
        if (!outside) {
          for (let other of placed) {
            if (
              candidate.intersects(other) ||
              candidate.contains(other.bounds.center) ||
              other.contains(candidate.bounds.center)
            ) {
              collide = true
              break
            }
          }
        }

        if (!outside && !collide) {
          success = true
          placed.push(candidate)   // kept for collision checks
        } else {
          candidate.remove()
        }
        tries++
      }

      this.groupTransforms[j] = success
        ? { x: tx, y: ty, rot: ang }
        : { x: baseRect.bounds.center.x, y: baseRect.bounds.center.y, rot: 0 }
    }

    // placed rects were only for collision tests
    placed.forEach(pl => pl.remove())

    for (let j = 0; j < this.groupLines.length; j++) {
      let t = this.groupTransforms[j]
      if (!t) continue

      let oldCenter = this.rects[j].bounds.center
      let newCenter = new p.Point(t.x, t.y)

      for (let finalPath of this.groupLines[j]) {
        let src = finalPath.polygon
        if (!src || !src.segments || src.segments.length == 0) continue

        let path = this.copyPath(src)
        path.position = path.position.subtract(oldCenter).add(newCenter)
        path.rotate(t.rot, newCenter)
        path.strokeColor = black
        path.fillColor = null

        finalPath.rendered = path
        this.output(path)
      }
    }
  }
}

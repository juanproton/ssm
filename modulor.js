const PIXELS_PER_CM = 50; 
const SUBDIVISIONS = 36; 

// Grid Patterns
const PATTERN_1 = [0.86, 0.54]; // Primary Modulor
const PATTERN_2 = [0.20];       // Secondary Grid (20cm)
const CONST_THICKNESS = 0.05 * PIXELS_PER_CM; 

let camDist = 800; 
let mergedCoords = []; 
let vertices3D = [];
let gridLinesPrimary = [];   
let gridLinesSecondary = []; 
let planes = []; 

let startV = null; 
let currentV = null; 
let isDragging = false;
let isMovingPlane = false;
let selectedPlane = null;
let showFullGrid = true; 
let isAutoRotating = false;
let isCenitalView = false;
let isFPV = false; 

let character; 
let pane;
let paneParams = { 
  firstPerson: false,
  orientation: 'WALL', 
  wallBlocks: 10,      
  wallDepth: 0,        // START BY STANDARD THICKNESS (Index 2 = 20cm)
  elevation: 0,
  showSecondary: true, 
  moveX: 0,
  moveZ: 0,
  boundaryX: 15, 
  boundaryZ: 11,
  rotation: 45
}; 

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  generateGridData(); 
  character = new Character();
  setupGui();
  loadStateFromUrl(); // Now restores camera pos and grid visibility too
}

function draw() {
  background(255);

  let xLimit = getPrimaryGridDist(paneParams.boundaryX);
  let zLimit = getPrimaryGridDist(paneParams.boundaryZ);
  let centerX = xLimit / 2;
  let centerZ = zLimit / 2;

  if (isFPV) {
    character.update();
  } else if (isAutoRotating) {
    paneParams.rotation = (paneParams.rotation + 0.2) % 360; 
    pane.refresh(); 
  }

  // Camera Logic
  if (isFPV) {
    character.applyCamera();
  } else if (isCenitalView) {
    camera(centerX, -camDist, centerZ, centerX, 0, centerZ, 0, 0, -1);
  } else {
    let rad = radians(paneParams.rotation);
    let camX = centerX + camDist * cos(rad);
    let camZ = centerZ + camDist * sin(rad);
    let camY = -camDist * 0.8;
    camera(camX, camY, camZ, centerX, 0, centerZ, 0, 1, 0);
  }
 
  let targetElev = (isMovingPlane && selectedPlane) ? selectedPlane.elevBlocks : paneParams.elevation;
  currentV = (isMouseOverGui() || isFPV) ? null : getClosestVertex(xLimit, zLimit, targetElev);
  
  push();
  let drawY = -getGridDist(paneParams.elevation);

  renderGridSubset(gridLinesPrimary, drawY, xLimit, zLimit);
  if (paneParams.showSecondary) renderGridSubset(gridLinesSecondary, drawY, xLimit, zLimit);

  // Planes are rendered independently of limits to ensure they are never "cut"
  for (let p of planes) p.display();
  if (!isFPV) character.display();

  if (isDragging && startV && currentV) {
    let previewPlane = new GridPlane(startV, currentV);
    previewPlane.display(true); 
  }

  // Red Boundary (Visual only)
  stroke(255, 0, 0); strokeWeight(3); noFill();
  beginShape();
  vertex(0, 0, 0); vertex(xLimit, 0, 0);
  vertex(xLimit, 0, zLimit); vertex(0, 0, zLimit);
  endShape(CLOSE);

  drawUI();
  pop(); 

  if (isMovingPlane && selectedPlane && currentV && startV) {
    if (!currentV.equals(startV)) {
      let dx = currentV.x - startV.x;
      let dz = currentV.z - startV.z;
      selectedPlane.p1.add(dx, 0, dz);
      selectedPlane.p2.add(dx, 0, dz);
      selectedPlane.updateBounds();
      startV = currentV.copy();
      syncMoveSliders();
    }
  }
}

// --- UPDATED STATE MANAGEMENT (Captures Everything) ---

function saveStateToUrl() {
  const state = {
    p: planes.map(p => ({
      x1: findGridIndex(p.p1.x), z1: findGridIndex(p.p1.z),
      x2: findGridIndex(p.p2.x), z2: findGridIndex(p.p2.z),
      t: p.type === 'WALL' ? 1 : 0, h: p.numBlocks, d: p.depthBlocks, e: p.elevBlocks
    })),
    s: {
      bx: paneParams.boundaryX, bz: paneParams.boundaryZ,
      rt: Math.round(paneParams.rotation), sc: paneParams.showSecondary,
      gr: showFullGrid, fp: isFPV
    },
    c: { // Camera Position & Rotation
      x: character.pos.x, z: character.pos.z,
      yw: character.yaw, pt: character.pitch
    }
  };
  const encoded = btoa(JSON.stringify(state));
  window.history.replaceState(null, null, "#" + encoded);
}

function loadStateFromUrl() {
  const hash = window.location.hash.substring(1);
  if (!hash) return;
  try {
    const decoded = JSON.parse(atob(hash));
    // Restore System Settings
    paneParams.boundaryX = decoded.s.bx;
    paneParams.boundaryZ = decoded.s.bz;
    paneParams.rotation = decoded.s.rt;
    paneParams.showSecondary = decoded.s.sc;
    showFullGrid = (decoded.s.gr !== undefined) ? decoded.s.gr : true;
    isFPV = (decoded.s.fp !== undefined) ? decoded.s.fp : false;
    paneParams.firstPerson = isFPV;

    // Restore Camera
    if (decoded.c) {
      character.pos.set(decoded.c.x, 0, decoded.c.z);
      character.yaw = decoded.c.yw;
      character.pitch = decoded.c.pt;
    }

    // Restore Planes
    planes = decoded.p.map(pd => {
      let v1 = createVector(getGridDist(pd.x1), 0, getGridDist(pd.z1));
      let v2 = createVector(getGridDist(pd.x2), 0, getGridDist(pd.z2));
      let oldType = paneParams.orientation;
      let oldH = paneParams.wallBlocks;
      let oldD = paneParams.wallDepth;
      let oldE = paneParams.elevation;

      paneParams.orientation = pd.t === 1 ? 'WALL' : 'FLOOR';
      paneParams.wallBlocks = pd.h;
      paneParams.wallDepth = pd.d;
      paneParams.elevation = pd.e;
      let p = new GridPlane(v1, v2);

      paneParams.orientation = oldType;
      paneParams.wallBlocks = oldH;
      paneParams.wallDepth = oldD;
      paneParams.elevation = oldE;
      return p;
    });
    pane.refresh();
  } catch (e) { console.warn("Load failed or hash empty."); }
}

// --- COLLISION & IMPROVED SELECTION ---

class GridPlane {
  constructor(v1, v2) {
    this.p1 = v1.copy(); 
    this.p2 = v2.copy();
    this.type = paneParams.orientation;
    this.numBlocks = paneParams.wallBlocks; 
    this.depthBlocks = paneParams.wallDepth; 
    this.elevBlocks = paneParams.elevation; 
    this.isSelected = false;
    this.updateBounds();
  }
  updateBounds() {
    this.w = abs(this.p1.x - this.p2.x);
    this.d = abs(this.p1.z - this.p2.z);
    this.centerX = (this.p1.x + this.p2.x) / 2;
    this.centerZ = (this.p1.z + this.p2.z) / 2;
    this.wallAxis = (this.w > this.d) ? 'X' : 'Z';

    // Physical AABB for Collision
    let h = (this.type === 'WALL') ? getGridDist(this.numBlocks) : CONST_THICKNESS;
    let t = (this.type === 'WALL') ? getGridDist(this.depthBlocks) : CONST_THICKNESS;
    let yBase = this.getYPos();
    
    if (this.type === 'WALL') {
      if (this.wallAxis === 'X') {
        this.minX = min(this.p1.x, this.p2.x); this.maxX = max(this.p1.x, this.p2.x);
        this.minZ = this.p1.z; this.maxZ = this.p1.z + t;
      } else {
        this.minX = this.p1.x; this.maxX = this.p1.x + t;
        this.minZ = min(this.p1.z, this.p2.z); this.maxZ = max(this.p1.z, this.p2.z);
      }
      this.minY = yBase - h; this.maxY = yBase;
    } else {
      this.minX = min(this.p1.x, this.p2.x); this.maxX = max(this.p1.x, this.p2.x);
      this.minZ = min(this.p1.z, this.p2.z); this.maxZ = max(this.p1.z, this.p2.z);
      this.minY = yBase - CONST_THICKNESS; this.maxY = yBase;
    }
  }
  getYPos() { return -getGridDist(this.elevBlocks); }
  display(isPreview = false) {
    push();
    let yPos = this.getYPos();
    let wallH = (this.type === 'WALL') ? getGridDist(this.numBlocks) : CONST_THICKNESS;
    let thickness = (this.type === 'WALL') ? getGridDist(this.depthBlocks) : CONST_THICKNESS;
    let halfThick = thickness / 2;
    if (this.type === 'WALL') {
      if (this.wallAxis === 'X') {
        translate(this.centerX, yPos - wallH/2, this.p1.z + halfThick);
        this.drawBox(this.w, wallH, thickness, isPreview);
      } else {
        translate(this.p1.x + halfThick, yPos - wallH/2, this.centerZ);
        this.drawBox(thickness, wallH, this.d, isPreview);
      }
    } else {
      translate(this.centerX, yPos - (CONST_THICKNESS/2), this.centerZ);
      this.drawBox(this.w, CONST_THICKNESS, this.d, isPreview);
    }
    pop();
  }
  drawBox(bw, bh, bd, isPreview) {
    if (isPreview) { fill(100, 150, 255, 100); stroke(100, 150, 255); } 
    else {
      if (this.isSelected) { fill(255, 200, 0, 180); stroke(255, 100, 0); strokeWeight(2); } 
      else { fill(230, 230, 245, 180); stroke(50); strokeWeight(1); }
    }
    box(max(bw, 2), bh, max(bd, 2));
  }
}

// --- SOLID CHARACTER ---

class Character {
  constructor() {
    this.pos = createVector(getGridDist(10), 0, getGridDist(10));
    this.yaw = 0; this.pitch = 0; 
    this.fullHeight = 2.23 * PIXELS_PER_CM;
    this.eyeHeight = 1.80 * PIXELS_PER_CM;
    this.radius = 15;
    this.speed = 3.5; this.sensitivity = 0.005;
  }
  update() {
    if (mouseIsPressed && !isMouseOverGui()) {
      this.yaw += movedX * this.sensitivity;
      this.pitch += movedY * this.sensitivity;
      this.pitch = constrain(this.pitch, -HALF_PI + 0.01, HALF_PI - 0.01);
      saveStateToUrl();
    }
    let f = createVector(sin(this.yaw), 0, cos(this.yaw));
    let r = createVector(sin(this.yaw + HALF_PI), 0, cos(this.yaw + HALF_PI));
    let move = createVector(0,0,0);
    if (keyIsDown(87)) move.add(f); 
    if (keyIsDown(83)) move.sub(f); 
    if (keyIsDown(65)) move.add(r);   
    if (keyIsDown(68)) move.sub(r);

    if (move.mag() > 0) {
      move.normalize().mult(this.speed);
      // X Movement + Collision
      let nextX = createVector(this.pos.x + move.x, 0, this.pos.z);
      if (!this.checkWallCollision(nextX)) this.pos.x = nextX.x;
      // Z Movement + Collision
      let nextZ = createVector(this.pos.x, 0, this.pos.z + move.z);
      if (!this.checkWallCollision(nextZ)) this.pos.z = nextZ.z;
      saveStateToUrl();
    }
  }
  checkWallCollision(p) {
    for (let plane of planes) {
      let headY = -this.eyeHeight;
      if (footY > plane.minY && headY < plane.maxY) { // Vertical Check
        if (p.x + this.radius > plane.minX && p.x - this.radius < plane.maxX &&
            p.z + this.radius > plane.minZ && p.z - this.radius < plane.maxZ) {
          return true;
        }
      }
    }
    return false;
  }
  applyCamera() {
    let lookAt = createVector(this.pos.x + sin(this.yaw) * cos(this.pitch), -this.eyeHeight + sin(this.pitch), this.pos.z + cos(this.yaw) * cos(this.pitch));
    camera(this.pos.x, -this.eyeHeight, this.pos.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);
  }
  display() {
    push(); translate(this.pos.x, -this.fullHeight / 2, this.pos.z); rotateY(this.yaw);
    fill(0, 100, 255, 200); stroke(0, 50, 150); box(this.radius*2, this.fullHeight, this.radius*2); pop();
  }
}
let footY = 0; // Reference for collision floor level

// --- UI & INTERACTION ---

function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV; paneParams.firstPerson = isFPV;
    if (isFPV) requestPointerLock(); else exitPointerLock();
    saveStateToUrl(); pane.refresh();
  }
  if (key === 'h' || key === 'H') { showFullGrid = !showFullGrid; saveStateToUrl(); }
  if ((keyCode === DELETE || keyCode === BACKSPACE) && selectedPlane) {
    planes.splice(planes.indexOf(selectedPlane), 1);
    selectedPlane = null; saveStateToUrl();
  }
  if (key === 'c' || key === 'C') isCenitalView = !isCenitalView;
}

function mousePressed() {
  if (isMouseOverGui() || isFPV) return;
  if (!keyIsDown(SHIFT)) {
    // Improved selection: Check 3 points on the plane "spine"
    let clicked = null; let minDist = 45;
    for (let p of planes) {
      let pts = [{x: p.p1.x, z: p.p1.z}, {x: p.centerX, z: p.centerZ}, {x: p.p2.x, z: p.p2.z}];
      for (let pt of pts) {
        let sPos = getManualScreenPos(pt.x, p.getYPos(), pt.z);
        let d = dist(mouseX, mouseY, sPos.x, sPos.y);
        if (d < minDist) { minDist = d; clicked = p; }
      }
    }
    if (clicked) {
      if (selectedPlane === clicked && currentV) { isMovingPlane = true; startV = currentV.copy(); }
      else { selectPlane(clicked); } return;
    } else { deselectAll(); }
  }
  if (keyIsDown(SHIFT) && currentV) { startV = currentV.copy(); isDragging = true; }
}

function setupGui() {
  pane = new Tweakpane.Pane({ title: 'MODULOR SOLID' });
  const proj = pane.addFolder({ title: 'PROJECT' });
  proj.addButton({ title: 'Copy Share Link' }).on('click', async () => {
    saveStateToUrl();
    await navigator.clipboard.writeText(window.location.href);
    alert("Full State URL Copied!");
  });

  pane.addInput(paneParams, 'firstPerson', { label: 'Walk Mode (V)' }).on('change', (ev)=> { isFPV = ev.value; saveStateToUrl(); });
  
  const tool = pane.addFolder({ title: 'TOOL SETTINGS' });
  tool.addInput(paneParams, 'orientation', { options: { Floor: 'FLOOR', Wall: 'WALL' }, label: 'Type' });
  tool.addInput(paneParams, 'wallBlocks', { min: 1, max: 80, step: 1, label: 'Height' })
    .on('change', (ev) => { if (selectedPlane) { selectedPlane.numBlocks = ev.value; selectedPlane.updateBounds(); saveStateToUrl(); } });
  tool.addInput(paneParams, 'wallDepth', { min: 0, max: 20, step: 1, label: 'Thickness' })
    .on('change', (ev) => { if (selectedPlane) { selectedPlane.depthBlocks = ev.value; selectedPlane.updateBounds(); saveStateToUrl(); } });

  const pos = pane.addFolder({ title: 'POSITION' });
  pos.addInput(paneParams, 'moveX', { min: 0, max: 100, step: 1, label: 'X Index' }).on('change', (ev) => { movePlaneToGrid('x', ev.value); saveStateToUrl(); });
  pos.addInput(paneParams, 'elevation', { min: 0, max: 100, step: 1, label: 'Elevation' }).on('change', (ev) => { if (selectedPlane) { selectedPlane.elevBlocks = ev.value; selectedPlane.updateBounds(); saveStateToUrl(); } });
  pos.addInput(paneParams, 'moveZ', { min: 0, max: 100, step: 1, label: 'Z Index' }).on('change', (ev) => { movePlaneToGrid('z', ev.value); saveStateToUrl(); });
  
  pane.addInput(paneParams, 'showSecondary', { label: '20cm Grid' }).on('change', saveStateToUrl);
  pane.addInput(paneParams, 'rotation', { min: 0, max: 360, step: 1, label: 'Orbit' }).on('change', saveStateToUrl);

  const help = pane.addFolder({ title: 'HELP / CONTROLS', expanded: false });
  help.addMonitor({text: 'SHIFT + Drag'}, 'text', {label: 'Draw Plane'});
  help.addMonitor({text: 'WASD Keys'}, 'text', {label: 'Walk'});
  help.addMonitor({text: 'Key [V]'}, 'text', {label: 'First Person'});
  help.addMonitor({text: 'Key [H]'}, 'text', {label: 'Hide Grid'});
  help.addMonitor({text: 'Click + Drag Plane'}, 'text', {label: 'Move Object'});
}

// --- CORE UTILS (Untouched Logic) ---

function renderGridSubset(lines, drawY, xLim, zLim) {
  for (let l of lines) {
    stroke(l.color); strokeWeight(l.weight);
    let isOnTargetFloor = (abs(l.p1.y - drawY) < 0.1 && abs(l.p2.y - drawY) < 0.1);
    if (showFullGrid) {
      line(l.p1.x, l.p1.y, l.p1.z, l.p2.x, l.p2.y, l.p2.z);
    } else if (isOnTargetFloor) {
      let x1 = constrain(l.p1.x, 0, xLim); let x2 = constrain(l.p2.x, 0, xLim);
      let z1 = constrain(l.p1.z, 0, zLim); let z2 = constrain(l.p2.z, 0, zLim);
      if (dist(x1, 0, z1, x2, 0, z2) > 0.5) line(x1, drawY, z1, x2, drawY, z2);
    }
  }
}
function generateGridData() {
  vertices3D = []; gridLinesPrimary = []; gridLinesSecondary = [];
  let coords1 = [0]; let cur1 = 0; let coords2 = [0]; let cur2 = 0;
  for (let i = 0; i < SUBDIVISIONS; i++) { cur1 += PATTERN_1[i % PATTERN_1.length]; coords1.push(cur1 * PIXELS_PER_CM); }
  let maxL = coords1[coords1.length - 1];
  while (cur2 * PIXELS_PER_CM < maxL) { cur2 += PATTERN_2[(coords2.length - 1) % PATTERN_2.length]; coords2.push(cur2 * PIXELS_PER_CM); }
  function createLines(coordsArr, col, wt, targetList) {
    for (let v of coordsArr) {
      targetList.push({ p1: createVector(v, 0, 0), p2: createVector(v, 0, maxL), color: col, weight: wt });
      targetList.push({ p1: createVector(0, 0, v), p2: createVector(maxL, 0, v), color: col, weight: wt });
      targetList.push({ p1: createVector(v, 0, 0), p2: createVector(v, -maxL, 0), color: col, weight: wt });
      targetList.push({ p1: createVector(0, -v, 0), p2: createVector(maxL, -v, 0), color: col, weight: wt });
      targetList.push({ p1: createVector(0, 0, v), p2: createVector(0, -maxL, v), color: col, weight: wt });
      targetList.push({ p1: createVector(0, -v, 0), p2: createVector(0, -v, maxL), color: col, weight: wt });
    }
  }
  createLines(coords2, color(255, 170, 0, 80), 1, gridLinesSecondary); 
  createLines(coords1, color(180), 1.5, gridLinesPrimary);             
  let allSet = new Set([...coords1, ...coords2]);
  mergedCoords = Array.from(allSet).map(v => Math.round(v * 1000) / 1000).sort((a, b) => a - b);
  for (let v of mergedCoords) { for (let v2 of mergedCoords) { vertices3D.push(createVector(v, 0, v2)); vertices3D.push(createVector(v, -v2, 0)); vertices3D.push(createVector(0, -v2, v)); } }
}
function getPrimaryGridDist(numBlocks) { let d = 0; for (let i = 0; i < numBlocks; i++) d += PATTERN_1[i % PATTERN_1.length]; return d * PIXELS_PER_CM; }
function getGridDist(index) { if (index >= mergedCoords.length) return mergedCoords[mergedCoords.length - 1]; return mergedCoords[index]; }
function findGridIndex(pos) { let bestIdx = 0; let minDist = Infinity; for (let i = 0; i < mergedCoords.length; i++) { let d = abs(mergedCoords[i] - pos); if (d < minDist) { minDist = d; bestIdx = i; } } return bestIdx; }
function selectPlane(p) { deselectAll(); selectedPlane = p; selectedPlane.isSelected = true; paneParams.elevation = p.elevBlocks; paneParams.wallBlocks = p.numBlocks; paneParams.wallDepth = p.depthBlocks; syncMoveSliders(); pane.refresh(); }
function deselectAll() { if (selectedPlane) selectedPlane.isSelected = false; selectedPlane = null; pane.refresh(); }
function syncMoveSliders() { if (!selectedPlane) return; paneParams.moveX = findGridIndex(selectedPlane.p1.x); paneParams.moveZ = findGridIndex(selectedPlane.p1.z); pane.refresh(); }
function movePlaneToGrid(axis, index) { if (!selectedPlane) return; let target = getGridDist(index); if (axis === 'x') { let diff = target - selectedPlane.p1.x; selectedPlane.p1.x += diff; selectedPlane.p2.x += diff; } else { let diff = target - selectedPlane.p1.z; selectedPlane.p1.z += diff; selectedPlane.p2.z += diff; } selectedPlane.updateBounds(); }
function getManualScreenPos(x, y, z) { let r = _renderer; let mvp = r.uMVMatrix.copy().mult(r.uPMatrix); let x4 = x * mvp.mat4[0] + y * mvp.mat4[4] + z * mvp.mat4[8] + mvp.mat4[12]; let y4 = x * mvp.mat4[1] + y * mvp.mat4[5] + z * mvp.mat4[9] + mvp.mat4[13]; let w4 = x * mvp.mat4[3] + y * mvp.mat4[7] + z * mvp.mat4[11] + mvp.mat4[15]; return { x: (x4 / w4 + 1) * width / 2, y: (1 - y4 / w4) * height / 2 }; }
function getClosestVertex(xLim, zLim, elev) { let closest = null; let minDist = Infinity; let targetY = -getGridDist(elev); for (let v of vertices3D) { if (abs(v.y - targetY) > 0.1) continue; let sPos = getManualScreenPos(v.x, v.y, v.z); let d = dist(mouseX, mouseY, sPos.x, sPos.y); if (d < minDist && d < 35) { minDist = d; closest = v; } } return closest; }
function mouseReleased() { if (isDragging && startV && currentV) { if (dist(startV.x, startV.y, startV.z, currentV.x, currentV.y, currentV.z) > 1) { planes.push(new GridPlane(startV, currentV)); saveStateToUrl(); } } if (isMovingPlane) saveStateToUrl(); isDragging = false; isMovingPlane = false; startV = null; }
function mouseDragged() { if (!isMouseOverGui() && !isDragging && !isMovingPlane && !isFPV) { paneParams.rotation = (paneParams.rotation - movedX * 0.5) % 360; pane.refresh(); } }
function mouseWheel(event) { if (!isMouseOverGui() && !isFPV) { camDist = constrain(camDist + event.delta, 100, 2500); return false; } }
function drawUI() { if (currentV) { push(); translate(currentV.x, currentV.y, currentV.z); fill(255, 0, 100); noStroke(); sphere(2); pop(); } }
function isMouseOverGui() { const g = document.querySelector('.tp-dfwv'); return g ? (mouseX >= g.getBoundingClientRect().left && mouseX <= g.getBoundingClientRect().right && mouseY >= g.getBoundingClientRect().top && mouseY <= g.getBoundingClientRect().bottom) : false; }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }

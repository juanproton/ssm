const PIXELS_PER_CM = 50; 
const SUBDIVISIONS = 36; 
const PATTERN = [0.86, 0.54];
const CONST_THICKNESS = 0.1 * PIXELS_PER_CM; 

let camDist = 800; 
let vertices3D = [];
let gridLines = [];
let planes = []; 

let startV = null; 
let currentV = null; 
let isDragging = false;
let isMovingPlane = false;
let selectedPlane = null;
let showFullGrid = true; 
let isAutoRotating = false;
let isCenitalView = false;
let isFPV = false; // First Person View toggle

let character; // The person object

let pane;
let paneParams = { 
  wallBlocks: 6,      
  orientation: 'FLOOR', 
  rotation: 45,
  elevation: 0,
  moveX: 0,
  moveZ: 0,
  boundaryX: 14,
  boundaryZ: 10,
  firstPerson: false
}; 

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  generateGridData(); 
  character = new Character();
  setupGui();
}

function draw() {
  background(255);

  let xLimit = getGridDist(paneParams.boundaryX);
  let zLimit = getGridDist(paneParams.boundaryZ);
  let centerX = xLimit / 2;
  let centerZ = zLimit / 2;

  // Handle Input
  if (isFPV) {
    character.update();
  } else if (isAutoRotating) {
    paneParams.rotation = (paneParams.rotation + 0.2) % 360; 
    pane.refresh(); 
  }

  // Camera Management
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
  // --- GRID ---
  stroke(220); strokeWeight(1);
  let drawY = -getGridDist(paneParams.elevation);

  for (let l of gridLines) {
    let isOnTargetFloor = (abs(l.p1.y - drawY) < 0.1 && abs(l.p2.y - drawY) < 0.1);
    if (showFullGrid) {
      line(l.p1.x, l.p1.y, l.p1.z, l.p2.x, l.p2.y, l.p2.z);
    } else if (isOnTargetFloor) {
      let x1 = constrain(l.p1.x, 0, xLimit);
      let x2 = constrain(l.p2.x, 0, xLimit);
      let z1 = constrain(l.p1.z, 0, zLimit);
      let z2 = constrain(l.p2.z, 0, zLimit);
      if (dist(x1, 0, z1, x2, 0, z2) > 0.5) line(x1, drawY, z1, x2, drawY, z2);
    }
  }

  for (let p of planes) p.display();

  // Character Placeholder (only visible in Orbit mode)
  if (!isFPV) character.display();

  if (isDragging && startV && currentV) {
    let previewPlane = new GridPlane(startV, currentV);
    previewPlane.display(true); 
  }

  // Boundary
  stroke(255, 0, 0); strokeWeight(3); noFill();
  beginShape();
  vertex(0, 0, 0); vertex(xLimit, 0, 0);
  vertex(xLimit, 0, zLimit); vertex(0, 0, zLimit);
  endShape(CLOSE);

  drawUI();
  pop(); 

  // Dragging logic
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

// --- CHARACTER CLASS ---

class Character {
  constructor() {
    this.pos = createVector(getGridDist(2), 0, getGridDist(2));
    this.yaw = 0;   
    this.pitch = 0; 
    this.fullHeight = 2.23 * PIXELS_PER_CM;
    this.eyeHeight = 1.80 * PIXELS_PER_CM;
    this.speed = 3;
    this.sensitivity = 0.005;
  }

  update() {
    // --- ROTATION (Click and Drag - Direct Direction) ---
    if (mouseIsPressed && !isMouseOverGui()) {
      this.yaw += movedX * this.sensitivity;
      this.pitch += movedY * this.sensitivity;
      
      // Clamp vertical look to prevent flipping
      this.pitch = constrain(this.pitch, -HALF_PI + 0.01, HALF_PI - 0.01);
    }

    // --- MOVEMENT (WASD Keys) ---
    let forward = createVector(sin(this.yaw), 0, cos(this.yaw));
    let right = createVector(sin(this.yaw + HALF_PI), 0, cos(this.yaw + HALF_PI));
    
    if (keyIsDown(87)) this.pos.add(p5.Vector.mult(forward, this.speed)); // W: Straight
    if (keyIsDown(83)) this.pos.sub(p5.Vector.mult(forward, this.speed)); // S: Back
    if (keyIsDown(65)) this.pos.add(p5.Vector.mult(right, this.speed));   // A: Left
    if (keyIsDown(68)) this.pos.sub(p5.Vector.mult(right, this.speed));   // D: Right
  }

  applyCamera() {
    let lookAt = createVector(
      this.pos.x + sin(this.yaw) * cos(this.pitch),
      -this.eyeHeight + sin(this.pitch),
      this.pos.z + cos(this.yaw) * cos(this.pitch)
    );
    camera(this.pos.x, -this.eyeHeight, this.pos.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);
  }

  display() {
    push();
    translate(this.pos.x, -this.fullHeight / 2, this.pos.z);
    rotateY(this.yaw);
    
    // Body
    fill(0, 100, 255, 200); 
    stroke(0, 50, 150);
    box(15, this.fullHeight, 15);
    
    // Eyes
    push();
    translate(0, -this.eyeHeight + (this.fullHeight / 2), 15);
    fill(255, 0, 0); 
    noStroke();
    push(); translate(-8, 0, 0); sphere(4); pop();
    push(); translate(8, 0, 0); sphere(4); pop();
    pop();
    pop();
  }
}
// Update your keyPressed function to include Pointer Lock
function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    
    if (isFPV) {
      // This is crucial: it hides the cursor and allows infinite rotation
      requestPointerLock();
    } else {
      exitPointerLock();
    }
    pane.refresh();
  }
  // ... rest of your keys (j, h, n, c, etc)
}

// --- UPDATED KEYPRESSED TO HANDLE POINTER LOCK ---

function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    pane.refresh();
    
    // Request pointer lock for better FPS controls
    if (isFPV) {
      requestPointerLock();
    } else {
      exitPointerLock();
    }
  }
  // ... rest of your existing keyPressed logic
  if (key === 'j' || key === 'J') isAutoRotating = !isAutoRotating;
  if (key === 'h' || key === 'H') showFullGrid = !showFullGrid;
  if (key === 'n' || key === 'N') { planes = []; selectedPlane = null; autoResetElevation(); }
  if ((keyCode === DELETE || keyCode === BACKSPACE) && selectedPlane) {
    planes.splice(planes.indexOf(selectedPlane), 1);
    selectedPlane = null;
    autoResetElevation();
  }
  if (key === 'c' || key === 'C') isCenitalView = !isCenitalView;
}

// --- PLANE CLASS ---

class GridPlane {
  constructor(v1, v2) {
    this.p1 = v1.copy(); 
    this.p2 = v2.copy();
    this.type = paneParams.orientation;
    this.numBlocks = paneParams.wallBlocks; 
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
  }

  getYPos() { return -getGridDist(this.elevBlocks); }

  display(isPreview = false) {
    push();
    let yPos = this.getYPos();
    let wallH = (this.type === 'WALL') ? this.calculateHeight() : CONST_THICKNESS;
    let halfThick = CONST_THICKNESS / 2;
    
    if (this.type === 'WALL') {
      if (this.wallAxis === 'X') {
        translate(this.centerX, yPos - wallH/2, this.p1.z + halfThick);
        this.drawBox(this.w, wallH, CONST_THICKNESS, isPreview);
      } else {
        translate(this.p1.x + halfThick, yPos - wallH/2, this.centerZ);
        this.drawBox(CONST_THICKNESS, wallH, this.d, isPreview);
      }
    } else {
      translate(this.centerX, yPos - halfThick, this.centerZ);
      this.drawBox(this.w, CONST_THICKNESS, this.d, isPreview);
    }
    pop();
  }

  calculateHeight() {
    let hSum = 0;
    for (let i = 0; i < this.numBlocks; i++) hSum += PATTERN[i % 2];
    return hSum * PIXELS_PER_CM;
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

// --- INPUTS ---

function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    pane.refresh();
  }
  if (key === 'j' || key === 'J') isAutoRotating = !isAutoRotating;
  if (key === 'h' || key === 'H') showFullGrid = !showFullGrid;
  if (key === 'n' || key === 'N') { planes = []; selectedPlane = null; autoResetElevation(); }
  if ((keyCode === DELETE || keyCode === BACKSPACE) && selectedPlane) {
    planes.splice(planes.indexOf(selectedPlane), 1);
    selectedPlane = null;
    autoResetElevation();
  }
  if (key === 'c' || key === 'C') isCenitalView = !isCenitalView;
}

function mousePressed() {
  if (isMouseOverGui() || isFPV) return;
  if (!keyIsDown(SHIFT)) {
    let clickedPlane = null;
    let minDist = Infinity;
    for (let p of planes) {
      let sPos = getManualScreenPos(p.centerX, p.getYPos(), p.centerZ);
      let d = dist(mouseX, mouseY, sPos.x, sPos.y);
      if (d < 50 && d < minDist) { minDist = d; clickedPlane = p; }
    }
    if (clickedPlane) {
      if (selectedPlane === clickedPlane && currentV) {
        isMovingPlane = true;
        startV = currentV.copy();
      } else {
        selectPlane(clickedPlane);
      }
      return;
    } else {
      deselectAll();
      autoResetElevation();
    }
  }
  if (keyIsDown(SHIFT) && currentV) {
    startV = currentV.copy();
    isDragging = true;
  }
}

function mouseReleased() {
  if (isDragging && startV && currentV) {
    if (dist(startV.x, startV.y, startV.z, currentV.x, currentV.y, currentV.z) > 1) {
      planes.push(new GridPlane(startV, currentV));
      autoResetElevation(); 
    }
  }
  isDragging = false;
  isMovingPlane = false;
  startV = null; 
}

function mouseDragged() {
  if (!isMouseOverGui() && !isDragging && !isMovingPlane && !isFPV) {
    paneParams.rotation = (paneParams.rotation - movedX * 0.5) % 360;
    pane.refresh();
  }
}

function mouseWheel(event) {
  if (!isMouseOverGui() && !isFPV) {
    camDist = constrain(camDist + event.delta, 100, 2500);
    return false;
  }
}

// --- BOILERPLATE & HELPERS ---

function selectPlane(p) {
  deselectAll();
  selectedPlane = p;
  selectedPlane.isSelected = true;
  paneParams.elevation = p.elevBlocks;
  paneParams.wallBlocks = p.numBlocks;
  syncMoveSliders();
  pane.refresh();
}

function deselectAll() {
  if (selectedPlane) selectedPlane.isSelected = false;
  selectedPlane = null;
  pane.refresh();
}

function autoResetElevation() {
  paneParams.elevation = 0;
  pane.refresh();
}

function syncMoveSliders() {
  if (!selectedPlane) return;
  paneParams.moveX = findGridIndex(selectedPlane.p1.x); 
  paneParams.moveZ = findGridIndex(selectedPlane.p1.z);
  pane.refresh();
}

function findGridIndex(pos) {
  let bestIdx = 0; let minDist = Infinity;
  for (let i = 0; i < SUBDIVISIONS; i++) {
    let d = abs(getGridDist(i) - pos);
    if (d < minDist) { minDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function movePlaneToGrid(axis, index) {
  if (!selectedPlane) return;
  let targetCoord = getGridDist(index);
  if (axis === 'x') {
    let diff = targetCoord - selectedPlane.p1.x;
    selectedPlane.p1.x += diff; selectedPlane.p2.x += diff;
  } else if (axis === 'z') {
    let diff = targetCoord - selectedPlane.p1.z;
    selectedPlane.p1.z += diff; selectedPlane.p2.z += diff;
  }
  selectedPlane.updateBounds();
}

function getGridDist(numBlocks) {
  let d = 0;
  for (let i = 0; i < numBlocks; i++) d += PATTERN[i % 2];
  return d * PIXELS_PER_CM;
}

function getClosestVertex(xLim, zLim, elev) {
  let closest = null;
  let minDist = Infinity;
  let targetY = -getGridDist(elev);
  for (let v of vertices3D) {
    if (abs(v.y - targetY) > 0.1) continue; 
    let sPos = getManualScreenPos(v.x, v.y, v.z);
    let d = dist(mouseX, mouseY, sPos.x, sPos.y);
    if (d < minDist && d < 35) { minDist = d; closest = v; }
  }
  return closest;
}

function setupGui() {
  pane = new Tweakpane.Pane({ title: 'MODULOR' });
  pane.addInput(paneParams, 'firstPerson', { label: 'Walk Mode (V)' }).on('change', (ev)=> isFPV = ev.value);
  pane.addInput(paneParams, 'orientation', { options: { Floor: 'FLOOR', Wall: 'WALL' }, label: 'Tool' });
  pane.addInput(paneParams, 'wallBlocks', { min: 1, max: 20, step: 1, label: 'Wall Height' })
    .on('change', (ev) => { if (selectedPlane && selectedPlane.type === 'WALL') selectedPlane.numBlocks = ev.value; });

  const posFolder = pane.addFolder({ title: 'Position (X, Y, Z)' });
  posFolder.addInput(paneParams, 'moveX', { min: 0, max: 30, step: 1, label: 'Pos X' })
    .on('change', (ev) => { movePlaneToGrid('x', ev.value); });
  posFolder.addInput(paneParams, 'elevation', { min: 0, max: 20, step: 1, label: 'Pos Y (Elev)' })
    .on('change', (ev) => { if (selectedPlane) selectedPlane.elevBlocks = ev.value; });
  posFolder.addInput(paneParams, 'moveZ', { min: 0, max: 30, step: 1, label: 'Pos Z' })
    .on('change', (ev) => { movePlaneToGrid('z', ev.value); });

  const boundFolder = pane.addFolder({ title: 'Workspace Limits' });
  boundFolder.addInput(paneParams, 'boundaryX', { min: 1, max: 35, step: 1, label: 'Limit X' });
  boundFolder.addInput(paneParams, 'boundaryZ', { min: 1, max: 35, step: 1, label: 'Limit Z' });
  
  pane.addSeparator();
  pane.addInput(paneParams, 'rotation', { min: 0, max: 360, step: 1, label: 'Camera Orbit' });



  const helpFolder = pane.addFolder({
    title: 'HELP & CONTROLS',
    expanded: true, // Keep it open so users see it
  });

  // We use "Monitor" fields or simple blade buttons to show text in Tweakpane
  helpFolder.addSeparator();
  const helpText = [
    { label: 'Create', value: 'SHIFT + Drag' },
    { label: 'Select', value: 'Mouse Click' },
    { label: 'Walk', value: 'Key [V]' },
    { label: 'Grid Isolate', value: 'Key [H]' },
    { label: 'Auto Rotate', value: 'Key [J]' },

    { label: 'Top View', value: 'Key [C]' },
    { label: 'Delete', value: 'DEL / BKSP' },
    { label: 'Clear All', value: 'Key [N]' },

    { label: 'Wheel', value: 'Zoom' },
    { label: 'Click and Drag', value: 'rotateCamera' }


  ];

  helpText.forEach(item => {
    helpFolder.addMonitor(item, 'value', {
      label: item.label,
      multiline: false,
    });
  });
}

function generateGridData() {
  vertices3D = []; gridLines = [];
  let coords = [0]; let cur = 0;
  for (let i = 0; i < SUBDIVISIONS; i++) { cur += PATTERN[i % 2]; coords.push(cur * PIXELS_PER_CM); }
  let maxL = coords[coords.length - 1];
  for (let i = 0; i < coords.length; i++) {
    let v = coords[i];
    gridLines.push({ p1: createVector(v, 0, 0), p2: createVector(v, 0, maxL) });
    gridLines.push({ p1: createVector(0, 0, v), p2: createVector(maxL, 0, v) });
    gridLines.push({ p1: createVector(v, 0, 0), p2: createVector(v, -maxL, 0) });
    gridLines.push({ p1: createVector(0, -v, 0), p2: createVector(maxL, -v, 0) });
    gridLines.push({ p1: createVector(0, 0, v), p2: createVector(0, -maxL, v) });
    gridLines.push({ p1: createVector(0, -v, 0), p2: createVector(0, -v, maxL) });
    for (let j = 0; j < coords.length; j++) {
      let v2 = coords[j];
      vertices3D.push(createVector(v, 0, v2)); vertices3D.push(createVector(v, -v2, 0)); vertices3D.push(createVector(0, -v2, v));
    }
  }
}

function getManualScreenPos(x, y, z) {
  let r = _renderer; let mvp = r.uMVMatrix.copy().mult(r.uPMatrix);
  let x4 = x * mvp.mat4[0] + y * mvp.mat4[4] + z * mvp.mat4[8] + mvp.mat4[12];
  let y4 = x * mvp.mat4[1] + y * mvp.mat4[5] + z * mvp.mat4[9] + mvp.mat4[13];
  let w4 = x * mvp.mat4[3] + y * mvp.mat4[7] + z * mvp.mat4[11] + mvp.mat4[15];
  return { x: (x4 / w4 + 1) * width / 2, y: (1 - y4 / w4) * height / 2 };
}

function drawUI() { if (currentV) { push(); translate(currentV.x, currentV.y, currentV.z); fill(255, 0, 100); noStroke(); sphere(6, 4); pop(); } }
function isMouseOverGui() { const g = document.querySelector('.tp-dfwv'); return g ? (mouseX >= g.getBoundingClientRect().left && mouseX <= g.getBoundingClientRect().right && mouseY >= g.getBoundingClientRect().top && mouseY <= g.getBoundingClientRect().bottom) : false; }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }const PIXELS_PER_CM = 50; 
const SUBDIVISIONS = 36; 
const PATTERN = [0.86, 0.54];
const CONST_THICKNESS = 0.1 * PIXELS_PER_CM; 

let camDist = 800; 
let vertices3D = [];
let gridLines = [];
let planes = []; 

let startV = null; 
let currentV = null; 
let isDragging = false;
let isMovingPlane = false;
let selectedPlane = null;
let showFullGrid = true; 
let isAutoRotating = false;
let isCenitalView = false;
let isFPV = false; // First Person View toggle

let character; // The person object

let pane;
let paneParams = { 
  wallBlocks: 6,      
  orientation: 'FLOOR', 
  rotation: 45,
  elevation: 0,
  moveX: 0,
  moveZ: 0,
  boundaryX: 14,
  boundaryZ: 10,
  firstPerson: false
}; 

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  generateGridData(); 
  character = new Character();
  setupGui();
}

function draw() {
  background(255);

  let xLimit = getGridDist(paneParams.boundaryX);
  let zLimit = getGridDist(paneParams.boundaryZ);
  let centerX = xLimit / 2;
  let centerZ = zLimit / 2;

  // Handle Input
  if (isFPV) {
    character.update();
  } else if (isAutoRotating) {
    paneParams.rotation = (paneParams.rotation + 0.2) % 360; 
    pane.refresh(); 
  }

  // Camera Management
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
  // --- GRID ---
  stroke(220); strokeWeight(1);
  let drawY = -getGridDist(paneParams.elevation);

  for (let l of gridLines) {
    let isOnTargetFloor = (abs(l.p1.y - drawY) < 0.1 && abs(l.p2.y - drawY) < 0.1);
    if (showFullGrid) {
      line(l.p1.x, l.p1.y, l.p1.z, l.p2.x, l.p2.y, l.p2.z);
    } else if (isOnTargetFloor) {
      let x1 = constrain(l.p1.x, 0, xLimit);
      let x2 = constrain(l.p2.x, 0, xLimit);
      let z1 = constrain(l.p1.z, 0, zLimit);
      let z2 = constrain(l.p2.z, 0, zLimit);
      if (dist(x1, 0, z1, x2, 0, z2) > 0.5) line(x1, drawY, z1, x2, drawY, z2);
    }
  }

  for (let p of planes) p.display();

  // Character Placeholder (only visible in Orbit mode)
  if (!isFPV) character.display();

  if (isDragging && startV && currentV) {
    let previewPlane = new GridPlane(startV, currentV);
    previewPlane.display(true); 
  }

  // Boundary
  stroke(255, 0, 0); strokeWeight(3); noFill();
  beginShape();
  vertex(0, 0, 0); vertex(xLimit, 0, 0);
  vertex(xLimit, 0, zLimit); vertex(0, 0, zLimit);
  endShape(CLOSE);

  drawUI();
  pop(); 

  // Dragging logic
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

// --- CHARACTER CLASS ---

class Character {
  constructor() {
    this.pos = createVector(getGridDist(2), 0, getGridDist(2));
    this.yaw = 0;   
    this.pitch = 0; 
    this.fullHeight = 2.23 * PIXELS_PER_CM;
    this.eyeHeight = 1.80 * PIXELS_PER_CM;
    this.speed = 3;
    this.sensitivity = 0.005;
  }

  update() {
    // --- ROTATION (Click and Drag - Direct Direction) ---
    if (mouseIsPressed && !isMouseOverGui()) {
      this.yaw += movedX * this.sensitivity;
      this.pitch += movedY * this.sensitivity;
      
      // Clamp vertical look to prevent flipping
      this.pitch = constrain(this.pitch, -HALF_PI + 0.01, HALF_PI - 0.01);
    }

    // --- MOVEMENT (WASD Keys) ---
    let forward = createVector(sin(this.yaw), 0, cos(this.yaw));
    let right = createVector(sin(this.yaw + HALF_PI), 0, cos(this.yaw + HALF_PI));
    
    if (keyIsDown(87)) this.pos.add(p5.Vector.mult(forward, this.speed)); // W: Straight
    if (keyIsDown(83)) this.pos.sub(p5.Vector.mult(forward, this.speed)); // S: Back
    if (keyIsDown(65)) this.pos.add(p5.Vector.mult(right, this.speed));   // A: Left
    if (keyIsDown(68)) this.pos.sub(p5.Vector.mult(right, this.speed));   // D: Right
  }

  applyCamera() {
    let lookAt = createVector(
      this.pos.x + sin(this.yaw) * cos(this.pitch),
      -this.eyeHeight + sin(this.pitch),
      this.pos.z + cos(this.yaw) * cos(this.pitch)
    );
    camera(this.pos.x, -this.eyeHeight, this.pos.z, lookAt.x, lookAt.y, lookAt.z, 0, 1, 0);
  }

  display() {
    push();
    translate(this.pos.x, -this.fullHeight / 2, this.pos.z);
    rotateY(this.yaw);
    
    // Body
    fill(0, 100, 255, 200); 
    stroke(0, 50, 150);
    box(15, this.fullHeight, 15);
    
    // Eyes
    push();
    translate(0, -this.eyeHeight + (this.fullHeight / 2), 15);
    fill(255, 0, 0); 
    noStroke();
    push(); translate(-8, 0, 0); sphere(4); pop();
    push(); translate(8, 0, 0); sphere(4); pop();
    pop();
    pop();
  }
}
// Update your keyPressed function to include Pointer Lock
function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    
    if (isFPV) {
      // This is crucial: it hides the cursor and allows infinite rotation
      requestPointerLock();
    } else {
      exitPointerLock();
    }
    pane.refresh();
  }
  // ... rest of your keys (j, h, n, c, etc)
}

// --- UPDATED KEYPRESSED TO HANDLE POINTER LOCK ---

function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    pane.refresh();
    
    // Request pointer lock for better FPS controls
    if (isFPV) {
      requestPointerLock();
    } else {
      exitPointerLock();
    }
  }
  // ... rest of your existing keyPressed logic
  if (key === 'j' || key === 'J') isAutoRotating = !isAutoRotating;
  if (key === 'h' || key === 'H') showFullGrid = !showFullGrid;
  if (key === 'n' || key === 'N') { planes = []; selectedPlane = null; autoResetElevation(); }
  if ((keyCode === DELETE || keyCode === BACKSPACE) && selectedPlane) {
    planes.splice(planes.indexOf(selectedPlane), 1);
    selectedPlane = null;
    autoResetElevation();
  }
  if (key === 'c' || key === 'C') isCenitalView = !isCenitalView;
}

// --- PLANE CLASS ---

class GridPlane {
  constructor(v1, v2) {
    this.p1 = v1.copy(); 
    this.p2 = v2.copy();
    this.type = paneParams.orientation;
    this.numBlocks = paneParams.wallBlocks; 
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
  }

  getYPos() { return -getGridDist(this.elevBlocks); }

  display(isPreview = false) {
    push();
    let yPos = this.getYPos();
    let wallH = (this.type === 'WALL') ? this.calculateHeight() : CONST_THICKNESS;
    let halfThick = CONST_THICKNESS / 2;
    
    if (this.type === 'WALL') {
      if (this.wallAxis === 'X') {
        translate(this.centerX, yPos - wallH/2, this.p1.z + halfThick);
        this.drawBox(this.w, wallH, CONST_THICKNESS, isPreview);
      } else {
        translate(this.p1.x + halfThick, yPos - wallH/2, this.centerZ);
        this.drawBox(CONST_THICKNESS, wallH, this.d, isPreview);
      }
    } else {
      translate(this.centerX, yPos - halfThick, this.centerZ);
      this.drawBox(this.w, CONST_THICKNESS, this.d, isPreview);
    }
    pop();
  }

  calculateHeight() {
    let hSum = 0;
    for (let i = 0; i < this.numBlocks; i++) hSum += PATTERN[i % 2];
    return hSum * PIXELS_PER_CM;
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

// --- INPUTS ---

function keyPressed() {
  if (key === 'v' || key === 'V') {
    isFPV = !isFPV;
    paneParams.firstPerson = isFPV;
    pane.refresh();
  }
  if (key === 'j' || key === 'J') isAutoRotating = !isAutoRotating;
  if (key === 'h' || key === 'H') showFullGrid = !showFullGrid;
  if (key === 'n' || key === 'N') { planes = []; selectedPlane = null; autoResetElevation(); }
  if ((keyCode === DELETE || keyCode === BACKSPACE) && selectedPlane) {
    planes.splice(planes.indexOf(selectedPlane), 1);
    selectedPlane = null;
    autoResetElevation();
  }
  if (key === 'c' || key === 'C') isCenitalView = !isCenitalView;
}

function mousePressed() {
  if (isMouseOverGui() || isFPV) return;
  if (!keyIsDown(SHIFT)) {
    let clickedPlane = null;
    let minDist = Infinity;
    for (let p of planes) {
      let sPos = getManualScreenPos(p.centerX, p.getYPos(), p.centerZ);
      let d = dist(mouseX, mouseY, sPos.x, sPos.y);
      if (d < 50 && d < minDist) { minDist = d; clickedPlane = p; }
    }
    if (clickedPlane) {
      if (selectedPlane === clickedPlane && currentV) {
        isMovingPlane = true;
        startV = currentV.copy();
      } else {
        selectPlane(clickedPlane);
      }
      return;
    } else {
      deselectAll();
      autoResetElevation();
    }
  }
  if (keyIsDown(SHIFT) && currentV) {
    startV = currentV.copy();
    isDragging = true;
  }
}

function mouseReleased() {
  if (isDragging && startV && currentV) {
    if (dist(startV.x, startV.y, startV.z, currentV.x, currentV.y, currentV.z) > 1) {
      planes.push(new GridPlane(startV, currentV));
      autoResetElevation(); 
    }
  }
  isDragging = false;
  isMovingPlane = false;
  startV = null; 
}

function mouseDragged() {
  if (!isMouseOverGui() && !isDragging && !isMovingPlane && !isFPV) {
    paneParams.rotation = (paneParams.rotation - movedX * 0.5) % 360;
    pane.refresh();
  }
}

function mouseWheel(event) {
  if (!isMouseOverGui() && !isFPV) {
    camDist = constrain(camDist + event.delta, 100, 2500);
    return false;
  }
}

// --- BOILERPLATE & HELPERS ---

function selectPlane(p) {
  deselectAll();
  selectedPlane = p;
  selectedPlane.isSelected = true;
  paneParams.elevation = p.elevBlocks;
  paneParams.wallBlocks = p.numBlocks;
  syncMoveSliders();
  pane.refresh();
}

function deselectAll() {
  if (selectedPlane) selectedPlane.isSelected = false;
  selectedPlane = null;
  pane.refresh();
}

function autoResetElevation() {
  paneParams.elevation = 0;
  pane.refresh();
}

function syncMoveSliders() {
  if (!selectedPlane) return;
  paneParams.moveX = findGridIndex(selectedPlane.p1.x); 
  paneParams.moveZ = findGridIndex(selectedPlane.p1.z);
  pane.refresh();
}

function findGridIndex(pos) {
  let bestIdx = 0; let minDist = Infinity;
  for (let i = 0; i < SUBDIVISIONS; i++) {
    let d = abs(getGridDist(i) - pos);
    if (d < minDist) { minDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function movePlaneToGrid(axis, index) {
  if (!selectedPlane) return;
  let targetCoord = getGridDist(index);
  if (axis === 'x') {
    let diff = targetCoord - selectedPlane.p1.x;
    selectedPlane.p1.x += diff; selectedPlane.p2.x += diff;
  } else if (axis === 'z') {
    let diff = targetCoord - selectedPlane.p1.z;
    selectedPlane.p1.z += diff; selectedPlane.p2.z += diff;
  }
  selectedPlane.updateBounds();
}

function getGridDist(numBlocks) {
  let d = 0;
  for (let i = 0; i < numBlocks; i++) d += PATTERN[i % 2];
  return d * PIXELS_PER_CM;
}

function getClosestVertex(xLim, zLim, elev) {
  let closest = null;
  let minDist = Infinity;
  let targetY = -getGridDist(elev);
  for (let v of vertices3D) {
    if (abs(v.y - targetY) > 0.1) continue; 
    let sPos = getManualScreenPos(v.x, v.y, v.z);
    let d = dist(mouseX, mouseY, sPos.x, sPos.y);
    if (d < minDist && d < 35) { minDist = d; closest = v; }
  }
  return closest;
}

function setupGui() {
  pane = new Tweakpane.Pane({ title: 'MODULOR' });
  pane.addInput(paneParams, 'firstPerson', { label: 'Walk Mode (V)' }).on('change', (ev)=> isFPV = ev.value);
  pane.addInput(paneParams, 'orientation', { options: { Floor: 'FLOOR', Wall: 'WALL' }, label: 'Tool' });
  pane.addInput(paneParams, 'wallBlocks', { min: 1, max: 20, step: 1, label: 'Wall Height' })
    .on('change', (ev) => { if (selectedPlane && selectedPlane.type === 'WALL') selectedPlane.numBlocks = ev.value; });

  const posFolder = pane.addFolder({ title: 'Position (X, Y, Z)' });
  posFolder.addInput(paneParams, 'moveX', { min: 0, max: 30, step: 1, label: 'Pos X' })
    .on('change', (ev) => { movePlaneToGrid('x', ev.value); });
  posFolder.addInput(paneParams, 'elevation', { min: 0, max: 20, step: 1, label: 'Pos Y (Elev)' })
    .on('change', (ev) => { if (selectedPlane) selectedPlane.elevBlocks = ev.value; });
  posFolder.addInput(paneParams, 'moveZ', { min: 0, max: 30, step: 1, label: 'Pos Z' })
    .on('change', (ev) => { movePlaneToGrid('z', ev.value); });

  const boundFolder = pane.addFolder({ title: 'Workspace Limits' });
  boundFolder.addInput(paneParams, 'boundaryX', { min: 1, max: 35, step: 1, label: 'Limit X' });
  boundFolder.addInput(paneParams, 'boundaryZ', { min: 1, max: 35, step: 1, label: 'Limit Z' });
  
  pane.addSeparator();
  pane.addInput(paneParams, 'rotation', { min: 0, max: 360, step: 1, label: 'Camera Orbit' });



  const helpFolder = pane.addFolder({
    title: 'HELP & CONTROLS',
    expanded: true, // Keep it open so users see it
  });

  // We use "Monitor" fields or simple blade buttons to show text in Tweakpane
  helpFolder.addSeparator();
  const helpText = [
    { label: 'Create', value: 'SHIFT + Drag' },
    { label: 'Select', value: 'Mouse Click' },
    { label: 'Walk', value: 'Key [V]' },
    { label: 'Grid', value: 'Key [H]' },
    { label: 'Top View', value: 'Key [C]' },
    { label: 'Delete', value: 'DEL / BKSP' },
    { label: 'Clear All', value: 'Key [N]' }
  ];

  helpText.forEach(item => {
    helpFolder.addMonitor(item, 'value', {
      label: item.label,
      multiline: false,
    });
  });
}

function generateGridData() {
  vertices3D = []; gridLines = [];
  let coords = [0]; let cur = 0;
  for (let i = 0; i < SUBDIVISIONS; i++) { cur += PATTERN[i % 2]; coords.push(cur * PIXELS_PER_CM); }
  let maxL = coords[coords.length - 1];
  for (let i = 0; i < coords.length; i++) {
    let v = coords[i];
    gridLines.push({ p1: createVector(v, 0, 0), p2: createVector(v, 0, maxL) });
    gridLines.push({ p1: createVector(0, 0, v), p2: createVector(maxL, 0, v) });
    gridLines.push({ p1: createVector(v, 0, 0), p2: createVector(v, -maxL, 0) });
    gridLines.push({ p1: createVector(0, -v, 0), p2: createVector(maxL, -v, 0) });
    gridLines.push({ p1: createVector(0, 0, v), p2: createVector(0, -maxL, v) });
    gridLines.push({ p1: createVector(0, -v, 0), p2: createVector(0, -v, maxL) });
    for (let j = 0; j < coords.length; j++) {
      let v2 = coords[j];
      vertices3D.push(createVector(v, 0, v2)); vertices3D.push(createVector(v, -v2, 0)); vertices3D.push(createVector(0, -v2, v));
    }
  }
}

function getManualScreenPos(x, y, z) {
  let r = _renderer; let mvp = r.uMVMatrix.copy().mult(r.uPMatrix);
  let x4 = x * mvp.mat4[0] + y * mvp.mat4[4] + z * mvp.mat4[8] + mvp.mat4[12];
  let y4 = x * mvp.mat4[1] + y * mvp.mat4[5] + z * mvp.mat4[9] + mvp.mat4[13];
  let w4 = x * mvp.mat4[3] + y * mvp.mat4[7] + z * mvp.mat4[11] + mvp.mat4[15];
  return { x: (x4 / w4 + 1) * width / 2, y: (1 - y4 / w4) * height / 2 };
}

function drawUI() { if (currentV) { push(); translate(currentV.x, currentV.y, currentV.z); fill(255, 0, 100); noStroke(); sphere(6, 4); pop(); } }
function isMouseOverGui() { const g = document.querySelector('.tp-dfwv'); return g ? (mouseX >= g.getBoundingClientRect().left && mouseX <= g.getBoundingClientRect().right && mouseY >= g.getBoundingClientRect().top && mouseY <= g.getBoundingClientRect().bottom) : false; }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }

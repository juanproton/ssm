let particleCanvas;
let shaderProgram;
let vertCount;
let DIM = Math.min(window.innerWidth, window.innerHeight);

const HOLD_TIME = 1500; 

let lastMouseX = -999;
let lastMouseY = -999;
let lastMouseMoveTime = 0;
const INACTIVE_THRESHOLD = 100; 

// Persistent active mouse heading vector
let mouseHeadingX = 0.0;
let mouseHeadingY = 1.0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  noCursor();

  particleCanvas = createGraphics(windowWidth, windowHeight, WEBGL);
  particleCanvas.noStroke();
  particleCanvas.background(255)
  const vert = `
    precision mediump float;
    uniform float u_time;
    uniform vec2  u_resolution;

    attribute vec2 aPos;
    attribute vec2 aOff;
    attribute float aSize;
    attribute float aID;
    attribute vec2 aUV;
    attribute vec2 aVel;
    attribute float aRotSpeed;
    attribute float aTimeOffset;
    attribute float aFreq;
    attribute float aTick;
    attribute float aDir; 
    attribute float aAperture; 
    attribute float aScatterMix;
    attribute vec2  aSavedDir;

    varying float vID;
    varying vec2  vUV;
    varying float vTimeOffset;
    varying float vFreq;
    varying float vAperture;
    varying float vDir;
    varying float tick;

    void main() {
      vID = aID;
      vUV = aUV;
      vFreq = aFreq;
      vTimeOffset = aTimeOffset;
      vAperture = aAperture;
      vDir = aDir;
      tick = aTick;

      float c = cos(aRotSpeed);
      float s = sin(aRotSpeed);
      mat2 rotMatrix = mat2(c, -s, s, c);
      vec2 rotatedPos = rotMatrix * aPos;

      float randAngle = aID * 2.4;
      float rc = cos(randAngle);
      float rs = sin(randAngle);
      mat2 randRot = mat2(rc, -rs, rs, rc);
      
      vec2 mixedDir = mix(aSavedDir, randRot * aSavedDir, aScatterMix);
      vec2 scatterOffset = mixedDir * (aAperture * 1.5);

      vec2 offset = aOff + (aVel * 10.) + scatterOffset;
      vec2 p = (rotatedPos * aSize) + offset;
      
      float aspect = u_resolution.y / u_resolution.x;
      vec2 p_corr = vec2(p.x * aspect, p.y);

      gl_Position = vec4(p_corr, 0.0, 1.0);
    }
  `;

  const frag = `
    precision mediump float;
    varying float vID;
    varying vec2  vUV;
    varying float vTimeOffset;
    varying float vFreq;
    varying float vAperture;
    varying float vDir;
    varying float tick;

    uniform float u_time;
    uniform vec2 u_mouse;
    uniform vec2 u_resolution;

    vec3 pulseOsc(float _freq, float speed, float coord){
      float ramp = fract(coord * _freq + speed);
      float mmm = mix(tick,tick+0.5,vAperture*1.);
      float pulse = 1.0 - smoothstep(mmm, mmm+0.04, ramp);
      return vec3(pulse);
    }

    float interference(vec2 uv, float c, float aperture, float dir){
      return distance(
        vec2(mix(0., dir, aperture) * floor(uv.y * c + 0.5), 0.),
        uv
      );
    }

    void main() {
      float d = interference(vUV, 9.0, vAperture, vDir);
      if (d > 0.5) discard;
      vec3 final = pulseOsc(vFreq, vAperture*20., d);
      gl_FragColor = vec4(final, 1.0);
    }
  `;

  shaderProgram = particleCanvas.createShader(vert, frag);
  particleCanvas.shader(shaderProgram);

  const gl   = particleCanvas._renderer.GL;
  const prog = shaderProgram._glProgram;
  gl.useProgram(prog);

  const posLoc          = gl.getAttribLocation(prog, 'aPos');
  const offLoc          = gl.getAttribLocation(prog, 'aOff');
  const sizeLoc         = gl.getAttribLocation(prog, 'aSize');
  const idLoc           = gl.getAttribLocation(prog, 'aID');
  const uvLoc           = gl.getAttribLocation(prog, 'aUV');
  const velLoc          = gl.getAttribLocation(prog, 'aVel');
  const rotSpeedLoc     = gl.getAttribLocation(prog, 'aRotSpeed');
  const timeOffsetLoc   = gl.getAttribLocation(prog, 'aTimeOffset');
  const freqLoc         = gl.getAttribLocation(prog, 'aFreq');
  const dirLoc          = gl.getAttribLocation(prog, 'aDir');
  const apertureLoc     = gl.getAttribLocation(prog, 'aAperture');
  const aTickLoc        = gl.getAttribLocation(prog, 'aTick');
  const scatterMixLoc   = gl.getAttribLocation(prog, 'aScatterMix'); 
  const savedDirLoc     = gl.getAttribLocation(prog, 'aSavedDir'); 

  const basePos = [
    [-0.5, -0.5], [ 0.5, -0.5], [ 0.5,  0.5],
    [-0.5, -0.5], [ 0.5,  0.5], [-0.5,  0.5],
  ];
  const baseUV = [
    [-1, -1], [ 1, -1], [ 1,  1],
    [-1, -1], [ 1,  1], [-1,  1],
  ];

  const numParticles = 4000;
  let posData = [], uvData = [], offData = [], sizeData = [],
      idData = [], velData = [], rotSpeedData = [], timeOffsetData = [], freqData = [], dirData = [], apertureData = [], tickData = [], scatterMixData = [], savedDirData = [];

  window.particles = [];
  let freq = random([12.5,24.5])
  for (let i = 0; i < numParticles; i++) {
    let pObj = {
      ox: random(-1, 1),
      oy: random(-1, 1),
      s: random(0.5, 0.5),
      vx: random(-0.1, 0.1),
      vy: random(-0.1, 0.1),
      rs: random(-PI, PI),
      to: random(0, 10),
      freq: freq,
      dir: random() > 0.5 ? 1.0 : -1.0, 
      tick: 0.43,
      currentAperture: 0.0,
      targetAperture: 0.0,
      holdUntil: 0,
      returnSpeed: random(0.3, 3.),
      scatterMix: random(0.2, 1.8),
      savedDirX: 0.0,
      savedDirY: 1.0
    };
    
    pObj.cx = pObj.ox + pObj.vx * 10.0;
    pObj.cy = pObj.oy + pObj.vy * 10.0;
    
    window.particles.push(pObj);

    for (let v = 0; v < 6; v++) {
      posData.push(...basePos[v]);
      uvData.push(...baseUV[v]);
      offData.push(pObj.ox, pObj.oy);
      sizeData.push(pObj.s);
      idData.push(i);
      freqData.push(pObj.freq);
      velData.push(pObj.vx, pObj.vy);
      rotSpeedData.push(pObj.rs);
      timeOffsetData.push(pObj.to);
      dirData.push(pObj.dir);
      apertureData.push(0.0);
      tickData.push(pObj.tick);
      scatterMixData.push(pObj.scatterMix);
      savedDirData.push(0.0, 1.0);
    }
  }

  vertCount = numParticles * 6;

  function makeBuffer(data, loc, size) {
    if (loc === -1) return;
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  makeBuffer(posData,        posLoc,        2);
  makeBuffer(uvData,         uvLoc,         2);
  makeBuffer(offData,        offLoc,        2);
  makeBuffer(sizeData,       sizeLoc,       1);
  makeBuffer(idData,         idLoc,         1);
  makeBuffer(velData,        velLoc,        2);
  makeBuffer(rotSpeedData,   rotSpeedLoc,   1);
  makeBuffer(timeOffsetData, timeOffsetLoc, 1);
  makeBuffer(freqData,       freqLoc,       1);
  makeBuffer(dirData,        dirLoc,        1); 
  makeBuffer(tickData,       aTickLoc,      1); 
  makeBuffer(scatterMixData, scatterMixLoc, 1); 

  window.savedDirBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, window.savedDirBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(savedDirData), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(savedDirLoc);
  gl.vertexAttribPointer(savedDirLoc, 2, gl.FLOAT, false, 0, 0);

  window.apertureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, window.apertureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(apertureData), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(apertureLoc);
  gl.vertexAttribPointer(apertureLoc, 1, gl.FLOAT, false, 0, 0);
  
  window.glContext = gl;
}

function draw() {
  background(255);
  
  let currentTime = millis();

  let dx = mouseX - pmouseX;
  let dy = -(mouseY - pmouseY); // WebGL Y-axis convention
  let speed = sqrt(dx * dx + dy * dy);

  if (speed > 0.05) {
    let len = sqrt(dx * dx + dy * dy);
    if (len > 0) {
      mouseHeadingX = lerp(mouseHeadingX, dx / len, 0.2);
      mouseHeadingY = lerp(mouseHeadingY, dy / len, 0.2);
    }
  }

  if (mouseX !== lastMouseX || mouseY !== lastMouseY) {
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    lastMouseMoveTime = currentTime;
  }
  let isMouseActive = (currentTime - lastMouseMoveTime) < INACTIVE_THRESHOLD;
  
  let aspect = height / width;
  let mouseNDC_x = (mouseX / width) * 2.0 - 1.0;
  let mouseNDC_y = -((mouseY / height) * 2.0 - 1.0);
  mouseNDC_x *= aspect;

  let newApertureData = new Float32Array(vertCount);
  let newSavedDirData = new Float32Array(window.particles.length * 2);
  
  for (let i = 0; i < window.particles.length; i++) {
    let p = window.particles[i];
    
    let cx_corr = p.cx * aspect;
    let cy_corr = p.cy;
    
    let dist = sqrt(sq(cx_corr - mouseNDC_x) + sq(cy_corr - mouseNDC_y));
    let maxDist = 0.5;
    let influence = 1.0 - constrain(dist / maxDist, 0.0, 1.0);
    
    if (influence > 0.0 && isMouseActive) {
      p.holdUntil = currentTime + HOLD_TIME;
      
      let calculatedTarget = map(influence * influence, 0, 1, 0.0, 0.2);
      p.targetAperture = max(p.targetAperture, calculatedTarget);
      
      p.savedDirX = mouseHeadingX;
      p.savedDirY = mouseHeadingY;
    }
    
    if (currentTime > p.holdUntil) {
      p.targetAperture = 0.0;
    }
    
    let baseLerpSpeed = 0.04;
    let lerpFactor = baseLerpSpeed;
    
    if (p.targetAperture === 0.0) {
      lerpFactor *= p.returnSpeed;
    }
    
    p.currentAperture += (p.targetAperture - p.currentAperture) * lerpFactor;

    let offset = i * 6;
    let v_val = p.currentAperture;
    for (let v = 0; v < 6; v++) {
      newApertureData[offset + v] = v_val;
    }
    
    newSavedDirData[i * 2] = p.savedDirX;
    newSavedDirData[i * 2 + 1] = p.savedDirY;
  }

  const gl = window.glContext;
  
  gl.bindBuffer(gl.ARRAY_BUFFER, window.apertureBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, newApertureData);

  gl.bindBuffer(gl.ARRAY_BUFFER, window.savedDirBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, newSavedDirData);

  shaderProgram.setUniform('u_time', currentTime * 0.001);
  shaderProgram.setUniform('u_resolution', [width, height]);
  shaderProgram.setUniform("u_mouse", [mouseX, mouseY]);

  particleCanvas.shader(shaderProgram);
  gl.useProgram(shaderProgram._glProgram);
  gl.drawArrays(gl.TRIANGLES, 0, vertCount);

  image(particleCanvas, 0, 0);


    fill(255,255,0,200);
  noStroke();
  circle(mouseX, mouseY, 30);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  particleCanvas.resizeCanvas(windowWidth, windowHeight);
}

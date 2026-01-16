let shaderProgram;
let vertCount;
let DIM = Math.min(window.innerWidth, window.innerHeight);
let tokenData

function setup() {
  // createCanvas(DIM, DIM, WEBGL);

  let canvas = createCanvas(windowWidth, windowHeight, WEBGL);
canvas.parent("p5-container");

  noStroke();

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

    varying float vID;
    varying vec2  vUV;
    varying float vTimeOffset;
    attribute float aFreq;
  varying float vFreq;

    void main() {
      vID = aID;
      vUV = aUV;
      vFreq = aFreq;

      vTimeOffset = aTimeOffset;

      float t = u_time + aTimeOffset;
      vec2 offset = aOff + aVel * 10.;

      float angle = aRotSpeed ;
      float c = cos(angle), s = sin(angle);
      vec2 rPos = vec2(
        aPos.x * c - aPos.y * s,
        aPos.x * s + aPos.y * c
      );

      vec2 scaled = rPos * aSize;
      vec2 p = scaled + offset+tan(t/50.+offset);

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

    uniform float u_time;

    vec3 pulseOsc(float _freq, float speed, float coord){
      float ramp = fract(coord * _freq + speed);
      float pulse = 1.0 - smoothstep(0.4, 0.47, ramp);
      return vec3(pulse);
    }

    float interference(vec2 uv, float c, float aperture){
      return distance(
        vec2(sin((u_time + vTimeOffset)/2.0) * aperture * floor(uv.y * c + 0.5), 0.),
        uv
      );
    }

    void main() {
      float d = interference(vUV, 9.0, 0.05);
            float d2 = interference(vUV+vec2(0.02,0.0), 9.0, 0.05);

      if (d > 0.5) discard;
      vec3 final = pulseOsc(vFreq, u_time + vTimeOffset, d);
      vec3 final2 = pulseOsc(vFreq, u_time + vTimeOffset, d2);

      gl_FragColor = vec4(final+=final2, 1.0);
    }
  `;

  shaderProgram = createShader(vert, frag);
  shader(shaderProgram);

  const gl   = this._renderer.GL;
  const prog = shaderProgram._glProgram;
  gl.useProgram(prog);

  const posLoc        = gl.getAttribLocation(prog, 'aPos');
  const offLoc        = gl.getAttribLocation(prog, 'aOff');
  const sizeLoc       = gl.getAttribLocation(prog, 'aSize');
  const idLoc         = gl.getAttribLocation(prog, 'aID');
  const uvLoc         = gl.getAttribLocation(prog, 'aUV');
  const velLoc        = gl.getAttribLocation(prog, 'aVel');
  const rotSpeedLoc   = gl.getAttribLocation(prog, 'aRotSpeed');
  const timeOffsetLoc = gl.getAttribLocation(prog, 'aTimeOffset');

  const basePos = [
    [-0.5, -0.5], [ 0.5, -0.5], [ 0.5,  0.5],
    [-0.5, -0.5], [ 0.5,  0.5], [-0.5,  0.5],
  ];
  const baseUV = [
    [-1, -1], [ 1, -1], [ 1,  1],
    [-1, -1], [ 1,  1], [-1,  1],
  ];

  const numParticles = 1500;
  let posData = [], uvData = [], offData = [], sizeData = [],
      idData = [], velData = [], rotSpeedData = [], timeOffsetData = [];
      let freqData = [];

  for (let i = 0; i < numParticles; i++) {
    let ox = random(-0.8, 0.8);
    let oy = random(-0.8, 0.8);
    let s  = random(0.8, 0.8);
    let vx = random(-0.1, 0.1);
    let vy = random(-0.1, 0.1);
    let rs = random(-PI, PI);
    let to = random(0, 13);
    let freq = random(40.0, 40.0); // or any range of frequencies you like

    for (let v = 0; v < 6; v++) {
      posData.push(...basePos[v]);
      uvData.push(...baseUV[v]);
      offData.push(ox, oy);
      sizeData.push(s);
      idData.push(i);
      freqData.push(freq);

      velData.push(vx, vy);
      rotSpeedData.push(rs);
      timeOffsetData.push(to);
    }
  }

  vertCount = numParticles * 6;

  function makeBuffer(data, loc, size) {
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
  const freqLoc = gl.getAttribLocation(prog, 'aFreq');
  makeBuffer(freqData, freqLoc, 1);
}

function draw() {
  background(255);
  shaderProgram.setUniform('u_time', millis() * 0.001);
  shaderProgram.setUniform('u_resolution', [width, height]);

  shader(shaderProgram);
  const gl = this._renderer.GL;
  gl.useProgram(shaderProgram._glProgram);
  gl.drawArrays(gl.TRIANGLES, 0, vertCount);
}

let shaderProgram;

// Interaction variables
let targetOffset = 0;
let currentOffset = 0;
let isDragging = false;
let previousMouseX = 0;

const COUNT = 10.0;      // frames visible on the band
const SPEED = 10.0;      // band speed in frames per second (the "motion device")
const DUTY  = 4.1;       // shutter open fraction (>1 = always open)
const BLUR  = 0;         // length of the motion streak, in frames
const MAX_RADIUS = 0.45; // pattern radius (shared by JS and shader)
const BAND_K = 2.2;      // band height = MAX_RADIUS * BAND_K * cell width
let beltPos = 0;         // how far the band has travelled, in frames
let running = true;

// The canvas IS the band: full window width, height = one cell tall
function bandHeight() {
  return MAX_RADIUS * BAND_K * (windowWidth / COUNT);
}

function setup() {
  createCanvas(windowWidth, bandHeight(), WEBGL);
  pixelDensity(4);
  noStroke();

  // center the band vertically in the page
  document.body.style.margin = "0";
  document.body.style.minHeight = "100vh";
  document.body.style.display = "flex";
  document.body.style.alignItems = "center";
  document.body.style.justifyContent = "center";
  document.body.style.background = "#fff";

  const vert = `
  precision highp float;

  attribute vec3 aPosition;
  attribute vec2 aTexCoord;

  varying vec2 vTexCoord;

  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;

  void main() {
    vTexCoord = aTexCoord;
    gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
  }
  `;

  const frag = `
  precision highp float;

  varying vec2 vTexCoord;

  uniform vec2 u_resolution;
  uniform float u_offset;   // band position in frames (continuous, fast)
  uniform float u_count;
  uniform float u_duty;
  uniform float u_blur;

  const float MAX_RADIUS = ${MAX_RADIUS.toFixed(4)};

  float pulseOsc(float _freq, float speed, float coord){
    float ramp = fract(coord * _freq + speed);
    return 1.0 - step(0.8, ramp);
  }

  float interference(vec2 uv, float c, float aperture, float dir){
    return distance(
      vec2(mix(0., dir, aperture) * floor(uv.y * c + 0.5), 0.),
      uv
    );
  }

  vec2 centeredUV(vec2 uv, float aspect){
    uv -= 0.5;
    if(aspect > 1.0)
      uv.x *= aspect;
    else
      uv.y /= aspect;
    return uv;
  }

  // Each frame index is a FIXED drawing: a 32-frame loop of aperture
  float getAperture(float frameIdx) {
    float cycle = mod(frameIdx, 32.0);
    float maxxx = 0.05;

    if (cycle < 8.0) {
      return mix(0.0, 0.05, cycle / 8.0);
    } else if (cycle < 24.0) {
      return mix(maxxx, -maxxx, (cycle - 8.0) / 16.0);
    } else {
      return mix(-maxxx, 0.0, (cycle - 24.0) / 8.0);
    }
  }

  // The band at a given position. The whole canvas is the band, so
  // there is no outside mask anymore.
  vec3 band(vec2 uv, float offset) {
    float totalX = uv.x * u_count + offset;
    float frame = floor(totalX);

    vec2 localUV;
    localUV.x = fract(totalX);
    localUV.y = uv.y;

    float aperture = getAperture(frame);
    float phase = -frame * 0.125;   // 8 frames = one ring period

    float cellAspect = (u_resolution.x / u_count) / u_resolution.y;

    float fff = interference(
      centeredUV(localUV, cellAspect),
      13.0,
      aperture,
      1.0
    );
    fff = min(fff, 0.4);

    float pulse = pulseOsc(fff, phase, 15.0);

    float bgEdge = step(MAX_RADIUS, fff);
    pulse = mix(pulse, 1.0, bgEdge);

    vec3 paperColor = vec3(0.99, 0.99, 0.98);
    vec3 lineColor  = vec3(0.0, 0.0, 0.0);
    vec3 white      = vec3(1.0, 1.0, 1.0);

    vec3 patternColor = mix(lineColor, paperColor, pulse);

    // frame gate between pictures
    float gate = step(0.5 - 0.008, abs(localUV.x - 0.5));
    return mix(patternColor, white, gate);
  }

  void main() {
    vec2 uv = vTexCoord;
    uv.y = 1.0 - uv.y;

    vec3 white = vec3(1.0);

    // Shutter: when open, the band is seen "frozen" with frames aligned.
    float shutter = 1.0 - step(u_duty, fract(u_offset));
    vec3 sharp = band(uv, floor(u_offset));

    // When closed, a faint motion streak
    vec3 streak = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float t = float(i) / 7.0 - 0.5;
      streak += band(uv, u_offset + t * u_blur);
    }
    streak /= 8.0;
    streak = mix(white, streak, 0.35);

    gl_FragColor = vec4(mix(streak, sharp, shutter), 1.0);
  }
  `;

  shaderProgram = createShader(vert, frag);
}

function draw() {
  background(255);

  if (running && !isDragging) {
    beltPos += (deltaTime / 1000) * SPEED;
  }

  currentOffset = lerp(currentOffset, targetOffset, 0.08);

  shader(shaderProgram);
  shaderProgram.setUniform("u_resolution", [width, height]);
  shaderProgram.setUniform("u_offset", beltPos + currentOffset);
  shaderProgram.setUniform("u_count", COUNT);
  shaderProgram.setUniform("u_duty", DUTY);
  shaderProgram.setUniform("u_blur", BLUR);

  rect(-width / 2, -height / 2, width, height);
}

function mousePressed() {
  isDragging = true;
  previousMouseX = mouseX;
}

function mouseReleased() {
  isDragging = false;
}

function mouseDragged() {
  if (isDragging) {
    let dx = mouseX - previousMouseX;
    targetOffset -= dx / (width / COUNT);
    previousMouseX = mouseX;
  }
}

function keyPressed() {
  if (key === ' ') running = !running;
}

function windowResized() {
  resizeCanvas(windowWidth, bandHeight());
}

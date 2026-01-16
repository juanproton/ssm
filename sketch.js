let s;
let DIM = Math.min(window.innerWidth, window.innerHeight);
var x = 0;
var easing = 0.2;

let asp = 1/1;


let c;
let r;
let tokenData = genTokenData(123);
let tokenData2 = { hash: "0xc144330ad3cbb9ef2fc39bfa89099338ad16457444074575ff94051043b91f92", tokenId: "15000000" }

function genTokenData(projectNum) {let data = {};let hash = "0x";for (var i = 0; i < 64; i++) {hash += Math.floor(Math.random() * 16).toString(16);}data.hash = hash;data.tokenId = (projectNum * 1000000 + Math.floor(Math.random() * 600)).toString();  return data;}

let channelC = 1.;
let channelM = 1.;
let channelY = 1.;
let channelK = 1.;

let uniformPasser;
let gui
let pixel = 5
let panels = [];
let showPanels = true; // Start with panels visible
let maskSize = 0.3

let TWO_PI = Math.PI*2.
let PI = Math.PI

function genTokenData(projectNum) {
  let data = {};
  let hash = "0x";
  for (var i = 0; i < 64; i++) {
    hash += Math.floor(Math.random() * 16).toString(16);
  }
  data.hash = hash;
  data.tokenId = (
    projectNum * 1000000 +
    Math.floor(Math.random() * 500)
  ).toString();
  return data;
}

function computeCanvasSize(
  windowWidth,
  windowHeight,
  aspectRatio,
  margin = 0.01
) {
  let w, h;

  if (windowHeight * aspectRatio <= windowWidth) {
    [w, h] = [windowHeight * aspectRatio, windowHeight];
  } else {
    [w, h] = [windowWidth, windowWidth / aspectRatio];
  }
  return [(1 - margin) * w, (1 - margin) * h];
}


function setup() {
  [w, h] = computeCanvasSize(DIM, DIM, asp);
  w = Math.round(w);
  h = Math.round(h);
  createCanvas(w, h,WEBGL);
  r = new Random(tokenData2);
  
  pixelDensity(4)
  rectMode(CENTER);

  // tokenData = genTokenData(123);
  s = createShader(`
  	attribute vec3 aPosition;attribute vec2 aTexCoord;varying vec2 vTC;void main() {vec4 positionVec4 = vec4(aPosition, 1.0);vTC=aTexCoord;positionVec4.xy = positionVec4.xy * 2.0 - 1.0;gl_Position = positionVec4;
  }`,
  `
    precision highp float;
    #define TWO_PI 6.28318530718
    #define LAMBDA 9.e-2
    #define PI 3.14159
    uniform vec2 resolution;

    uniform float u_time;

    uniform float u_channelC;
    uniform float u_channelM;
    uniform float u_channelY;
    uniform float u_channelK;

    const float TURN = 2. * acos(-1.);

    float generalTime;
    #define HEX(x) (vec3((x >> 16) & 255, (x >> 8) & 255, x & 255) / 255.)

    float pulseOsc(float _freq, float speed,float coord){float osc;float freq = _freq ;float rampX = fract(coord*freq+speed);    float pulseX = 1.0 - smoothstep(0.49, 0.50001, rampX);osc = pulseX;return osc;}

    float rand(vec2 c){
	return fract(sin(dot(c.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float noise(vec2 p, float freq ){
	float unit = resolution.x/freq;
	vec2 ij = floor(p/unit);
	vec2 xy = mod(p,unit)/unit;
	//xy = 3.*xy*xy-2.*xy*xy*xy;
	xy = .5*(1.-cos(PI*xy));
	float a = rand((ij+vec2(0.,0.)));
	float b = rand((ij+vec2(1.,0.)));
	float c = rand((ij+vec2(0.,1.)));
	float d = rand((ij+vec2(1.,1.)));
	float x1 = mix(a, b, xy.x);
	float x2 = mix(c, d, xy.x);
	return mix(x1, x2, xy.y);
}

float pNoise(vec2 p, int res){
	float persistance = .5;
	float n = 0.;
	float normK = 0.;
	float f = 4.;
	float amp = 1.;
	int iCount = 0;
	for (int i = 0; i<50; i++){
		n+=amp*noise(p, f);
		f*=2.;
		normK+=amp;
		amp*=persistance;
		if (iCount == res) break;
		iCount++;
	}
	float nf = n/normK;
	return nf*nf*nf*nf;
}

vec2 rotate2d(vec2 v, float angle) {float c = cos(angle);float s = sin(angle);float x = v.x;float y = v.y;float xRot = x * c - y * s;float yRot = x * s + y * c;return vec2(xRot, yRot);}
vec2 translate(vec2 position, vec2 translation) {return position + translation;}



float parabola( float x, float k ){
    return pow( 4.0*x*(1.0-x), k );
}

float cubicPulse( float c, float w, float x ){
    x = abs(x - c);
    if( x>w ) return 0.0;
    x /= w;
    return 1.0 - x*x*(3.0-2.0*x);
}

float sineOsc(vec2 uv,float rot,float freq,float phase,float amp,float scl){
    vec2 uv2 = rotate2d(uv, rot);
    return cos((uv2.x)*freq*TWO_PI+phase)*amp+scl;
}

float sineOsc2(float coord,float freq,float phase,float amp,float scl){
    return cos((coord)*freq*PI+phase)*amp+scl;
}


float sdfLine(vec2 uv,vec2 p1,vec2 p2){
  vec2 dir = normalize(p2-p1);
    float h = min(1.0,max(0.0,dot(dir,uv-p1)/length(p1-p2)));
    float d = length((uv-p1)-h*(p2-p1));
    return d;
}



float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

float wavefolder(float x, float minVal, float maxVal) {
    float range = maxVal - minVal;
    if(x > maxVal) {
        x = maxVal - mod(x - maxVal, range);
    }
    // If x falls below min, fold it upward.
    if(x < minVal) {
        x = minVal + mod(minVal - x, range);
    }
    return x;
}

float sdf_rect(vec2 uv, vec2 position, vec2 size) {
    vec2 halfSize = size * 0.5;
    vec2 d = abs(uv - position) - halfSize;
    return max(d.x, d.y); // Use the maximum value to return the signed distance
}


uniform vec3 freq;
uniform vec3 phase;
uniform vec3 amp;
uniform vec3 scale;
uniform vec3 offset;
uniform vec3 offset1;
uniform vec3 offset2;

uniform vec3 global;
uniform vec3 global1;

uniform vec3 positionX;
uniform vec3 positionY;


float plot(vec2 st, float pct){
  return  smoothstep( pct-0.01, pct, st.y) -
          smoothstep( pct, pct+0.01, st.y);
}

// float 
float dotgrid(int index, vec2 uv, vec2 translate, float angle, float rot, float freq, float phase, float amp, float scl, vec3 ofs, float t, float visible) {
    float gridScale = 5.0;

    vec2 rotatedUV = uv - translate;
    rotatedUV = rotate2d(rotatedUV, rot);


    vec2 cellIndex = floor(rotatedUV * gridScale);
    vec2 cellCenterRotated = (cellIndex + 0.5) / gridScale;

    vec2 cellCenterWorld = rotate2d(cellCenterRotated, -rot) + translate;

    float cellSize = 0.5;
    
    float fff = sin(cellCenterWorld.x * 5.0 + phase); 
   
    cellSize *= fff;
    cellSize *= visible;

    vec2 cellPos = fract(rotatedUV * gridScale);
    float dist = length(cellPos - vec2(0.5));
    
    float circle = smoothstep(cellSize, cellSize - 0.01, dist);

    return (cellSize > 0.01) ? circle : 0.0;
}


vec4 Render(vec2 newLoc) {
	
  	vec2 coord = gl_FragCoord.xy;

    vec2 uv = (coord / resolution) ;
    uv += newLoc;            
    uv.x *= resolution.x / resolution.y;

    vec4 paperColor = vec4(0.87, 0.89, 0.84, 1.0);

    vec3 cyan = vec3(44./255., 176./255., 207./255.);
    vec3 mag = vec3(239./255., 19./255., 133./255.);
    vec3 yell = vec3(247./255., 247./255., 25./255.);


    vec2 posCyan = vec2(positionX.x-0.5,positionY.x-0.5);
    vec2 posMag = vec2(positionX.y-0.5,positionY.y-0.5);
    vec2 posYell = vec2(positionX.z-0.5,positionY.z-0.5);
    vec2 posBlack = vec2(positionX.z-0.5,positionY.z-0.5);


    float c = dotgrid(0,uv,
    posCyan,0., 15., 
    freq.x,phase.x, amp.x, scale.x, 
    offset,
     u_time + ${r.random_choice([-1.,1.])*w}., u_channelC);
    
    
    float m = dotgrid(1,uv,
    posMag, 0., 75., 
    freq[1],phase[1], amp[1], scale[1], offset1, u_time * ${r.random_choice([-1.,1.])}., u_channelM);
   
   
    float y = dotgrid(2,uv,
    posYell,0., 0., 
    freq[2],phase[2], amp[2], scale[2],
    offset2, 
    u_time * ${r.random_choice([-1.,1.])}.,
    u_channelY);


    float k = dotgrid(3,uv,
    vec2(0.,0.),45., 5., 
    freq[2],phase[2], amp[2], scale[2],
    offset2, 
    u_time * ${r.random_choice([-1.,1.])}.,
    u_channelK);

    vec3 ink = vec3(1.0-c, 1.0-m, 1.0-y);

    vec4 kkkk =  mix(vec4(1.), vec4(vec3(0.),1.0),k);
    vec4 finalColor = mix(vec4(ink,1.), kkkk,k);
   
    vec4 final = (finalColor == vec4(1.0)) ? paperColor : finalColor;
	
	float ffff = mix(0.5,0.,step(0.5,uv.x));

    return final;

}



void main() {


  vec4 nF = vec4(0.);

    float offset = 0.2/resolution.y;
  
    nF += Render( vec2( offset, 0.0));
    nF += Render( vec2( -offset, 0.0));
    nF += Render( vec2( 0.0, offset ));
    nF += Render( vec2( 0.0, -offset));
    nF += Render( vec2(offset, offset));
    nF += Render( vec2(-offset, offset));
    nF += Render( vec2(offset, -offset));
    nF += Render( vec2(-offset, -offset));

     nF/= 7.;

  	gl_FragColor = vec4(vec3(nF),1.0);
  	}`
  );

  uniformPasser = new PassUniforms(s, config);

}



function draw() {

  shader(s);

  uniformPasser.send();
  rect(w/2,h/2,w,h)
  // noLoop();
}



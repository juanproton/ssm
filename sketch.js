
let matrixMode = 0;
let maxDepth = 2;
let subdivProb = 0.1;

let w, h, pad = 0;
let black, white;
let canvas;

let config = {
  choiceBackground: 0,
  types: ['rect']
};

let style = 0
let generalRot = 0
let bgPrev = 0;       
let bgNext = 0;        
let bgDirPrev = "vertical"; 
let bgDirNext = "vertical"; 
let bgProgress = 1;   
let bgSpeed = 0.01;    
let newBg
let globalGridScale = 1;
let globalGridScaleTarget = 1;

let shapeOptions 
let shapes 
// container for grid instances
let gridInstances = [];
let randomRot = false
let initRot = 90
const LAYOUT_MARGIN = 50;
let scheduler
let offset1,offset2,rotMod,rotMultiplyer


let typeCircles = []
let typeDoubles = []
let typeTranslate = 0
let generalRotActive = false
let generalScaleVel = 0.002
function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.id("canvas");

  rectMode(CORNER);
  angleMode(DEGREES);
  pixelDensity(3)
  w = width;
  h = height;
  white = color(251,250,245);
  black = color(0);

  config.choiceBackground = 0;
  bgPrev = config.choiceBackground;
  bgNext = config.choiceBackground;
  bgDirPrev = random(["vertical","horizontal"]);
  bgDirNext = bgDirPrev;
  bgProgress = 1;
   scheduler = new TaskScheduler();

  scheduler.start();


  scheduleCycle();
  scheduler.start();

}

let generalScale = true
let generalTranslate = false
function scheduleCycle() {

  randomRot = random([true,false])
  style = random([0,1,2,3,4,5,6,7,8,8,8,8,9,10,10,10])


  scheduler.addTask(() => triggerGridRegeneration(true,'vertical',random(0.005,0.1),false ), random(3000,10000), random([2,3,4,5,1,8,9,10,11,13]));

  scheduler.addTask(() => triggerGridRegeneration(false,random(['vertical','horizontal'],false), 0.1,random([1]) ), random(1500,2000), Math.floor(random(1,8)));

  scheduler.addTask(() => triggerGridRegeneration(false,random(['vertical']), 0.1,random([1]),false ), random(1300,3000), Math.floor(random(2,10)));
  scheduler.addTask(() => triggerGridRegeneration(false,random(['horizontal']), 0.1,random([1,2]),true ), random(5400,6000), Math.floor(random(1,3)));
  scheduler.addTask(() => triggerGridRegeneration(false,random(['horizontal']), 0.1,random([1]),true ), random(5300,6000), Math.floor(random(1,3)));


  // cuando termina el ciclo, se vuelve a programar
  scheduler.addTask(() => scheduleCycle(), 0, 1);
}

function drawBackgroundSingle(bgId, alpha = 1, dir = "vertical") {
  if (alpha <= 0) return;
  let ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Decide linear gradient direction
  let g;
  if (dir === "horizontal") g = ctx.createLinearGradient(0, 0, width, 0);
  else                       g = ctx.createLinearGradient(0, 0, 0, height);

  if (bgId === 0) {
    // white (base) — fill white
    ctx.fillStyle = "#FBFAF5";
    ctx.fillRect(0,0,width,height);
  } else if (bgId === 1) {
    // blue -> white
    g.addColorStop(0, "#3E6AB7");
    g.addColorStop(1, "#FBFAF5");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,width,height);
  } else if (bgId === 2) {
    // solid blue
    ctx.fillStyle = "#3E6AB7";
    ctx.fillRect(0,0,width,height);
  } else if (bgId === 3) {
    // blue -> black
    g.addColorStop(0, "#3E6AB7");
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,width,height);
  } else if (bgId === 4) {
    // white -> black
    g.addColorStop(0, "#FBFAF5");
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,width,height);
  }

  ctx.restore();
}

function draw() {
  // console.log(frameRate())
  bgProgress += (1 - bgProgress) * bgSpeed;
  bgProgress = constrain(bgProgress, 0, 1);

  let t = easeInOutQuad(bgProgress);

  noStroke();
  fill(white);
  rect(0, 0, width, height);

if (bgPrev === bgNext && bgDirPrev === bgDirNext) {
  drawBackgroundSingle(bgNext, 1, bgDirNext);

} else {
  if (bgProgress < 1 - 1e-5) {
    drawBackgroundSingle(bgPrev, 1 - t, bgDirPrev);
    drawBackgroundSingle(bgNext, t, bgDirNext);
  } else {
    drawBackgroundSingle(bgNext, 1, bgDirNext);
  }
}



  for (let inst of gridInstances) {
    inst.draw();
  }
}

function triggerGridRegeneration(gScale,layOut,vel,nn,gT) {
  let n = floor(random(1, 4));
  generalScale = gScale
  rotMod = random([2,3,4])
  rotMultiplyer = random([90,180])
  initRot = random([0,90,180,270])
  matrixMode - 0
  randomRot = random([true,false])

  generalTranslate=gT
  
  newBg = random([0]);

   shapeOptions = [
    ['cornerCircle','rect'],
    ["rect"],
    ["rect",'circle'],

    ["cornerCircle","circle",'rect','doubleCircle'],

  ];


  if(style==0 || style==1){
    newBg = random([0]);

     shapeOptions = [
    ["rect",'circle'],
     ["rect",'circle','cornerCircle'],
    ['cornerCircle'],
    ['cornerCircle','rect'],
    ['cornerCircle','doubleCircle'],
    ['cornerCircle','doubleCircle','circle'],

    ['triangle','cornerCircle','cornerCircle','cornerCircle','doubleCircle','rect','circle'],
  ];
  }

  if(style==2){
    typeCircles = random([1,6])
    newBg = random([4]);
    shapeOptions = [
      ["rect",'circle'],
    ]
  }
  if(style==3|| style==4){

    typeCircles = random([2,3,5])

    shapeOptions = [
      ["rect",'circle'],
      ["rect",'circle','cornerCircle'],
    ];
  }

  if(style==4){
    // newBg = 1

  }
  if(style==6|| style==7||style==9){

    shapeOptions = [
      ['cornerCircle'],
      ['cornerCircle','rect'],
    ];
  }

  if(style==8){
    
    shapeOptions = [
      ['triangle','cornerCircle','cornerCircle','cornerCircle','rect','circle'],
    ];
  }

  if(style==10){
    shapeOptions = [
      ['cornerCircle'],
    ];
    typeDoubles = random([ [2],[0,6],[0,6,7],[0,7],[1,7],[6,7],[0,1],[0,3],[0,3,4],[7],[6],[1],[0]])

  }

  if(style==11){
    shapeOptions = [
      ['cornerCircle'],
      ['triangle','cornerCircle','cornerCircle','cornerCircle','rect','circle'],
      ['cornerCircle'],

    ];
    typeDoubles = random([ [2],[0,6],[0,6,7],[0,7],[1,7],[6,7],[0,1],[0,3],[0,3,4],[7],[6],[1],[0]])

  }

  if(style==5){

    shapeOptions = [
      ['triangle','cornerCircle','rect','circle'],

    ];
    
    typeDoubles = random([ [2],[0,6],[0,6,7],[0,7],[1,7],[6,7],[0,1],[0,3],[0,3,4],[7],[6],[1],[0]])

  }



  

  shapes = random(shapeOptions);


  for (let inst of gridInstances) {
    for (let c of inst.newCells) {
      c.scaleTarget = 0;
      // c.translateTarget=0
      c.animFrame = 0;
      c.scaleSpeed = vel;
    }
  }

  generateScene(nn,layOut);
}

function keyPressed() {


  if (key == 'g') {
    let n = floor(random(1, 4));

    for (let inst of gridInstances) {
      for (let c of inst.newCells) {
        c.scaleTarget = 0;   
        // c.translateTarget=0            
        c.animFrame = 0;               
        c.scaleSpeed = 0.2

      }
    }

    generateScene(1);
  }
}

function generateScene(numInstances = null, layoutMode = null) {
  if (numInstances == null) numInstances =0;
  if (layoutMode == null) layoutMode = random(['horizontal','vertical']);

  generalRot = 0

  if(generalTranslate==true){
    typeTranslate = random([0,1,2,3,4])
  }else{
    typeTranslate = 0
  }

 
  if(generalScale==true){
    numInstances = 1
  }
  
  bgPrev = config.choiceBackground;
  bgDirPrev = bgDirNext;

  config.choiceBackground = newBg;
  bgNext = newBg;
  bgDirNext = random(["vertical"]);
  bgProgress = 0;

  let gridOptions

  let newInstances = [];

  if (layoutMode === 'horizontal') {
    const totalMargin = LAYOUT_MARGIN * (numInstances + 1);
    const availW = max(1, w - totalMargin);
    const instW = availW / numInstances;
    const instH = h - (LAYOUT_MARGIN * 2);

    for (let i = 0; i < numInstances; i++) {
      const x = LAYOUT_MARGIN + i * (instW + LAYOUT_MARGIN);
      const y = LAYOUT_MARGIN;
      newInstances.push(new GridInstance(i, x, y, instW, instH,0.8));
    }

    gridOptions = 
    [
    // [8,12],
    [12,12],
    [4,6],
    [4,8],
    [8,8],
    [4,4]
  ];

  } else {
    const totalMargin = LAYOUT_MARGIN * (numInstances + 1);
    const availH = max(1, h - totalMargin);
    const instH = availH / numInstances;
    const instW = w - (LAYOUT_MARGIN * 2);
    let randomScl = 1


    if(numInstances==1){
      
      if(generalScale==true){
        randomScl =random(2,4)
      }else{
        randomScl = 1


      }

    }
 

    for (let i = 0; i < numInstances; i++) {
      const x = LAYOUT_MARGIN;
      const y = LAYOUT_MARGIN + i * (instH + LAYOUT_MARGIN);
      newInstances.push(new GridInstance(i, x, y, instW, instH,randomScl));
    }

    gridOptions = 
  [
  [40,12],
  [20,4],
  [10,4],
  [30,4],
  
  ];

 

  if(generalScale){

      gridOptions = 
  [
  [40,12],
  // [20,4],
  // [10,4],
  [30,4],
    [30,8],

  ];

  }

  if(numInstances>1){
    gridOptions = 
    [
    [20,4],
    [10,4],
    [30,4],
    
    ];
  }

  }


  let choice = random(gridOptions);

  for (let inst of newInstances) {


    if(generalScale==true){
      subdivProb = random(0.,0.5)
     }else{
      subdivProb = random(0.,0.2)
     }

   if(gridOptions == [40,12]){
   subdivProb = random(0.,0.2)
  }


    inst.cols = choice[0];
    inst.rows = choice[1];
    inst.pad = 0;

    inst.createCells(true);


    for (let c of inst.newCells) c.currentState = null;
  }

  gridInstances = gridInstances.concat(newInstances);

  if (gridInstances.length > 6) {
    gridInstances = gridInstances.slice(gridInstances.length - 6);
  }

}

class GridInstance {
  constructor(id, x, y, wBox, hBox,initScale) {
    this.id = id;
    this.boxX = x;
    this.boxY = y;
    this.boxW = wBox;
    this.boxH = hBox;

    
    this.cols = 4;
    this.rows = 4;
    this.pad = 0;

    this.newCells = [];   


    this.subTree = null;

    this.scale = initScale; 
    this.scaleSpeed = 0.2;

    this.moveType = random([0,1,2,3])
    this.maxSpeed = random(0.09,0.1)
    this.minSpeed = 0.03

  }



  createCells(isNew = false) {
    const cellSize = Math.min((this.boxW - this.pad * 2) / this.cols, (this.boxH - this.pad * 2) / this.rows);
    const gridW = cellSize * this.cols;
    const gridH = cellSize * this.rows;
    const startX = this.boxX + (this.boxW - gridW)/2;
    const startY = this.boxY + (this.boxH - gridH)/2;

    let quadCols = (matrixMode === 0 || matrixMode === 1) ? ceil(this.cols/2) : this.cols;
    let quadRows = (matrixMode === 0 || matrixMode === 2) ? ceil(this.rows/2) : this.rows;
    this.subTree = [];
    for (let i = 0; i < quadCols; i++) {
      this.subTree[i] = [];
      for (let j = 0; j < quadRows; j++) {
        this.subTree[i][j] = createSubdivisionTree(i,j,0);
      }
    }

    let allLeafCells = [];

    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        let iSrc = i, jSrc = j;
        let mirroredX = false, mirroredY = false;

        if (matrixMode === 0) {
          iSrc = Math.min(i, this.cols-1-i);
          jSrc = Math.min(j, this.rows-1-j);
          mirroredX = (i !== iSrc);
          mirroredY = (j !== jSrc);
        } else if (matrixMode === 1) {
          iSrc = Math.min(i, this.cols-1-i);
          mirroredX = (i !== iSrc);
        } else if (matrixMode === 2) {
          jSrc = Math.min(j, this.rows-1-j);
          mirroredY = (j !== jSrc);
        }

        let baseNode = this.subTree[iSrc][jSrc];
        let node = mirrorSubdivisionTree(baseNode, mirroredX, mirroredY);

       
        let extraRot = 0;
        if (mirroredX && !mirroredY) extraRot = 90;
        else if (!mirroredX && mirroredY) extraRot = 270;
        else if (mirroredX && mirroredY) extraRot = 180;

        let rot = (node.rot) + extraRot;

        let cellX = startX + i * cellSize;
        let cellY = startY + j * cellSize;

        let xOffset = w/2 -cellSize/2
        let yOffset = h/2 -cellSize/2

        
        if(typeTranslate==0){
          
          generalScale=true
          generalScaleVel = 0.0005
          
          xOffset = cellX
          yOffset = cellY
        }

        if(typeTranslate==1){
          generalScale=true
          generalScaleVel = 0.0005
          
          xOffset =  w/2 -cellSize/2
          yOffset =  h/2 -cellSize/2
        }

        if(typeTranslate==2){

          generalScale=true
          generalScaleVel = 0.0005

          let ff = w/4
          xOffset =  random(w/2-ff*2,w/2+ff*2) -cellSize/2
          yOffset =   random(h/2-ff,h/2+ff) -cellSize/2
        }

        if(typeTranslate==3){

          generalScale=true
          generalScaleVel = 0.0005

            if(j>=Math.floor(this.rows/2)){
               xOffset = w/2+cellSize*2
            }else{
              xOffset = w/2-cellSize*2
            }


             yOffset=cellY
        }

        if(typeTranslate==4){
          generalScale=true
          generalScaleVel = 0.0005
          if(j>=Math.floor(this.rows/2)){
             xOffset = cellX+cellSize*4
          }else{
            xOffset = cellX-cellSize*4
          }


           yOffset=cellY
      }

     

        collectLeafCells(node, cellX, cellY, cellSize, cellSize,xOffset,yOffset, rot, 0, allLeafCells);
      }
    }

    let delayMode = floor(random(4));

    if (allLeafCells.length > 0) {
      const cxGrid = startX + gridW/2;
      const cyGrid = startY + gridH/2;

      let maxDist = 0;
      for (let lc of allLeafCells) {
        const cx = lc.x + lc.w/2;
        const cy = lc.y + lc.h/2;
        const d = dist(cx, cy, cxGrid, cyGrid);
        if (d > maxDist) maxDist = d;
        lc._dist = d;
      }

      let minCX = Infinity, maxCX = -Infinity;
      for (let lc of allLeafCells) {
        let cx = lc.x + lc.w/2;
        if (cx < minCX) minCX = cx;
        if (cx > maxCX) maxCX = cx;
        lc._cx = cx;
      }

      let maxDelay = 5.0;

      for (let lc of allLeafCells) {
        let norm = 0;
        if (delayMode === 0) {
          norm = map(lc._cx, minCX, maxCX, 0, 1);
        } else if (delayMode === 1) {
          norm = map(lc._cx, minCX, maxCX, 1, 0);
        } else if (delayMode === 2) {
          norm = lc._dist / maxDist;
        } else if (delayMode === 3) {
          norm = 1 - (lc._dist / maxDist);
        } else {
          lc.x = random(this.boxX, this.boxX + this.boxW - lc.w);
          lc.y = random(this.boxY, this.boxY + this.boxH - lc.h);
          lc.rot = random([0,90,180,270]);
          norm = random(0,1);
        }

        // lc.start = norm * maxDelay + (lc._depth * 0.08);
        // lc.duration = random(0.1, 1.9);

let speedNorm = 0;
let cellSpeedMode =this.moveType
if (cellSpeedMode === 0) {
  speedNorm = map(lc._cx, minCX, maxCX, 0, 1);

} else if (cellSpeedMode === 1) {
  speedNorm = map(lc._cx, minCX, maxCX, 1, 0);

} else if (cellSpeedMode === 2) {
  speedNorm = lc._dist / maxDist;

} else if (cellSpeedMode === 3) {

  speedNorm = 1 - (lc._dist / maxDist);
}else if (cellSpeedMode === 4) {

  let s0 = map(lc._cx, minCX, maxCX, 0, 1);        
  let s1 = map(lc._cx, minCX, maxCX, 1, 0);        
  let s2 = lc._dist / maxDist;                    
  let s3 = 1 - (lc._dist / maxDist);          

  speedNorm = (s0 + s1 + s2 + s3) * 0.8;       
}

speedNorm = constrain(speedNorm, 0, 1);

lc.scaleSpeed = lerp(this.minSpeed, this.maxSpeed, speedNorm);

  if (isNew) this.newCells.push(lc);}}
  }

  draw() {


    push();
    translate(this.boxX + this.boxW/2, this.boxY + this.boxH/2);
    rotate(generalRot)

    scale(this.scale)

    translate(-(this.boxX + this.boxW/2), -(this.boxY + this.boxH/2));


    for (let i = this.newCells.length - 1; i >= 0; i--) {
      let c = this.newCells[i];
      c.animFrame++;
    
      let animDuration = c.animDuration
      let delay = c.startTranslate; 
      
      let tCell = (c.animFrame - delay) / animDuration;
      tCell = constrain(tCell, 0, 1);  // clamp 0..1
      let easeT = easeOutQuint(tCell);


      let tCell2 = (c.animFrame - c.startRotAnim) / c.animDurationRot;
      tCell2 = constrain(tCell2, 0, 1);  // clamp 0..1
      let easeT2 = easeOutQuint(tCell2);

      c.scale += (c.scaleTarget - c.scale) * c.scaleSpeed;
      c.translate += (c.translateTarget - c.translate) * easeT;


      c.rotation += (c.startRot - c.rotation) * easeT2;

      let finalScl = c.scale;

      let finalRot = lerp(c.startRot, c.endRot, easeT2);
    
      push();

      let finalPosX = lerp(c.xOffset,c.x, c.translate);
      let finalPosY = lerp(c.yOffset, c.y, c.translate);



      if(generalTranslate){
        translate(finalPosX+ c.w/2, finalPosY+ c.h/2);

      }else{
        generalScaleVel = 0.002

      translate(c.x+ c.w/2, c.y+ c.h/2);

      }

      rotate(c.rot);
      scale(finalScl);
      translate(-c.w/2, -c.h/2);

      c.drawSubdivision(c.tree, 0, 0, c.w, c.h);
    
      pop();

    }
  

    pop(); 

    if(generalScale){
      this.scale+=generalScaleVel
    }

    if(generalRotActive){
      generalRot+=0.05

    }
  }
  
}


function easeOutQuint(t) {
  return 1 - pow(1 - t, 5);
}

function easeInOutQuart(t) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2;
}

function collectLeafCells(node, x, y, w, h,xOffset,yOffset,parentRot, depth, outArray) {
  let nodeRot = parentRot

  if (!node.subdivide) {
    let leaf = new Cell(-1, -1, x, y, w, h, nodeRot, node);
    leaf.animFrame = 0;
    leaf._depth = depth || 0;
   
    
    leaf.xOffset = xOffset
    leaf.yOffset = yOffset
    outArray.push(leaf);
  } else {
    const subW = w / 2;
    const subH = h / 2;
    for (let sx = 0; sx < 2; sx++) {
      for (let sy = 0; sy < 2; sy++) {
        let child = node.children[sx][sy];
        let cx = x + sx * subW;
        let cy = y + sy * subH;
        collectLeafCells(child, cx, cy, subW, subH,xOffset,yOffset, nodeRot, depth + 1, outArray);
      }
    }
  }
}

function createSubdivisionTree(i,j,depth) {

let typeRect = random([0,1,2,3])
let typeCircle = random([0,1,2,3])
let cornerArcType = random([0,1])
let shapeType = random(shapes)
let typeTriangle = random([0,1])
let rot 

if(randomRot==true){
  rot = random([0,90,180,270])
}else{
rot = initRot + Math.floor(i*2+j)%rotMod *rotMultiplyer

}

if(style==0){
  typeRect = random([0])
  typeCircle = random([0])
  cornerArcType = random([0,1])
  typeTriangle = 1
}

if(style==1){
  typeRect = random([0,1])
  typeCircle = random([0,5,0,5,4])
  cornerArcType = random([0,1,6,7])
}

if(style==2){
  typeRect = random([0,2,4])
  typeCircle = typeCircles
  cornerArcType = random([0,1])
}

if(style==3){
  typeRect = random([3,1,3,1,3,1,0,4])
  typeCircle = typeCircles
  cornerArcType = random([7,6])
}

if(style==4){
  typeRect = random([0,2,4,0,2,0,2,3])
  typeCircle = random([1,6,2]),
  cornerArcType = random([5,2])
}

if(style==5){
  typeRect = random([3,1,3,1,3,1,0,4])
  typeCircle = random([0,1,2])
  cornerArcType = random(typeDoubles)
}

if(style==6){
  cornerArcType = random([random([5,2])])
}

if(style==7){
  cornerArcType = random([random([3,4])])
}

if(style==8){
  typeRect = random([0,1,2,3])
  typeCircle = random([0,2,5])
  cornerArcType = random([0,1,2,3,4,5,6,7])
}

if(style==9){
  cornerArcType = random([0,1,2,3,4,5,6,7])
}

if(style==10){
  cornerArcType = random(typeDoubles)
}

if(style==11){
  typeRect = random([0,1,2,3])
  cornerArcType = random(typeDoubles)
}

  let node = {
    subdivide: (depth < maxDepth && random() < subdivProb),
    rot:rot,
    shapeType:shapeType ,
    children: [],
    gradientType: null,
    gradFactor: random(2,4),
    typeRect: typeRect,
    typeCircle: typeCircle,
    typeTriangle:typeTriangle,
    doubleType:random([0,1]),
    cornerArcType: cornerArcType
  };

  if (node.subdivide) {
    for (let sx = 0; sx < 2; sx++) {
      node.children[sx] = [];
      for (let sy = 0; sy < 2; sy++) {
        node.children[sx][sy] = createSubdivisionTree(i,j,depth + 1);
      }
    }
  }
  return node;
}

class Cell {
  constructor(i,j,x,y,w,h,rot,tree) {
    this.i = i;
    this.j = j;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.rot = rot;
    this.tree = tree;
    this.animFrame = 0;
    this.start = 0;
    this.startTranslate=random(50,200)
    this.durationTranslate =0 
    this.duration = 1;
    this._depth = 0;
    this.startRot = random([0,90,180,270])
    this.endRot   = rot;  
    this.animDuration = random(100,400)
    this.xOffset = 0
    this.yOffset = 0
    this.speedOffset =0.01
    this.translate = 0

    this.scale = 0;
    this.scaleTarget = 0.99;
    this.translateTarget = 1.
    this.rotation = 0

    this.animDurationRot = random(50,100)
    this.startRotAnim=40
    this.rotateTarget = 0

    this.scaleSpeed = random(0.01, 0.98); // cada celda tiene su propio tempo

    if(typeTranslate==4){
      this.startTranslate=random(50,300)
      this.animDuration = random(1000,2000)
    }


    if(typeTranslate==3){
      this.startTranslate=random(50,200)
      this.animDuration = random(200,2000)
    }

    if(typeTranslate==2){
      this.startTranslate=random(50,200)
      this.animDuration = random(2000,10000)
    }

    if(typeTranslate==1){
      this.startTranslate=50
      this.animDuration = 2000
    }

  }

  drawSubdivision(node,x,y,w,h){
    if(!node.subdivide){
      if(node.shapeType === "triangle"){this.drawTriangle(x,y,w,h,node); }
      else if(node.shapeType === "circle"){ fill(0); stroke(0); this.drawCircle(x,y,w,h,node); }
      else if(node.shapeType === "rect") this.drawRectGradient(x,y,w,h,node);
      else if(node.shapeType === "cornerCircle") this.drawCornerArc(x,y,w,h,0,90,node);
      else if(node.shapeType === "triangle") this.drawTriangle(x,y,w,h,0,90,node);
      else if(node.shapeType === "doubleCircle") this.doubleCircle(x,y,w,h,node);

    } else {
      const subW = w/2, subH = h/2;
      for (let sx = 0; sx < 2; sx++) {
        for (let sy = 0; sy < 2; sy++) {
          this.drawSubdivision(node.children[sx][sy], x + sx*subW, y + sy*subH, subW, subH);
        }
      }
    }
  }

  doubleCircle(x, y, ww, hh, node) {
    let ctx = drawingContext;
    let cx = x + ww/2;
    let cy = y + hh/2;
    let r = Math.min(ww, hh) * 0.5;
  
    if (node.doubleType === 0) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = "#FBFAF5";
    } else {
      ctx.fillStyle = "#FBFAF5";
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = "#000000";
    }
  
    ctx.beginPath();
    ctx.arc(cx - r, cy, r, -Math.PI/2, Math.PI/2);
    ctx.fill();
  
    ctx.beginPath();
    ctx.arc(cx + r, cy, r, Math.PI/2, Math.PI + Math.PI/2);
    ctx.fill();
  }

  drawTriangle(x,y,w,h,node){ 

    if(node.typeTriangle==0){
      fill("#3E6AB7");
    }

    if(node.typeTriangle==1){
      fill("#000000");
    }

    noStroke()
    beginShape(); vertex(x,y); vertex(x,y+h); vertex(x+w,y); endShape(CLOSE); 
  
  }
    
    drawCircle(x, y, w, h, node) {
      let cx = x + w/2;
      let cy = y + h/2;
      let r = Math.min(w, h) * 0.5;
      let ctx = drawingContext;

      // --- TYPE 0: solid black ---
      if (node.typeCircle === 0) {
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // --- TYPE 2: white → black ---
      if (node.typeCircle === 1) {
        let g = ctx.createRadialGradient(cx-r/2, cy, 0, cx-r/2, cy, r);
        g.addColorStop(0, "#FBFAF5");
        g.addColorStop(1, "#000000");
    
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    
      // --- TYPE 3: blue → white ---
      if (node.typeCircle === 2) {
        let g = ctx.createRadialGradient(cx-r/2, cy, 0, cx-r/2, cy, r);
        g.addColorStop(0, "#FBFAF5");

        g.addColorStop(1, "#3E6AB7");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (node.typeCircle === 3) {
        let g = ctx.createRadialGradient(cx-r/2, cy, 0, cx-r/2, cy, r);
        g.addColorStop(1, "#000000");

        g.addColorStop(0, "#3E6AB7");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (node.typeCircle === 4) {
        ctx.strokeStyle = "#000000";   // negro
        ctx.lineWidth = 1;
      
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      if (node.typeCircle === 5) {
        ctx.fillStyle = "#3E6AB7";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (node.typeCircle === 6) {
        // Linear gradient from left (black) to right (white)
        let g = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        g.addColorStop(0, "#000000");
        g.addColorStop(1, "#FBFAF5");
      
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

    }
    
  drawRectGradient(x, y, w, h, node) {
    let ctx = drawingContext;

    if(node.typeRect==4){
      return 
    }
  
    if (node.typeRect === 0) {
      noStroke();
      fill(black);
      rect(x, y, w, h);
      return;
    }
  
    if (node.typeRect === 1) {
      noStroke();
      fill('#3E6AB7');
      rect(x, y, w, h);
      return;
    }
  
    if (node.typeRect === 2) {
      let g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#FBFAF5");
      g.addColorStop(1, "#000000");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      return;
    }
    
    if (node.typeRect === 3) {
      let g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#3E6AB7");
      g.addColorStop(1, "#FBFAF5");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      return;
    }

    if (node.typeRect === 5) {
      
      let t = map(x, 0, width, 0, 1);   // t entre 0 y 1

      // Lerp manual entre negro y blanco cálido
      let r0 = 0, g0 = 0, b0 = 0;          // negro
      let r1 = 251, g1 = 250, b1 = 245;    // blanco cálido (#FBFAF5)

      let r = lerp(r0, r1, t);
      let g = lerp(g0, g1, t);
      let b = lerp(b0, b1, t);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, w, h);
      return;
    }

  }
  drawCornerArc(x, y, w, h, corner = 0, arcAngle = 90, node) {
    let ctx = drawingContext;
  
    let cx = x, cy = y;
    if (corner === 1) { cx = x + w; cy = y; }
    else if (corner === 2) { cx = x + w; cy = y + h; }
    else if (corner === 3) { cx = x; cy = y + h; }
  
    let r = Math.min(w, h);
  
    // arco base
    let start = (corner * 90) * Math.PI / 180;
    let end   = (corner * 90 + arcAngle) * Math.PI / 180;

    if (node.cornerArcType === 6) {
      ctx.fillStyle = "#3E6AB7";
  
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (node.cornerArcType === 7) {
      ctx.fillStyle = "#3E6AB7";
  

      ctx.fillRect(x, y, w, h);
  
      ctx.fillStyle = "#FBFAF5";
  
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
      return;
    }


    if (node.cornerArcType === 0) {
      ctx.fillStyle = "#000000";
  
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
      return;
    }
  
    // ===========================
    //  TYPE 1: NEGRO + RECT BLANCO STROKE
    // ===========================
    if (node.cornerArcType === 1) {
      ctx.fillStyle = "#000000";
  
      ctx.strokeStyle = "#FBFAF5";
      ctx.lineWidth = 20;
      ctx.fillRect(x, y, w, h);
  
      ctx.fillStyle = "#FBFAF5";
  
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
      return;
    }
  
    // ===========================
    //  TYPE 5: RECT GRADIENT + ARCO BLANCO
    // ===========================
    if (node.cornerArcType === 4) {
      // Rectángulo con gradiente blanco → azul
      let g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, "#FBFAF5");
      g.addColorStop(1, "#3E6AB7");
  
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
  
      // Arco blanco arriba
      ctx.fillStyle = "#FBFAF5";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
  
      return;
    }

    if (node.cornerArcType === 5) {
      // Rectángulo con gradiente blanco → azul
      let g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, "#FBFAF5");
      g.addColorStop(1, "#000000");
  
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
  
      // Arco blanco arriba
      ctx.fillStyle = "#FBFAF5";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fill();
  
      return;
    }
  
    // ===========================
    //  DEFAULT TYPES 2 y 3 (gradientes previos)
    // ===========================
    let g = ctx.createLinearGradient(x, y, x + w, y);
  
    if (node.cornerArcType === 2) {
      g.addColorStop(0, "#FBFAF5");
      g.addColorStop(1, "#000000");
    } 
     if (node.cornerArcType === 3) {
      g.addColorStop(0, "#FBFAF5");
      g.addColorStop(1, "#3E6AB7");
    }

  
    ctx.fillStyle = g;
  
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fill();
  }
  
}


function easeInOutQuad(t) {
  return t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
}


function mirrorSubdivisionTree(node, mirrorX, mirrorY) {
  let newNode = {
    subdivide: node.subdivide,
    rot: node.rot,
    shapeType: node.shapeType,
    children: [],
    gradientType: node.gradientType,
    gradFactor: node.gradFactor,
    typeRect: node.typeRect,
    typeCircle: node.typeCircle,
    typeTriangle: node.typeTriangle,

    doubleType: node.doubleType,

    cornerArcType: node.cornerArcType,

  };

  let r = node.rot || 0;

  newNode.rot = r;

  if (!node.subdivide) return newNode;

  for (let sx = 0; sx < 2; sx++) {
    newNode.children[sx] = [];
    for (let sy = 0; sy < 2; sy++) {
      let mx = mirrorX ? 1 - sx : sx;
      let my = mirrorY ? 1 - sy : sy;

      newNode.children[sx][sy] =
        mirrorSubdivisionTree(node.children[mx][my], mirrorX, mirrorY);
    }
  }

  return newNode;
}


class TaskScheduler {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  addTask(callback, interval, repeat = 1) {
    this.queue.push({ callback, interval, repeat });

    if (!this.running) {
      this.start();
    }
  }

  start() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    this.runNext();
  }

  runNext() {
    if (this.queue.length === 0) {
      this.running = false;
      return;
    }

    let task = this.queue.shift();
    let count = 0;

    let run = () => {
      task.callback();
      count++;
      if (count < task.repeat) {
        setTimeout(run, task.interval);
      } else {
        this.runNext();
      }
    };

    run();
  }
}
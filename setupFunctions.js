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

function handleKeyDown(event) {

  if (event.key === 's') {
    save = true
    // generate()
    // saveSVG4();
    saveSVG2();
    save = false
  }
  if (event.key === 'g') {
    generate();
  }

  if (event.key === 'h') {
    togglePane();
  }

}

function togglePane(){
  if (!pane) return;
  pane.element.style.display = (pane.element.style.display === 'none') ? '' : 'none';
}

function exportSVGToConsole(){console.log(p.project.exportSVG({asString: true}));}

function saveSVG() {
  // 1. Export SVG string from paper.js
  let svgString = p.project.exportSVG({ asString: true });

  // 2. Parse the SVG string into a DOM document
  let parser = new DOMParser();
  let doc = parser.parseFromString(svgString, 'image/svg+xml');
  let svgEl = doc.documentElement;

  // 3. Set physical canvas size in 'mm' and lock viewBox to pixel coordinates
  svgEl.setAttribute('width', `${effWidth}mm`);
  svgEl.setAttribute('height', `${effHeight}mm`);
  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);

  // 4. Convert back to string
  let serializer = new XMLSerializer();
  let updatedSvgContent = serializer.serializeToString(doc);

  // 5. Inject filter (if needed)
  const noiseFilter = `
    <defs>
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="5.4" numOctaves="4" result="noise" />
        <feColorMatrix in="noise" type="saturate" values="0" result="grayNoise" />
        <feComponentTransfer in="grayNoise" result="dimNoise">
          <feFuncA type="linear" slope="0.7"/>
        </feComponentTransfer>
        <feBlend in="SourceGraphic" in2="dimNoise" mode="overlay" />
      </filter>
    </defs>
  `;

  updatedSvgContent = updatedSvgContent.replace(/<svg([^>]*)>/, `<svg$1>${noiseFilter}`);
  updatedSvgContent = updatedSvgContent.replace(/<svg([^>]*)>/, `<svg$1 filter="url(#noiseFilter)">`);

  // 6. Trigger download
  var blob = new Blob([updatedSvgContent], { type: 'image/svg+xml;charset=utf-8' });
  var downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = `canvas_${effWidth}x${effHeight}mm.svg`;
  downloadLink.click();
}
function deleteAllElements() {
  arrayOfCols = []
  var project = p.project;
  project.layers.forEach(function(layer) {
    layer.removeChildren();
  });
  p.view.update();
}



function createVector(x,y,debug=null){
  if(debug==true){createCircle(new p.Point(x,y),2,black,black)}
  return new p.Point(x,y)
}
function randomVector(scl){return createVector(r.random_num(scl,w-scl),r.random_num(scl,h-scl))}
function randomVectorPolar(pos, radius, f = 1) {
  const angle = Math.random() * Math.PI * 2;
  const randR = Math.random();

  const t = 1 - f;
  const r = randR * f + 1 * t;

  const dist = r * radius;

  return createVector(
    pos.x + Math.cos(angle) * dist,
    pos.y + Math.sin(angle) * dist
  );
}
function lerp(a, b, t) {return (1 - t) * a + t * b;}

function lerpVector(a, b, f) {let aa = lerp(a.x, b.x, f);let bb = lerp(a.y, b.y, f);return new p.Point(aa, bb);}


function randomPointOutsidePolygon(path){
  let tries = 0;

  while(true){
    let pp = new p.Point(Math.random() * w, Math.random() * h);

    if(!path.contains(pp)){
      return pp;
    }

    tries++;
    if(tries > 10000){
      console.warn("Could not find point outside polygon");
      return null;
    }
  }
}

function shuffleArray2(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(r.random_dec() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function reverseArray(arr) {
  var reversed = [];
  for (var i = arr.length - 1; i >= 0; i--) {
    reversed.push(arr[i]);
  }
  return reversed;
}

function findAngleBetweenPoints(point1, point2) {
  let angleDegrees = Math.atan2(point2.y - point1.y, point2.x - point1.x) * (180 / Math.PI);

  if (angleDegrees < 0) {
    angleDegrees += 360;
  }

  return angleDegrees;
}

function degrees(rad) {
  return rad * (180 / Math.PI);
}

function pointFromAngle(pos,angle,length) {

  let rotatedX = pos.x + Math.cos(radians(angle)) * length;
  let rotatedY = pos.y + Math.sin(radians(angle)) * length;

  return createVector(rotatedX,rotatedY)
}


function lerpToAngle(pos,angle,length){
  let rotatedX = pos.x + Math.cos(radians(angle)) * length;
  let rotatedY = pos.y + Math.sin(radians(angle)) * length;

  return createVector(rotatedX,rotatedY)
}

function findIndex(pathA, ppp) {
  let indexOfNewSegment = -1;
  let tolerance =0.001; // Adjust tolerance as needed
  for (let i = 0; i < pathA.segments.length; i++) {
    let segmentPoint = pathA.segments[i].point;

    if (Math.abs(ppp.x - segmentPoint.x) < tolerance &&
    Math.abs(ppp.y - segmentPoint.y) < tolerance) {
      indexOfNewSegment = i;
      break;
    }
  }

  return indexOfNewSegment;
}

function stepGradient(colorA, colorB, steps) {
  const colors = [];

  if (steps <= 0) return colors;
  if (steps === 1) return [colorA];

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = colorA.red + (colorB.red - colorA.red) * t;
    const g = colorA.green + (colorB.green - colorA.green) * t;
    const b = colorA.blue + (colorB.blue - colorA.blue) * t;
    colors.push(new p.Color(r, g, b));
  }

  return colors;
}


function make2DArray(cols, rows) {
  let arr = new Array(cols);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = new Array(rows);
    // Fill the array with 0s
    for (let j = 0; j < arr[i].length; j++) {
      arr[i][j] = 0;
    }
  }
  return arr;
}


// DRAW

function lineFromPoint(pos,len,angle,center=true){

  if(center==true){
    let p1 = pointToangle(pos,angle,len/2)
    let p2 = pointToangle(pos,angle,-len/2)
    return createLine(p2,p1,null)
  }else{
    let p1 = pos
    let p2 = pointToangle(pos,angle,len)
    return createLine(p2,p1,null)
  }

}

function createTriangle(a, b, c, fill='black', sW=1) {
  let tri = new p.Path()
  tri.add(a)
  tri.add(b)
  tri.add(c)
  tri.closed = true
  tri.strokeColor = fill
  tri.strokeWidth = sW
  tri.fillColor = fill
  return tri
}

function createLineFromCenter(origin,dist,angle){
  let p1 = pointFromAngle(origin,angle,dist/2)
  let p2 = pointFromAngle(origin,angle,-1*dist/2)

  return createLine(p1,p2)
}

function createLine(from,to,fill='black',sW=1){
  let ppp = new p.Path.Line(from,to)
  ppp.strokeColor = fill
  ppp.strokeWidth=sW
  return ppp
}

function createCircle(initPos,r=5,fill=null,stroke=null,strokeW=1,blend="normal"){
 
  let ccc = new p.Path()
  for(let i = 0;i<360;i+=2){
    let x = initPos.x+ Math.sin(radians(i))*r
    let y = initPos.y+ Math.cos(radians(i))*r
    ccc.addSegment(createVector(x,y))
  }
  
  ccc.closed = true
  ccc.fillColor = fill
  ccc.strokeColor = stroke

  return ccc
}

function createArc(center, radius, startAngle, arcLength, nPoints = 100) {
  let path = new p.Path();
  path.strokeColor = 'black';
  path.closed = false;

  // Normalize start angle
  let start = startAngle % 360;
  if (start < 0) start += 360;

  // Compute end angle with wrapping
  let end = start + arcLength;

  // Sample points along the arc
  for (let i = 0; i <= nPoints; i++) {
    let t = i / nPoints;
    let angle = start + t * arcLength;
    let rad = (angle % 360) * Math.PI / 180;

    let x = center.x + Math.cos(rad) * radius;
    let y = center.y + Math.sin(rad) * radius;

    path.add(new p.Point(x, y));

    
  }

  // let ppp = new p.Path({
  //   segments: [
  //     path.firstSegment.point,
  //     path.lastSegment.point
  //   ],
  //   strokeColor: black
  // });

  return path;
}


// function createArc(initPos,r=5,len,rot,fill=null,stroke=null){
//   let ccc = new p.Path()

//   for(let i = 0;i<len;i++){
//     let x = initPos.x+Math.sin(radians(i))*r
//     let y = initPos.y+ Math.cos(radians(i))*r
//     ccc.addSegment(createVector(x,y))
//   }

//   ccc.rotate(rot)
//   ccc.closed =  false
//   ccc.fillColor = fill
//   ccc.strokeColor = stroke

//   return ccc

// }


function createRectangle2(pos, w, h, corner="center", stroke=null, fill=null, strokeWidth=1) {
  let x = pos.x;
  let y = pos.y;

  if (corner === "center") {
    x = pos.x - w / 2;
    y = pos.y - h / 2;
  }

  if (corner === "top-right") {
    x = pos.x - w;
  }

  if (corner === "bottom-left") {
    y = pos.y - h;
  }

  if (corner === "bottom-right") {
    x = pos.x - w;
    y = pos.y - h;
  }

  return new p.Path.Rectangle({
    point: new p.Point(x, y),
    size: [w, h],
    strokeColor: stroke,
    fillColor: fill,
    strokeWidth: strokeWidth
  });
}


function createRectangle(pos, w, h, 
  fromCenter = true, stroke = null, fill = null,strokeWidth=1) {
  let topLeft;
  if (fromCenter) {
    topLeft = new p.Point(pos.x - w / 2, pos.y - h / 2);
  } else {
    topLeft = new p.Point(pos.x, pos.y);
  }
  return new p.Path.Rectangle({
    point: topLeft,
    size: [w, h],
    strokeColor: stroke,
    fillColor: fill,
    strokeWidth:strokeWidth
  });
}

function createSuperellipse(center, a, b, f, nPoints = 200) {
  let pp = new p.Path();
  pp.closed = true;

  for (let i = 0; i < nPoints; i++) {
    let theta = (i / nPoints) * 2 * Math.PI;
    let cosT = Math.cos(theta);
    let sinT = Math.sin(theta);

    // Coordenadas usando la fórmula paramétrica de la superelipse
    let x = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / f) * a;
    let y = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / f) * b;

    pp.add(new p.Point(center.x + x, center.y + y));
  }
  return pp;
}


function subdivideLine(v1, v2, numPoints) {
  let points = [];
  let step = 1.0 / (numPoints - 1);
  for (let i = 0; i < numPoints; i++) {
    let t = step * i;
    let x = lerp(v1.x, v2.x, t);
    let y = lerp(v1.y, v2.y, t);
    let pp = new p.Point(x, y);
    // createCircle(pp,1,black,black)
    points.push(pp);
  }
  return points;
}

function subdivideLinePow(v1, v2, numPoints, pow = 1) {
  let points = [];

  for (let i = 0; i < numPoints; i++) {
    let t = i / (numPoints - 1);

    let centered = t * 2 - 1;
    let warped = Math.sign(centered) * Math.pow(Math.abs(centered), pow);
    let tt = (warped + 1) / 2;

    let x = lerp(v1.x, v2.x, tt);
    let y = lerp(v1.y, v2.y, tt);

    points.push(new p.Point(x, y));
  }

  return points;
}

function subdivideLineByDistance(v1, v2, distance,debug=null) {

    let points = [];
    let lineLength = v1.getDistance(v2);

    let numPoints = Math.ceil(lineLength / distance);

    let direction = v2.subtract(v1).normalize();

    for (let i = 0; i < numPoints; i++) {
        let pp = v1.add(direction.multiply(distance * i));
        points.push(pp);

        if(debug){
          createCircle(pp,1,black,black)
        }
    }

    points[points.length - 1] = v2;

    return points;
}

function pointToangle(pos,angle,length) {

  let rotatedX = pos.x + Math.cos(radians(angle)) * length;
  let rotatedY = pos.y + Math.sin(radians(angle)) * length;

  return createVector(rotatedX,rotatedY)
}

function createGroups(array){

  groupCyan = new p.Group()
  groupMag = new p.Group()
  groupYellow = new p.Group()

  groupRed = new p.Group()
  groupBlue = new p.Group()
  groupGreen = new p.Group()

  groupBlack = new p.Group()
  groupWhite = new p.Group()

  groupCyan.name = 'cyan'
  groupMag.name = 'mag'
  groupYellow.name = 'yellow'


  groupBlack.name = 'black'
  groupRed.name = 'red'
  groupGreen.name = 'green'
  groupBlue.name = 'blue'

  for(let pa of array){

    // console.log(pa.strokeColor.components)

    if(pa.strokeColor.red ==0.9411764705882353 ){
      groupMag.addChild(pa)
      groupMag.blendMode = 'multiply'
    }else if(pa.strokeColor.red == 1){
      groupYellow.addChild(pa)
      groupYellow.blendMode = 'multiply'
    }else if(pa.strokeColor.red == 0.00392156862745098){
      groupCyan.addChild(pa)
      groupCyan.blendMode = 'multiply'
    }else if(pa.strokeColor.red == 0.){
      groupBlack.addChild(pa)
      groupBlack.blendMode = 'multiply'
      groupBlack.bringToFront()
    }

    if(pa.strokeColor.red==1.&&pa.strokeColor.green==0.&&pa.strokeColor.blue==0.){
      groupRed.addChild(pa)
      groupRed.blendMode = 'multiply'
      // groupRed.bringToFront()
    }
    if(pa.strokeColor.red==0.3333333333333333&&pa.strokeColor.green==0.8156862745098039&&pa.strokeColor.blue== 0.25882352941176473){
      groupGreen.addChild(pa)
      groupGreen.blendMode = 'multiply'
      // groupGreen.bringToFront()
    }
    if(pa.strokeColor.red==0.&&pa.strokeColor.green==0.&&pa.strokeColor.blue==1.){
      groupBlue.addChild(pa)
      groupBlue.blendMode = 'multiply'
      // groupBlue.bringToFront()
    }

  }
}

function createGroupsBW(array) {
  let groupBlack = new p.Group();
  let groupWhite = new p.Group();

  groupBlack.name = 'black';
  groupWhite.name = 'white';

  for (let pa of array) {
    if (pa.fillColor.red === 0 && pa.fillColor.green === 0 && pa.fillColor.blue === 0) {
      groupBlack.addChild(pa);
      groupBlack.blendMode = 'multiply';
      groupBlack.bringToFront();
    } else if (pa.fillColor.red === 1 && pa.fillColor.green === 1 && pa.fillColor.blue === 1) {
      groupWhite.addChild(pa);
      groupWhite.blendMode = 'multiply';
    }
  }
}

function point(pp,cc,www=1) {
  let ccc = new p.Path.Line(pp,pp)
  ccc.strokeCap = 'round'
  ccc.strokeWidth =www
  ccc.strokeColor = cc
  // ccc.blendMode = 'difference'
  return ccc
}



function splitShape(shape, path) {
    var partsGroup = new p.Group();
    partsGroup.addChild(shape);

    var paths = Array.isArray(path.children) ? path.children : [path];

    for (var i = 0; i < paths.length; i++) {
        var tempParts = [];
        for (var x = 0; x < partsGroup.children.length; x++) {
            var currentPath = paths[i];
            if (currentPath.intersects(partsGroup.children[x])) {
                var result = partsGroup.children[x].divide(currentPath, { insert: false, stroke: false, trace: false });
                var clone = result.clone();
                result.remove();
                var group = new p.Group();
                group.addChildren(clone.children);
                for (var s = 0; s < group.children.length; s++) {
                    group.children[s].closed = false;
                    tempParts.push(group.children[s]);
                }
            } else {
                tempParts.push(partsGroup.children[x]);
            }
        }

        partsGroup.removeChildren();
        for (var y = 0; y < tempParts.length; y++) {
            partsGroup.addChild(tempParts[y], { insert: false });
        }
    }
    partsGroup.children.sort(function(a, b) {
      return a.bounds.center.y - b.bounds.center.y;
  });
    return partsGroup;
}

function createRadialStripes(center, radius = 100, count = 24, innerRadius = radius / 1.5) {
  let group = new p.Group()

  let angleStep = 360 / count

  for (let i = 0; i < count; i++) {
    let a0 = (i * angleStep) * Math.PI / 180
    let a1 = ((i + 1) * angleStep) * Math.PI / 180

    let p0 = center.add([
      Math.cos(a0) * innerRadius,
      Math.sin(a0) * innerRadius
    ])

    let p1 = center.add([
      Math.cos(a0) * radius,
      Math.sin(a0) * radius
    ])

    let p2 = center.add([
      Math.cos(a1) * radius,
      Math.sin(a1) * radius
    ])

    let p3 = center.add([
      Math.cos(a1) * innerRadius,
      Math.sin(a1) * innerRadius
    ])

    if (i % 2 === 0) {
      let shape = new p.Path({
        segments: [p0, p1, p2, p3],
        closed: true,
        fillColor: null,
        strokeColor: null
      })

      group.addChild(shape)
    }
  }

  return group
}


function concentricCircles(pos,radius,n){
  let path = new p.Group()
  let sss = radius/n
  let amp = 0
  for(let i = 0;i<n;i++){
    let temp = createCircle(pos,amp,null,black)

    temp.strokeWidth=i%2<1?1:1


    path.addChild(temp)
    amp+=sss

  }

  path.strokeColor = white
  // path.strokeWidth=2
  path.blendMode = 'difference'
  return path
}

class Rules{
  constructor(hF,vF){
    this.vF = vF
    this.hF = hF
    this.points = []
    this.x0
    this.x1
    this.y0
    this.y1
    this.generate()
    this.debug = false
  }

  generate(){
    let horizontalFactor = w*this.hF
    let verticalFactor = h*this.vF
  
    let vline1 = lineFromPoint(createVector(horizontalFactor,h/2),w*2,90)
    let vline2 = lineFromPoint(createVector(w-horizontalFactor,h/2),w*2,90)
    let hline1 = lineFromPoint(createVector(w/2,verticalFactor),h*2,180)
    let hline2 = lineFromPoint(createVector(w/2,h-verticalFactor),h*2,180)

    if(this.debug){
      hline2.strokeColor = black
      hline1.strokeColor = black
      vline2.strokeColor = black
      vline1.strokeColor = black

      let p0 = createCircle(createVector(horizontalFactor,verticalFactor),5,black,black)
      let p1 = createCircle(createVector(horizontalFactor,h-verticalFactor),5,black,black)
      let p2 = createCircle(createVector(w-horizontalFactor,h-verticalFactor),5,black,black)
      let p3 = createCircle(createVector(w-horizontalFactor,verticalFactor),5,black,black)
    }


    this.points.push(createVector(horizontalFactor,verticalFactor),
    createVector(horizontalFactor,h-verticalFactor),
    createVector(w-horizontalFactor,h-verticalFactor),
    createVector(w-horizontalFactor,verticalFactor))
  }

}

class Connections{
  constructor(index,startPoint,endPoint,cols){
    this.spots = []
    this.startPoint = startPoint
    this.endPoint = endPoint
    this.path = new p.Path()
    this.col = cols
    this.strokeWidth = r.random_choice([5,2,5,2,5,2,100,5])

    this.spots.push({index:0,position:this.startPoint,angleIn:0,angleOut:45*2})

    // this.spots.push({index:1,position:this.endPoint,angleIn:0,angleOut:45*r.random_int(1,8)})

    // this.debug()

  }

  debug(){
    // createCircle(this.startPoint,2,'red')
    // createCircle(this.endPoint,5,'blue')

    for(let ppp of this.spots){
      // createCircle(ppp.position,r.random_num(5,10),null,black)
    }

  }

  generatePoints(){
    this.findNewSpot(this.spots[0],2)
  }

  generatePath(){

      for(let i = 0;i<this.spots.length;i++){
        this.path.addSegment(this.spots[i].position)
      }
      // this.path.simplify()

      this.path = roundCorner(this.path,5)
  }

  display(){

    this.path.strokeColor = this.col
    this.path.strokeWidth = r.random_choice([5,2,5,2,5,2,100,5,100])
    // // this.path.dashArray = [r.random_num(0,100),r.random_num(10,20)]
    this.path.strokeCap = 'ROUND'
    // // this.path.simplify()
    arrayOfPaths.push(this.path)
  }

}

function excludeArray(array, excludeItems) {
  let nArray = array
  var filteredArray = nArray.filter(item => !excludeItems.includes(item));
  if (filteredArray.length === 0) {
    return null; // o cualquier valor que prefieras devolver cuando todos los elementos están excluidos
  }
  var randomIndex = Math.floor(r.random_dec() * filteredArray.length);
  return filteredArray[randomIndex];
}

function findNewSpot(current,length,angle,n){
  // console.log(current.angleOut)

  let leng = r.random_num(20,100)
  let ccc  = [45,45+90,135,90,180]

  let newAngle = excludeArray(angles, [current.angleOut, (current.angleOut + 180)%360 ]);
  // let newAngle = ccc[n%5]

  let newPos = pointFromangle(current.position,newAngle,leng)


        if(n==1){

          let newPoint = createVector(current.position.x,current.position.y-(current.position.y-this.endPoint.y))
          // let newPoint = createVector(p11.x-(p11.x-p2.x),p11.y)
          let tA = findAngleBetweenPoints(current.position,newPoint)
          console.log((tA+180) % 360)
          if(current.angleOut==(tA+180)%360){
            // console.log(1234)
            newPoint = createVector(current.position.x-(current.position.x-this.endPoint.x),current.position.y)
          }else{
            newPoint = createVector(current.position.x,current.position.y-(current.position.y-this.endPoint.y))
          }

          let newSpot = {index:this.spots.length+1,position:newPoint,angleIn:0,angleOut:newAngle}
          // createCircle(newPoint,5,'red')
          // createCircle(current.position,5,'blue')
          //
          // this.spots.push(newSpot)
        }else{
          // let newAngle = 45*r.random_int(1,8)
            // return this.findNewSpot(current,n)
          // console.log(current.position)
          console.log(newAngle)

          let newSpot = {index:this.spots.length+1,position:newPos,angleIn:0,angleOut:newAngle}
          this.spots.push(newSpot)
          this.findNewSpot(newSpot,n-1)

        }
}



function roundCorner(path,rr){
  let nPath = new p.Path()

  let points = path.segments.map(segment => segment.point);

  nPath.addSegment(points[0])

  let final = points[points.length-1];

      for (let i = 0; i < points.length-2; i++) {

        let p0 = points[i];
        let p1 = points[(i + 1) % points.length];
        let p2 = points[(i + 2) % points.length];

        generateArcPoints(p0, p1, p2,rr, nPath);
      }

      nPath.addSegment(final)
      return nPath
}

function generateArcPoints(p0, p1, p2, radius, array) {


  let BA = p0.subtract(p1)
  let len = BA.length;
  let BAnorm = createVector(BA.x / len,
     BA.y / len);
     let ang1 = Math.atan2(BAnorm.y, BAnorm.x)


  let BC = p2.subtract(p1)
  let len2 = Math.sqrt(BC.x * BC.x + BC.y * BC.y);
  let BCnorm = createVector(BC.x / len2,
    BC.y / len2);

   let sinA = BAnorm.x * BCnorm.y - BAnorm.y * BCnorm.x;
  let  sinA90 = BAnorm.x * BCnorm.x - BAnorm.y * -BCnorm.y;
  let angle = Math.asin(sinA < -1 ? -1 : sinA > 1 ? 1 : sinA);

  let ang2 = Math.atan2(BCnorm.y, BCnorm.x)

  let radDirection = 1;
  let drawDirection = false;

  if (sinA90 < 0) {
    angle < 0
      ? (angle += PI)
      : ((angle += PI), (radDirection = -1), (drawDirection = true));
  } else {
    angle > 0 ? ((radDirection = -1), (drawDirection = true)) : 0;
  }

  let halfAngle = angle / 2;
  let lenOut = Math.abs((Math.cos((halfAngle)) * radius) / Math.sin((halfAngle)));

  if (lenOut > Math.min(len / 2, len2 / 2)) {
      lenOut = Math.min(len / 2, len2 / 2);
      cRadius = Math.abs((lenOut * Math.sin(halfAngle)) / Math.cos(halfAngle));
    } else {
      cRadius = radius;
    }

  let x =
    p1.x +
    BCnorm.x * lenOut -
    BCnorm.y * cRadius * radDirection;
  let y =
    p1.y +
    BCnorm.y * lenOut +
    BCnorm.x * cRadius * radDirection;
    // let circ = createCircle(createVector(x,y),cRadius/2,null,black)
    // circ.blendMode = 'difference'



  drawArc(
    createVector(x, y),
    cRadius,
    ang1 + (PI / 2) * radDirection,
    ang2 - (PI / 2) * radDirection,
    drawDirection,
    array
  );
}


function drawArc(center, radius, startAngle, endAngle, counterClockwise, array) {
  startAngle = (startAngle + TWO_PI) % TWO_PI;
  endAngle = (endAngle + TWO_PI) % TWO_PI;

  if (counterClockwise && startAngle < endAngle) {
    startAngle += TWO_PI;
  } else if (!counterClockwise && startAngle > endAngle) {
    endAngle += TWO_PI;
  }

  let step = radians(0.5);

  for (
    let angle = startAngle;
    counterClockwise ? angle >= endAngle : angle <= endAngle;
    angle += counterClockwise ? -step : step
  ) {
    let x = center.x + radius * cos(angle);
    let y = center.y + radius * sin(angle);
    array.addSegment(createVector(x, y));
  }
}

function extractPathsFromCompound(compound){
  let gg = new p.Group()
  for(let path of compound.children){

    gg.addChild(pathFromCompound(path))
  }

  return gg
}

function pathFromCompound(nnn){

  let nPath = new p.Path()
  for(let pp of nnn.segments){
    nPath.addSegment(pp)
  }
  return nPath
}

function removeTransparentLines() {
    let itemsToRemove = [];

    function checkAndRemove(item) {
        if (item instanceof p.Group) {

            // Recursively check and remove children
            for (let k = item.children.length - 1; k >= 0; k--) {
                checkAndRemove(item.children[k]);
            }
            // If the group is empty after processing, mark it for removal
            if (item.children.length == 0) {
                itemsToRemove.push(item);
                // console.log(1234)
            }
        } else {
            // If the item's strokeColor is null, mark it for removal
            if (item.strokeColor == null) {
                itemsToRemove.push(item);
            }
        }
    }
    for (let i = p.project._children.length - 1; i >= 0; i--) {
        let child = p.project._children[i];
        checkAndRemove(child);
    }
    for (let item of itemsToRemove) {
        item.remove();
    }

    itemsToRemove = null

}

function mapValue(value, inMin, inMax, outMin, outMax) {if (inMin === inMax) {throw new Error("Input range cannot be zero");}return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);}

function sin(v){
  return Math.sin((v))
}
function cos(v){
  return Math.cos((v))
}
function fract(x) {
  return x - Math.floor(x);
}
function abs(x){
  return Math.abs(x)
}
function tan(x){
  return Math.tan(x)
}
function floor(x){
  return Math.floor(x)
}

function roundCorners(path, r) {
  if (!(path instanceof p.Path || (path instanceof p.CompoundPath && path.children.length > 0))) {
    console.error('The argument must be a Paper.js Path or CompoundPath with at least one child.');
    return;
  }

  // If it's a CompoundPath, use its first child
  if (path instanceof p.CompoundPath) {
    path = path.children[0];
  }

  let points = path.segments.map(segment => segment.point);
  let newPath = new p.Path();

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const ba = a.subtract(b).normalize();
    const bc = c.subtract(b).normalize();

    // Points in the direction the corner is accelerating towards
    const normal = ba.add(bc).normalize();

    // Shortest angle between the two edges
    const theta = ba.getDirectedAngle(bc);

    const maxR = Math.min(a.getDistance(b), c.getDistance(b)) / 2 * Math.abs(Math.sin(theta / 2));
    const cornerR = Math.min(r, maxR);

    // Find the distance away from the corner that has a distance of
    // 2*cornerR between the edges
    const distance = Math.abs(cornerR / Math.sin(theta / 2));

    const c1 = b.add(ba.multiply(distance));
    const c2 = b.add(bc.multiply(distance));
    const bezierDist = 0.2523; // https://stackoverflow.com/a/27863181
    const p1 = c1.subtract(ba.multiply(2 * cornerR * bezierDist));
    const p2 = c2.subtract(bc.multiply(2 * cornerR * bezierDist));

    if (i === 0) {
      newPath.moveTo(c1);
    } else {
      newPath.lineTo(c1);
    }

    newPath.cubicCurveTo(p1, p2, c2);
  }

  newPath.closePath();
  return newPath;
}

function clampMax(value, threshold) {
  return value >= threshold ? threshold : value;
}

function clampMin(value, threshold) {
  return value < threshold ? 0 : value;
}

function sortVectorsClockwise(vectors) {
  if (vectors.length < 2) {
    // No need to sort if there are less than 2 vectors
    return vectors;
  }

  // Calculate the centroid
  let centroid = createVector(w/2, h/2);
  // for (let v of vectors) {
  //   centroid.add(v);
  // }
  // centroid.divide(vectors.length);



  // Calculate angles and sort vectors based on these angles
  vectors.sort((a, b) => {
    let angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    let angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);

    // Sort in clockwise order (note: atan2 returns angles in counterclockwise direction)
    return angleA - angleB;
  });

  return vectors;
}


function checkSegmentsInsidePolygon(path, polygon) {
    polygon.closed = true;
    for (let seg of path.segments) {
        if (!polygon.contains(seg.point)) {
            return false;
        }
    }

    return true;
}

function hasMoreThanOnePointInsidePolygon(path, polygon) {
    // Ensure the polygon is closed
    polygon.closed = true;

    // Initialize a counter for points inside the polygon
    let insideCount = 0;

    // Iterate over each segment in the path
    for (let seg of path.segments) {
        // Check if the segment's point is inside the polygon
        if (polygon.contains(seg.point)) {
            insideCount++;
        }

        // Early exit if more than one point is inside
        if (insideCount > 1) {
            return true;
        }
    }

    // Return false if fewer than or equal to one point is inside
    return false;
}

function maskBorders(paths,rect){
  let gggg = new p.Group()
for(let i = 0;i<paths.length;i++){
    let pathy = paths[i]

    let intersec = pathy.getIntersections(rect)

    if(intersec.length==0){

      if(checkSegmentsInsidePolygon(pathy,rect)==true){
        gggg.addChild(pathy)
      }

    }
    if(intersec.length>0){

      if(intersec.length==1){
        let nPath = new p.Path()
        let nPath2 = new p.Path()
 
        pathy.divideAt(pathy.getOffsetOf(intersec[0].point))
        let index = findIndex(pathy,intersec[0].point)

            if(rect.contains(pathy.segments[0].point)==true){
            for(let j =0;j<=index;j++){

                nPath2.addSegment(pathy.segments[j].point)
              }

        }else{
              for(let j =index;j<pathy.segments.length;j++){
                nPath.addSegment(pathy.segments[j].point)
              }
        }


        gggg.addChild(nPath)
        gggg.addChild(nPath2)

      }
    }

    if(intersec.length==2){
      pathy.divideAt(pathy.getOffsetOf(intersec[0].point))
      pathy.divideAt(pathy.getOffsetOf(intersec[1].point))

      let index = findIndex(pathy,intersec[1].point)
      let nnnPath = new p.CompoundPath()
      if(rect.contains(pathy.segments[0].point)==true){

      nnnPath.moveTo(pathy.segments[0].point)

      for(let j =0;j<pathy.segments.length;j++){

        if(rect.contains(pathy.segments[j].point)==true){
          nnnPath.lineTo(pathy.segments[j].point)
        }else{
          break
        }
      }

        nnnPath.moveTo(intersec[1].point)
        for(let j =index;j<pathy.segments.length;j++){
          nnnPath.lineTo(pathy.segments[j].point)
        }
    }
      gggg.addChild(nnnPath)

    }

}

  return gggg

}

function clipPathByRect(path, rect, step = 2) {

  let result = new p.Group();

  let len = path.length;

  let prevPt = path.getPointAt(0);
  let prevInside = rect.contains(prevPt);

  let currentPath = null;

  // Si empieza dentro → abrir inmediatamente
  if (prevInside) {
    currentPath = new p.Path();
    currentPath.strokeColor = path.strokeColor;
    currentPath.strokeWidth = path.strokeWidth;
    currentPath.add(prevPt);
    result.addChild(currentPath);
  }

  for (let d = step; d <= len; d += step) {

    let pt = path.getPointAt(d);
    if (!pt) continue;

    let inside = rect.contains(pt);

    // ---- CRUCE REAL ENTRE prevPt → pt ----
    let seg = new p.Path([prevPt, pt]);
    let hits = seg.getIntersections(rect);
    seg.remove();

    // ordenar hits por distancia al prev
    hits.sort((a,b)=>
      a.point.getDistance(prevPt) -
      b.point.getDistance(prevPt)
    );

    for (let hit of hits) {

      let hp = hit.point;

      // OUT → IN  = abrir
      if (!prevInside && inside) {
        currentPath = new p.Path();
        currentPath.strokeColor = path.strokeColor;
        currentPath.strokeWidth = path.strokeWidth;
        currentPath.add(hp);
        result.addChild(currentPath);
      }

      // IN → OUT = cerrar
      if (prevInside && !inside) {
        if (currentPath) {
          currentPath.add(hp);
          currentPath = null;
        }
      }
    }

    // ---- CONTINUIDAD ----
    if (inside && currentPath) {
      currentPath.add(pt);
    }

    prevPt = pt;
    prevInside = inside;
  }

  return result;
}


function generatePointInside(path, maxAttempts = 10000000, attempts = 0) {
  if (attempts >= maxAttempts) {
    console.warn("Maximum attempts reached, point not found.");
    return null; // or handle this case accordingly
  }

  let bound = path.bounds;
  let point = new p.Point(
    r.random_num(bound.left, bound.right),
    r.random_num(bound.top, bound.bottom)
  );

  if (path.contains(point)) {
    return point;
  } else {
    return generatePointInside(path, maxAttempts, attempts++);
  }
}


function hatchLines(path, angle, num) {
  let g = new p.Group();
  let nPath = path.clone();

  nPath.rotate(angle, nPath.bounds.center);

  let bounds = nPath.bounds;
  let newWidth = bounds.width + 100;
  let newHeight = bounds.height + 100;
  let newCenter = bounds.center;

  let v1 = createVector(newCenter.x - newWidth / 2, newCenter.y - newHeight / 2);
  let v2 = createVector(newCenter.x - newWidth / 2, (newCenter.y - newHeight / 2) + newHeight);

  let arr = subdivideLineByDistance(v1, v2, num);
  let arr2 = subdivideLineByDistance(
    createVector((newCenter.x - newWidth / 2) + newWidth, newCenter.y - newHeight / 2),
    createVector((newCenter.x - newWidth / 2) + newWidth, (newCenter.y - newHeight / 2) + newHeight),
    num
  );

  let lineLength = v1.getDistance(v2);
  let numPoints = Math.ceil(lineLength / num);

  for (let i = 0; i < numPoints; i++) {
    // Create a temporary line for intersection testing (no color)
    let line = createLine(arr[i], arr2[i], null);
    
    let intersec = line.getIntersections(nPath);

    // FIX: Check if there are AT LEAST 2 intersections
    if (intersec.length >= 2) {
      
      // IMPORTANT: Sort points based on their location along the line
      // This ensures intersec[0] is the start and intersec[1] is the next point on that line
      intersec.sort((a, b) => a.offset - b.offset);

      // Iterate through the intersections in pairs (0-1, 2-3, 4-5)
      // This handles concave shapes (cuts) perfectly
      for (let j = 0; j < intersec.length - 1; j += 2) {
        let pStart = intersec[j].point;
        let pEnd = intersec[j + 1].point;
        
        let ll = createLine(pStart, pEnd, black);
        g.addChild(ll);
      }
    }
    line.remove();
  }

  // Rotate the final hatched result back
  g.rotate(-angle, path.bounds.center);
  
  nPath.remove();
  return g;
}

function gridFromBounds(originalP,num,ggg){

  let nPath = originalP.clone()

  let bounds = nPath.bounds
  let grid = new Grid(bounds.center,[num,num],bounds.width,bounds.height,true,-100)

  // createBoundRect(nPath)

  for(let ppp of grid.positions){
    if(originalP.contains(ppp)){
      ggg.addChild(point(ppp,black))
    }
  }
  nPath.remove()
  return ggg

}

function gridFromBounds2(originalP,num,ggg){

  let nPath = originalP.clone()

  let bounds = nPath.bounds
  let grid = new Grid(bounds.center,[num,num],w/2,h/2,true,-100)

  // createBoundRect(nPath)
let index = 0
  for(let ppp of grid.positions){
    if(originalP.contains(ppp)){
      let ss = grid.size-2

      ss*=floor(sin(ppp.x*20+index+sin(ppp.y*400+index/20+tan(ppp.x*5+index)*20)*200))
      // ss*=floor(sin(ppp.x*2+index+cos(ppp.y*500+index)*10+sin(ppp.x*5)*2+tan(ppp.x*50)*20))
      ggg.addChild(createRectangle(ppp,ss,ss,true,black,black))
      index+=0.05
    }
  }
  nPath.remove()
  return ggg

}

function createBoundRect(path){
  let bounds = path.bounds
  let newWidth = bounds.width ;
  let newHeight = bounds.height ;

  let newCenter = bounds.center;

let newRectangle = new p.Path.Rectangle({
    point: [newCenter.x - newWidth / 2, newCenter.y - newHeight / 2],
    size: [newWidth, newHeight],
    strokeColor: 'red'
});
}

function dashArray(path,gap){

  let nPath = new p.CompoundPath()
  let sub = path.length/gap

  for(let i =0;i<path.length;i+=1){

    if(path.getPointAt(sub*i)!=null){
      if((i%2)==1){
        nPath.lineTo(path.getPointAt(sub*i) )
      }else{
        nPath.moveTo(path.getPointAt(sub*(i)))
      }
    }

  }
  path.remove()
  return nPath
}

function createGridLines(path,nX,nY,nZ,angle){

  let paths = []

  let nPath = path.clone()

  nPath.rotate(angle,nPath.bounds.center)

  let bounds = nPath.bounds

  let startX = bounds.topLeft.x
  let startY = bounds.topLeft.y

  let sepX = (bounds.width) / nX
  let sepY = (bounds.height) / nY
  let distX = sepX/r.random_num(2.5,3)
  let offset = r.random_num(-1,1)*w

  let sepZ = 5
  let index = 0
  for(let x = 0;x<nX;x++){
    index++
    for(let y = 0;y<nY;y++){


      for(let z= -floor(nZ/2);z<=floor(nZ/2);z++){
        let pos = createVector(startX+sepX*x + sepX/2,startY+sepY*y+sepY/2)
        let sX = distX
        let sY = z* 1.4
        pos.x+=z*sepZ

        let line = createLine(createVector(pos.x-sX,pos.y+sY),createVector(pos.x+sX,pos.y+sY),null)
        line.rotate(1,line.bounds.center)
        paths.push(line)
      }
      index++
    }
  }
  nPath.remove()

  let g = maskBorders(paths,nPath)
  g.rotate(-angle,path.bounds.center)

  return g
}


function constrain(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, x) {
  // Normaliza x a un rango de 0 a 1
  let t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  // Calcula la interpolación suave
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}


function cubicPulse(  c,  w,  x ){
  x = abs(x - c);
  if( x>w ) return 0.0;
  x /= w;
  return 1.0 - x*x*(3.0-2.0*x);
}

function step(edge, x) {
  return x >= edge ? 1.0 : 0.0;
}

function sineOsc(nUv,rot,freq,phase,amp){
    let uv = nUv.copy()
    uv = sdRotate(uv,rot)
    return sin(uv.x*freq*TWO_PI+phase) * amp
}

// function sineOsc(freq,phase,amp){
//   return sin(freq * TWO_PI/2 + phase )* amp
// }

// function sdf_box(sample,pos,[w,h]) {

//   let d = sample.clone()
//   d.x -= pos.x ;
//   d.y -= pos.y;
//   return k(Math.abs(d.x)-w, Math.abs(d.y)-h);
// }

function sdf_box(pp, c, half) {
  let d = pp.subtract(c);
  d = new p.Point(Math.abs(d.x), Math.abs(d.y));

  let dx = d.x - half[0];
  let dy = d.y - half[1];

  let outside = Math.sqrt(Math.max(dx, 0)**2 + Math.max(dy, 0)**2);
  let inside = Math.min(Math.max(dx, dy), 0);

  return outside + inside;
}

function sdfLine(p, a, b) {
    // Create a clone of point p
    var d = p.clone();
    // Compute vector from a to p
    var pa = d.subtract(a);
    // Compute vector from a to b
    var ba = b.subtract(a);

    if (ba.length > 0) {  // Ensure b is not the same as a
        // Constrain the projection factor between 0 and 1
        var h = Math.min(Math.max(pa.dot(ba) / ba.dot(ba), 0.0), 1.0);
        // Scale the vector ba by h
        var scaledBa = ba.multiply(h);
        // Subtract the projection from pa to get the perpendicular vector
        pa = pa.subtract(scaledBa);
    }

    // Return the length of the perpendicular vector
    return pa.length;
}



function sdf_circle(sample, center, radius) {
  const dx = sample.x - center.x;
  const dy = sample.y - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist - radius;
}
function sdRotate(s,a) {
  let nS = s.clone()
  return(createVector(Math.cos(a) * nS.x + Math.sin(a) * nS.y, Math.cos(a) * nS.y - Math.sin(a) * nS.x));
}


function dist(point1, point2) {
    return point1.getDistance(point2);
}

function distp5(point1, point2) {
  return Math.hypot(point1.x - point2.x, point1.y - point2.y);
}

// function minkowski(dx, dy, p) {
//   return Math.pow(Math.pow(dx, p) + Math.pow(dy, p), 1 / p);
// }

function mirrorPoint(p) {
  let cx = w  / 2;
  let cy = h / 2;
  let mx = 2 * cx - p.x;
  let my = 2 * cy - p.y;
  return createVector(mx, my);
}


function map(value, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) {
        throw new Error("Input range cannot be zero");
    }
    return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

function rectsUnion(pos,rrr){
  let fff =1

  for(let i = 0;i<rrr.length;i++){
    let rec = sdf_box(pos,rrr[i].position,[rrr[i].w,rrr[i].h])
    fff = sdUnion(fff,rec)
  }

  return fff
}

let L = (x,y)=>(x*x+y*y)**0.5;
let k = (a,b)=>a>0&&b>0?L(a,b):a>b?a:b;

function sdUnion(a,b) {return Math.min(a,b);}
function sdIntersect(a,b) { return Math.max(a,b);}

function sdXor(a,b) {return Math.max(Math.min(a, b), -Math.max(a, b));}

function sdOnion(v, a ) { //amount to inflate after onionskin
  return Math.abs(v)-a;
}

function sdf_rep(x, r) {
  x/=r;
  x-=Math.floor(x)+.5;
  x*=r;
  return x;
}


function sdTranslate(s,o) { return(createVector(s.x-o.x,s.y-o.y));
}

function sdRotate(s,a) { let nS = s;return(createVector(Math.cos(a) * nS.x + Math.sin(a) * nS.y, Math.cos(a) * nS.y - Math.sin(a) * nS.x));
}


function createDashedPath(path, dashArray, offset = 0) {
  if (dashArray.length % 2 !== 0) {
      throw new Error("dashArray must have an even number of elements");
  }

  const totalLength = path.length;
  let dashedGroup = new paper.Group();

  let patternLength = dashArray.reduce((a, b) => a + b, 0);
  let currentLength = -offset % patternLength;

  while (currentLength < totalLength) {
      for (let i = 0; i < dashArray.length; i += 2) {
          let dashLength = dashArray[i];
          let gapLength = dashArray[i + 1];

          let start = Math.max(currentLength, 0);
          let end = currentLength + dashLength;

          if (end > 0 && start < totalLength) {
              let clampedStart = Math.max(0, start);
              let clampedEnd = Math.min(totalLength, end);

              if (clampedEnd > clampedStart) {
                  let segment = path.getSubpath(clampedStart, clampedEnd);
                  dashedGroup.addChild(segment);
              }
          }

          currentLength += dashLength + gapLength;

          if (currentLength > totalLength) break;
      }
  }

  path.remove();

  return dashedGroup;
}




function lineToIntersect(p1,p2,path){
  let line1 = createLine(p1,p2,black)
  let intersect = path.intersect(line)
}

function removeDuplicates(arr) {
    return [...new Set(arr)];
}


function createCirclePath(pos, radius, rotation3D = { x: 0, y: 0, z: 0 }, depth = 1, stepZ = 1.5,segments = 100) {
  let group = new p.Group();

  for (let i = 0; i < depth; i++) {


    let zOffset = i * stepZ;


    let path = new p.Path();

    let startAngle = TWO_PI/r.random_num(1,1)
    let span = TWO_PI/r.random_num(1,1)
    let angleStep = span / segments;
 
    let points = [];

    for (let j = 0; j <= segments; j++) {
      let angle = startAngle + j * angleStep;
      let x = radius * Math.cos(angle);
      let y = radius * Math.sin(angle);
      let z = zOffset;
      let rotated = rotate3D(x, y, z, rotation3D.x, rotation3D.y, rotation3D.z);

      let poin = new p.Point(pos.x + rotated.x, pos.y + rotated.y)


      points.push(poin);
  

    }


    for (let j = 0; j < points.length - 1; j++) {
      let a = points[j];
      let b = points[j + 1];
    
      // Original angle on circle (for unrotated vector)
      let angleA = startAngle + j * angleStep;
      let angleB = startAngle + (j + 1) * angleStep;
    
      // Base vectors in 3D (normals)
      let na = rotate3D(Math.cos(angleA), Math.sin(angleA), 0, rotation3D.x, rotation3D.y, rotation3D.z);
      let nb = rotate3D(Math.cos(angleB), Math.sin(angleB), 0, rotation3D.x, rotation3D.y, rotation3D.z);
    
  
      
     
    }

    path.addSegments(points);
    path.strokeColor = white;

    
    path.strokeWidth = r.random_choice([1,2])
    path.blendMode = 'difference'
    path.closed=true
    let angle = r.random_num(0,360)
    group.addChild(path);
  }

  return group;
}

function center(){
  return createVector(w/2,h/2)
}
function midPoint(){
  return createVector(w/2,h/2)
}

function randomPI(){
  return r.random_num(0,TWO_PI)
}
function rotate3D(x, y, z, angleX, angleY, angleZ) {
  let cosX = Math.cos(angleX), sinX = Math.sin(angleX);
  let y1 = y * cosX - z * sinX;
  let z1 = y * sinX + z * cosX;

  let cosY = Math.cos(angleY), sinY = Math.sin(angleY);
  let x2 = x * cosY + z1 * sinY;
  let z2 = -x * sinY + z1 * cosY;

  let cosZ = Math.cos(angleZ), sinZ = Math.sin(angleZ);
  let x3 = x2 * cosZ - y1 * sinZ;
  let y3 = x2 * sinZ + y1 * cosZ;

  return { x: x3, y: y3, z: z2 };
}


function convertPathsToSVGElements(paths, svgParent, canvasWidth, canvasHeight, a3Width, a3Height) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  while (svgParent.firstChild) {
    svgParent.removeChild(svgParent.firstChild);
  }

  // Scale factors canvas → A3
  const scaleX = a3Width / canvasWidth;
  const scaleY = a3Height / canvasHeight;

  paths.forEach(paperPath => {
    if (!paperPath) return;

    // ✅ Handle rectangles
    if (paperPath.isRectangle && paperPath.isRectangle()) {
      const bounds = paperPath.bounds;

      const x = bounds.x * scaleX;
      const y = bounds.y * scaleY;
      const width = bounds.width * scaleX;
      const height = bounds.height * scaleY;

      const svgRect = document.createElementNS(SVG_NS, 'rect');
      svgRect.setAttribute('x', x);
      svgRect.setAttribute('y', y);
      svgRect.setAttribute('width', width);
      svgRect.setAttribute('height', height);
      svgRect.setAttribute('fill', paperPath.fillColor ? paperPath.fillColor.toCSS(true) : 'none');
      svgRect.setAttribute('stroke', paperPath.strokeColor ? paperPath.strokeColor.toCSS(true) : 'black');
      svgRect.setAttribute('stroke-width', 0);

      svgParent.appendChild(svgRect);
      return;
    }

    // ✅ Handle normal paths
    if (!paperPath.segments || paperPath.segments.length === 0) return;

    const segments = paperPath.segments;
    let d = `M ${segments[0].point.x * scaleX} ${segments[0].point.y * scaleY}`;
    for (let i = 1; i < segments.length; i++) {
      d += ` L ${segments[i].point.x * scaleX} ${segments[i].point.y * scaleY}`;
    }
    if (paperPath.closed) d += ' Z';

    const svgPath = document.createElementNS(SVG_NS, 'path');
    svgPath.setAttribute('d', d);
    svgPath.setAttribute('fill', paperPath.fillColor ? paperPath.fillColor.toCSS(true) : 'none');
    svgPath.setAttribute('stroke', paperPath.strokeColor ? paperPath.strokeColor.toCSS(true) : 'black');
    svgPath.setAttribute('stroke-linecap', 'round');
    svgPath.setAttribute('stroke-width', (strokeWidthMM * 1).toString());

    if (paperPath.blendMode) {
      svgPath.style.mixBlendMode = paperPath.blendMode;
    }

    svgParent.appendChild(svgPath);
  });
}

// ✅ simpler version, no recursion or groups
function collectAllItems() {
  // Only collect paths in the active layer
  const allItems = [];
  p.project.activeLayer.children.forEach(item => {
    if (item instanceof p.Path) {
      allItems.push(item);
    }
  });
  return allItems;
}

function setupSVG() {
  let svgWidthUnits  = (orientation === "portrait") ? a3Width  : a3Height;
  let svgHeightUnits = (orientation === "portrait") ? a3Height : a3Width;

  let svgWidthCM  = svgWidthUnits / 10;  // 0.1 mm → mm → cm
  let svgHeightCM = svgHeightUnits / 10;

  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  svg.setAttribute("width",  `${svgWidthCM}cm`);
  svg.setAttribute("height", `${svgHeightCM}cm`);
  svg.setAttribute("viewBox", `0 0 ${svgWidthUnits} ${svgHeightUnits}`);
  
  return svg
}

function saveSVG2() {
  var svgContent = p.project.exportSVG({ asString: true, precision: 5 });

  const noiseFilter = `
  <defs>
    <filter id="noiseFilter">
      <feTurbulence type="fractalNoise" baseFrequency="5.4" numOctaves="4" result="noise" />
      <feColorMatrix in="noise" type="saturate" values="0" result="grayNoise" />
      <feComponentTransfer in="grayNoise" result="dimNoise">
        <feFuncA type="linear" slope="0.7"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="dimNoise" mode="overlay" />
    </filter>
  </defs>
  `;

  // Insert the filter defs and wrap the inner contents with the filter
  let svgOpenEnd = svgContent.indexOf('>');
  if (svgOpenEnd !== -1) {
    let svgTag = svgContent.substring(0, svgOpenEnd + 1);
    let svgInner = svgContent.substring(svgOpenEnd + 1, svgContent.lastIndexOf('</svg>'));
    
    svgContent = svgTag + noiseFilter + '<g filter="url(#noiseFilter)">' + svgInner + '</g></svg>';
  }

  var blob = new Blob([svgContent], { type: 'image/svg+xml' });
  var downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = 'canvas-textured.svg';
  downloadLink.click();
}



function saveSVG4() {
 convertPathsToSVGElements(arrayOfPaths, svg,w,h,effWidth,effHeight); 

 const serializer = new XMLSerializer();
 const svgContent = serializer.serializeToString(svg);
 const blob = new Blob([svgContent], { type: 'image/svg+xml' });
 const downloadLink = document.createElement('a');
 downloadLink.href = URL.createObjectURL(blob);
 downloadLink.download = 'custom-drawing.svg';
 document.body.appendChild(downloadLink); // required for Firefox
 downloadLink.click();
 document.body.removeChild(downloadLink);
}



function getRightAnglePaths(p1, p2) {
  let mid1 = createVector(p1.x, p2.y); 
  let mid2 = createVector(p2.x, p1.y); 

  let option1 = mid1;
  let option2 = mid2;

  return [option1, option2];
}

function createRandomStep(origin, minLen = 50, maxLen = 400) {

  // let angle = r.random_choice([0,90,180,270,45,180-45,360-45,90+45]);
  let angle = r.random_choice([45,-45,90,0]);

  let len = r.random_num(minLen, maxLen);

  let dx = cos(radians(angle)) * len;
  let dy = sin(radians(angle)) * len;

  return createVector(origin.x + dx, origin.y + dy);
}

function getNormal(start, end, normalLength) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  let mag = Math.sqrt(dx*dx + dy*dy);
  let nx  = -dy / mag;
  let ny  =  dx / mag;
  return createVector(
    start.x + nx * normalLength,
    start.y + ny * normalLength
  );
}


function getNormals(points, normalLength) {
  let normals = [];

  for (let i = 0; i < points.length - 1; i++) {
    let start = points[i].point;
    let end = points[i + 1].point;

    let dx = end.x - start.x;
    let dy = end.y - start.y;

    let mag = Math.sqrt(dx * dx + dy * dy);
    let nx = -dy / mag * normalLength;
    let ny = dx / mag * normalLength;

    normals.push(createVector( start.x + nx, start.y + ny ));

  }

  return normals;
}


function minkowskiDistance(p1, p2, order = 2) {
  const dx = Math.abs(p1.x - p2.x);
  const dy = Math.abs(p1.y - p2.y);
  return Math.pow(Math.pow(dx, order) + Math.pow(dy, order), 1 / order);
}

function reorderByModulo(array, mod = 4) {
  let result = [];
  for (let i = 0; i < mod; i++) {
    for (let j = 0; i + j * mod < array.length; j++) {
      let index = i + j * mod;
      result.push(array[index]);
    }
  }
  return result;
}

function swapHalves(array) {
  const half = Math.floor(array.length / 2);
  const first = array.slice(0, half);
  const second = array.slice(half);
  return second.concat(first);
}

function invertArray(array) {
  return array.slice().reverse();
}

function snapToGrid(pt) {
  const x = Math.round(pt.x / config.gridSize) * config.gridSize;
  const y = Math.round(pt.y / config.gridSize) * config.gridSize;
  return new p.Point(x, y);
}

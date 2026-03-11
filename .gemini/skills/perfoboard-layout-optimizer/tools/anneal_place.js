const fs = require('fs');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log("Usage: node anneal_place.js <file.json> [--iters N] [--t0 N] [--t1 N] [--seed N] [--move N] [--keep-nets]");
  process.exit(1);
}

const inputFile = args[0];
const opts = {
  iters: 30000,
  t0: 100, // Increased temp
  t1: 0.1,
  seed: 42,
  move: 2,
  keepNets: false
};

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--iters') opts.iters = Number(args[++i]);
  else if (a === '--t0') opts.t0 = Number(args[++i]);
  else if (a === '--t1') opts.t1 = Number(args[++i]);
  else if (a === '--seed') opts.seed = Number(args[++i]);
  else if (a === '--move') opts.move = Number(args[++i]);
  else if (a === '--keep-nets') opts.keepNets = true;
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const W = data.board?.width || 0;
const H = data.board?.height || 0;

function rngFactory(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}
const rnd = rngFactory(opts.seed);

function getComponentType(p) {
  if (p.includes('axial')) return 'axial';
  if (p.includes('to-92')) return 'to92';
  if (p.includes('nodemcu') || p.includes('dip')) return 'dip';
  return 'other';
}

function getInitialOrientation(c) {
  const type = getComponentType(c.package || '');
  if (type === 'axial') return (c.pins[0].y === c.pins[1].y) ? 0 : 90;
  if (type === 'to92' && c.pins.length >= 3) return (c.pins[0].y === c.pins[1].y) ? 0 : 90;
  return 0;
}

function getInitialSpan(c) {
  if (getComponentType(c.package || '') === 'axial' && c.pins.length === 2) {
    return Math.abs(c.pins[0].x - c.pins[1].x) + Math.abs(c.pins[0].y - c.pins[1].y);
  }
  return 0;
}

const components = (data.components || []).map(c => {
  const pkg = (c.package || "").toLowerCase();
  const comp = {
    ref: c.ref,
    package: c.package,
    pins: c.pins.map(p => ({ ...p })),
    origPins: c.pins.map(p => ({ ...p })),
    type: getComponentType(c.package || ''),
    rot: getInitialOrientation(c),
    span: getInitialSpan(c) || 2,
    anchorX: c.pins[0].x,
    anchorY: c.pins[0].y,
    hasClearance: pkg.includes('nodemcu'),
    allowUnder: pkg.includes("axial") || pkg.includes("buzzer") || pkg.includes("to-92") || pkg.includes("led") || pkg.includes("radial") || pkg.includes("dip")
  };
  return comp;
});

function updatePinsFromState(c) {
  if (c.type === 'axial') {
    const dx = (c.rot === 0) ? c.span : 0;
    const dy = (c.rot === 0) ? 0 : c.span;
    c.pins[0].x = c.anchorX; c.pins[0].y = c.anchorY;
    c.pins[1].x = c.anchorX + dx; c.pins[1].y = c.anchorY + dy;
  } else if (c.type === 'to92') {
    const dx = (c.rot === 0) ? 1 : 0;
    const dy = (c.rot === 0) ? 0 : 1;
    c.pins.forEach((p, i) => {
      p.x = c.anchorX + i * dx;
      p.y = c.anchorY + i * dy;
    });
  } else {
    const dx = c.anchorX - c.origPins[0].x;
    const dy = c.anchorY - c.origPins[0].y;
    c.pins.forEach((p, i) => {
      p.x = c.origPins[i].x + dx;
      p.y = c.origPins[i].y + dy;
    });
  }
}

const pinKeyMap = new Map();
function refreshPinKeyMap() {
  pinKeyMap.clear();
  for (const c of components) {
    for (const p of c.pins) {
      pinKeyMap.set(`${c.ref}.${p.name}`, p);
    }
  }
}

function buildNetlist() {
  if (data.netlist) return data.netlist;
  const nl = {};
  for (const n of (data.nets || [])) {
    if (n.nodes) nl[n.name] = n.nodes;
  }
  return nl;
}
const netlist = buildNetlist();

function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function mstLength(points) {
  if (points.length <= 1) return 0;
  const used = new Array(points.length).fill(false);
  const dist = new Array(points.length).fill(Infinity);
  dist[0] = 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    let v = -1;
    for (let j = 0; j < points.length; j++) { if (!used[j] && (v === -1 || dist[j] < dist[v])) v = j; }
    used[v] = true; total += dist[v];
    for (let j = 0; j < points.length; j++) {
      if (!used[j]) {
        const d = manhattan(points[v], points[j]);
        if (d < dist[j]) dist[j] = d;
      }
    }
  }
  return total;
}

function getBodyHoles(c) {
  const holes = [];
  if (c.type === 'axial') {
    // Body is between pin1 and pin2
    const minX = Math.min(c.pins[0].x, c.pins[1].x);
    const maxX = Math.max(c.pins[0].x, c.pins[1].x);
    const minY = Math.min(c.pins[0].y, c.pins[1].y);
    const maxY = Math.max(c.pins[0].y, c.pins[1].y);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Avoid adding pin holes themselves to body list to allow trace connection, 
        // but user asked to avoid pins under body, so we include them or handle separately.
        // Rule: Body covers everything between pins.
        holes.push(`${x}:${y}`);
      }
    }
  } else if (c.type === 'to92') {
    // TO-92 is 3x2 (3 pins wide, 2 holes deep)
    const dx = (c.rot === 0) ? 1 : 0;
    const dy = (c.rot === 0) ? 0 : 1;
    const px = (c.rot === 0) ? 0 : 1; // perpendicular offset
    const py = (c.rot === 0) ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      const bx = c.anchorX + i * dx;
      const by = c.anchorY + i * dy;
      holes.push(`${bx}:${by}`);
      holes.push(`${bx + px}:${by + py}`); // 2nd row of body
    }
  } else if (c.type === 'dip') {
    // NodeMCU/DIP: Entire rect between pin columns
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    c.pins.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        holes.push(`${x}:${y}`);
      }
    }
  }
  return holes;
}

function evaluate() {
  const holeOccupancy = new Map(); // key -> [comp]
  
  for (const c of components) {
    for (const p of c.pins) {
      if (p.x < 1 || p.x > W || p.y < 1 || p.y > H) return Infinity; // out of bounds
    }
    
    const pinsSet = new Set(c.pins.map(p => `${p.x}:${p.y}`));
    const bHoles = getBodyHoles(c);
    const allHoles = new Set([...pinsSet, ...bHoles]);
    
    for (const h of allHoles) {
      const isPin = pinsSet.has(h);
      if (!holeOccupancy.has(h)) holeOccupancy.set(h, []);
      const occupants = holeOccupancy.get(h);
      
      for (const occ of occupants) {
        let collision = false;
        if (isPin || occ.isPin) {
            // Пины сталкиваются с любыми телами и другими пинами
            collision = true;
        } else {
            // Body-to-Body: разрешаем только если один clearance, а другой allowUnder
            if (!(c.hasClearance && occ.allowUnder) && !(occ.hasClearance && c.allowUnder)) collision = true;
        }
        if (collision) return Infinity;
      }
      occupants.push({ ref: c.ref, isPin: isPin, hasClearance: c.hasClearance, allowUnder: c.allowUnder });
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let penalties = 0;

  refreshPinKeyMap();
  for (const c of components) {
    for (const p of c.pins) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    // Preferred orientation: keep TO-92 and Axial aligned with board axes
    if (c.type === 'to92' && c.rot !== 0) penalties += 100;
    if (c.type === 'axial' && c.span !== 2) penalties += 50 * Math.abs(c.span - 2);
  }

  const bw = (maxX - minX + 1);
  const bh = (maxY - minY + 1);
  const bboxArea = bw * bh;
  const perimeter = (bw + bh);
  const aspect = Math.max(bw, bh) / Math.min(bw, bh);
  
  // Base cost: Area (weight 5.0) + Perimeter (weight 10.0)
  // Perimeter helps avoid long "L" tails
  let cost = bboxArea * 5.0 + perimeter * 10.0;
  
  // Penalty for extreme aspect ratios (L-shapes usually cause this)
  if (aspect > 2.5) cost += (aspect - 2.5) * 200;

  // Cluster gravity: keep components close to each other
  let centerX = 0, centerY = 0;
  let hasAnchor = false;
  for (const c of components) { 
    if (c.type === 'dip') { // NodeMCU is usually 'dip' type in this script
      centerX = c.anchorX + (c.rot === 0 ? 5 : 7); // Rough center of NodeMCU
      centerY = c.anchorY + (c.rot === 0 ? 7 : 5);
      hasAnchor = true;
      break;
    }
  }
  
  if (!hasAnchor) {
    for (const c of components) { centerX += c.anchorX; centerY += c.anchorY; }
    centerX /= components.length; centerY /= components.length;
  }

  for (const c of components) {
    const dist = manhattan({x: c.anchorX, y: c.anchorY}, {x: centerX, y: centerY});
    cost += dist * (hasAnchor ? 2.0 : 0.5); // Stronger gravity if anchor exists
  }

  let wire = 0;
  let adjacencyPenalty = 0;
  for (const pins of Object.values(netlist)) {
    const pts = pins.map(k => pinKeyMap.get(k)).filter(p => !!p);
    if (pts.length > 1) {
      const len = mstLength(pts);
      wire += len;
      // Adjacency Penalty: if points are more than 1 unit apart, add extra cost
      // This forces components to touch each other if they share a net
      if (len > pts.length - 1) {
        adjacencyPenalty += (len - (pts.length - 1)) * 15.0;
      }
    }
  }
  
  // High wire weight (10.0) and Adjacency Penalty to keep connected components together
  return cost + wire * 10.0 + adjacencyPenalty + penalties;
}

function deepCopyState(comps) {
  return comps.map(c => ({
    anchorX: c.anchorX, anchorY: c.anchorY, rot: c.rot, span: c.span,
    pins: c.pins.map(p => ({ ...p }))
  }));
}

function applyState(comps, state) {
  for (let i = 0; i < comps.length; i++) {
    comps[i].anchorX = state[i].anchorX; comps[i].anchorY = state[i].anchorY;
    comps[i].rot = state[i].rot; comps[i].span = state[i].span;
    comps[i].pins = state[i].pins.map(p => ({ ...p }));
  }
}

let currentCost = evaluate();
let bestCost = currentCost;
let bestState = deepCopyState(components);

console.log(`Initial Score: ${currentCost.toFixed(2)}`);

let acceptedCount = 0;
let rejectedInf = 0;

for (let i = 0; i < opts.iters; i++) {
  const idx = Math.floor(rnd() * components.length);
  const c = components[idx];
  const oldState = { ax: c.anchorX, ay: c.anchorY, rot: c.rot, span: c.span };

  const roll = rnd();
  if (roll < 0.7) {
    c.anchorX += Math.floor(rnd() * (2 * opts.move + 1)) - opts.move;
    c.anchorY += Math.floor(rnd() * (2 * opts.move + 1)) - opts.move;
  } else if (roll < 0.9) {
    if (c.type === 'axial' || c.type === 'to92') c.rot = (c.rot === 0) ? 90 : 0;
  } else {
    if (c.type === 'axial') c.span = 2 + Math.floor(rnd() * 4);
  }

  updatePinsFromState(c);
  const newCost = evaluate();
  
  if (!Number.isFinite(newCost)) {
    rejectedInf++;
    c.anchorX = oldState.ax; c.anchorY = oldState.ay;
    c.rot = oldState.rot; c.span = oldState.span;
    updatePinsFromState(c);
    continue;
  }

  const t = opts.t0 * Math.pow(opts.t1 / opts.t0, i / (opts.iters - 1));
  const delta = newCost - currentCost;

  if (delta <= 0 || Math.exp(-delta / t) > rnd()) {
    currentCost = newCost;
    acceptedCount++;
    if (newCost < bestCost) {
      bestCost = newCost;
      bestState = deepCopyState(components);
    }
  } else {
    c.anchorX = oldState.ax; c.anchorY = oldState.ay;
    c.rot = oldState.rot; c.span = oldState.span;
    updatePinsFromState(c);
  }

  if (i % 5000 === 0) console.log(`Iter ${i}: Cost ${currentCost.toFixed(2)} (Acc: ${acceptedCount}, RejInf: ${rejectedInf})`);
}

applyState(components, bestState);

for (const c of components) {
  const target = data.components.find(x => x.ref === c.ref);
  if (target) target.pins = c.pins.map(p => ({ name: p.name, x: p.x, y: p.y }));
}

if (!opts.keepNets && Array.isArray(data.nets)) {
  for (const n of data.nets) { n.segments = []; n.jumpers = []; }
}

fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
console.log(`Optimization Done. Final Score: ${bestCost.toFixed(2)} (Total Acc: ${acceptedCount}, Total RejInf: ${rejectedInf})`);

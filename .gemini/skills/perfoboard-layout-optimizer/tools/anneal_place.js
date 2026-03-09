const fs = require('fs');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log("Usage: node anneal_place.js <file.json> [--iters N] [--t0 N] [--t1 N] [--seed N] [--move N] [--keep-nets]");
  process.exit(1);
}

const inputFile = args[0];
const opts = {
  iters: 20000,
  t0: 10,
  t1: 0.1,
  seed: 1,
  move: 1,
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
if (!W || !H) {
  console.log("Invalid board size");
  process.exit(1);
}

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

function deepCopyPins(components) {
  return components.map(c => ({
    ref: c.ref,
    pins: c.pins.map(p => ({ name: p.name, x: p.x, y: p.y })),
    body: c.body ? { ...c.body } : undefined,
    keepout: Array.isArray(c.keepout) ? c.keepout.map(k => ({ ...k })) : undefined
  }));
}

function applySnapshot(components, snap) {
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    const s = snap[i];
    c.ref = s.ref;
    c.pins = s.pins.map(p => ({ ...p }));
    c.body = s.body ? { ...s.body } : undefined;
    c.keepout = Array.isArray(s.keepout) ? s.keepout.map(k => ({ ...k })) : undefined;
  }
}

const components = (data.components || []).map(c => ({
  ref: c.ref,
  pins: (c.pins || []).map(p => ({ name: p.name, x: p.x, y: p.y })),
  body: c.body ? { ...c.body } : undefined,
  keepout: Array.isArray(c.keepout) ? c.keepout.map(k => ({ ...k })) : undefined
}));

const pinKeyMap = new Map();
for (const c of components) {
  for (const p of c.pins) {
    pinKeyMap.set(`${c.ref}:${p.name}`, p);
  }
}

function buildNetlistFromSegments() {
  const pinByCoord = new Map();
  for (const c of components) {
    for (const p of c.pins) {
      pinByCoord.set(`${p.x}:${p.y}`, `${c.ref}:${p.name}`);
    }
  }
  const netlist = {};
  for (const n of (data.nets || [])) {
    const set = new Set();
    if (Array.isArray(n.segments)) {
      for (const s of n.segments) {
        const dx = Math.sign(s.x2 - s.x1);
        const dy = Math.sign(s.y2 - s.y1);
        let cx = s.x1, cy = s.y1;
        while (true) {
          const key = `${cx}:${cy}`;
          if (pinByCoord.has(key)) set.add(pinByCoord.get(key));
          if (cx === s.x2 && cy === s.y2) break;
          cx += dx; cy += dy;
        }
      }
    }
    if (set.size > 0) netlist[n.name] = Array.from(set);
  }
  return netlist;
}

function buildNetlistFromExplicit() {
  if (!data.netlist) return null;
  const netlist = {};
  for (const [net, pins] of Object.entries(data.netlist)) {
    if (Array.isArray(pins)) {
      netlist[net] = pins.filter(v => typeof v === 'string');
    }
  }
  return netlist;
}

const netlist = buildNetlistFromExplicit() || buildNetlistFromSegments();

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function mstLength(points) {
  if (points.length <= 1) return 0;
  const used = new Array(points.length).fill(false);
  const dist = new Array(points.length).fill(Infinity);
  dist[0] = 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    let v = -1;
    for (let j = 0; j < points.length; j++) {
      if (!used[j] && (v === -1 || dist[j] < dist[v])) v = j;
    }
    used[v] = true;
    total += dist[v];
    for (let j = 0; j < points.length; j++) {
      if (!used[j]) {
        const d = manhattan(points[v], points[j]);
        if (d < dist[j]) dist[j] = d;
      }
    }
  }
  return total;
}

function isInsideRect(p, r) {
  const x1 = Math.min(r.x1, r.x2);
  const x2 = Math.max(r.x1, r.x2);
  const y1 = Math.min(r.y1, r.y2);
  const y2 = Math.max(r.y1, r.y2);
  return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
}

function evaluate() {
  const occupied = new Set();
  for (const c of components) {
    for (const p of c.pins) {
      if (p.x < 1 || p.x > W || p.y < 1 || p.y > H) return Infinity;
      const key = `${p.x}:${p.y}`;
      if (occupied.has(key)) return Infinity;
      occupied.add(key);
    }
  }
  for (const c of components) {
    if (Array.isArray(c.keepout)) {
      for (const other of components) {
        if (other.ref === c.ref) continue;
        for (const p of other.pins) {
          for (const r of c.keepout) {
            if (isInsideRect(p, r)) return Infinity;
          }
        }
      }
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of components) {
    for (const p of c.pins) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);

  let wire = 0;
  for (const pins of Object.values(netlist)) {
    const pts = [];
    for (const key of pins) {
      const pin = pinKeyMap.get(key);
      if (pin) pts.push(pin);
    }
    if (pts.length > 1) wire += mstLength(pts);
  }

  return bboxArea * 1.0 + wire * 0.5;
}

function moveComponent(c, dx, dy) {
  for (const p of c.pins) {
    p.x += dx; p.y += dy;
  }
  if (c.body) {
    c.body.x1 += dx; c.body.x2 += dx;
    c.body.y1 += dy; c.body.y2 += dy;
  }
  if (Array.isArray(c.keepout)) {
    for (const k of c.keepout) {
      k.x1 += dx; k.x2 += dx;
      k.y1 += dy; k.y2 += dy;
    }
  }
}

let currentCost = evaluate();
if (!Number.isFinite(currentCost)) {
  console.log("Initial placement is invalid");
  process.exit(1);
}

let bestCost = currentCost;
let bestSnap = deepCopyPins(components);

for (let i = 0; i < opts.iters; i++) {
  const idx = Math.floor(rnd() * components.length);
  const c = components[idx];

  let dx = 0, dy = 0;
  while (dx === 0 && dy === 0) {
    dx = Math.floor(rnd() * (2 * opts.move + 1)) - opts.move;
    dy = Math.floor(rnd() * (2 * opts.move + 1)) - opts.move;
  }

  moveComponent(c, dx, dy);
  const newCost = evaluate();

  const t = opts.t0 * Math.pow(opts.t1 / opts.t0, i / Math.max(1, opts.iters - 1));
  const delta = newCost - currentCost;
  const accept = delta <= 0 || Math.exp(-delta / Math.max(1e-9, t)) > rnd();

  if (accept && Number.isFinite(newCost)) {
    currentCost = newCost;
    if (newCost < bestCost) {
      bestCost = newCost;
      bestSnap = deepCopyPins(components);
    }
  } else {
    moveComponent(c, -dx, -dy);
  }
}

applySnapshot(components, bestSnap);

for (const c of components) {
  const target = data.components.find(x => x.ref === c.ref);
  if (target) {
    target.pins = c.pins.map(p => ({ name: p.name, x: p.x, y: p.y }));
    if (c.body) target.body = { ...c.body };
    if (Array.isArray(c.keepout)) target.keepout = c.keepout.map(k => ({ ...k }));
  }
}

if (!opts.keepNets && Array.isArray(data.nets)) {
  for (const n of data.nets) {
    n.segments = [];
    n.jumpers = [];
  }
}

fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
console.log(`Done. Best score: ${bestCost.toFixed(2)}`);

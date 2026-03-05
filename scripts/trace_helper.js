const fs = require('fs');

const args = process.argv.slice(2);
if (args.length < 6) {
  console.log("Usage: node trace_helper.js <file.json> <netName> <x1> <y1> <x2> <y2>");
  process.exit(1);
}

const [file, netName, x1, y1, x2, y2] = args.map((v, i) => i === 1 ? v : Number(v) || v);

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// 1. Build Occupancy Grid
const pinsByHole = new Map(); // "x:y" -> netName
data.components.forEach(c => {
  if (c.pins) {
    c.pins.forEach(p => {
      // Find which net this pin belongs to
      const net = data.nets.find(n => n.name === netName); // Temporary, we'll refine
      pinsByHole.set(`${p.x}:${p.y}`, { ref: c.ref, name: p.name });
    });
  }
});

// Map pins to nets from existing segments
data.nets.forEach(n => {
  if (n.segments) {
    n.segments.forEach(s => {
      [ {x:s.x1, y:s.y1}, {x:s.x2, y:s.y2} ].forEach(p => {
        const key = `${p.x}:${p.y}`;
        if (pinsByHole.has(key)) pinsByHole.get(key).net = n.name;
      });
    });
  }
});

// 2. Validate Segment
const dx = Math.sign(x2 - x1);
const dy = Math.sign(y2 - y1);
if (dx !== 0 && dy !== 0) {
    console.error("Error: Only orthogonal segments (horizontal/vertical) are allowed.");
    process.exit(1);
}

let currX = x1;
let currY = y1;
const pathHoles = [];
while (true) {
    pathHoles.push({x: currX, y: currY});
    if (currX === x2 && currY === y2) break;
    currX += dx;
    currY += dy;
}

// Check Hole Conflicts
for (const p of pathHoles) {
    const key = `${p.x}:${p.y}`;
    if (pinsByHole.has(key)) {
        const pin = pinsByHole.get(key);
        if (pin.net && pin.net !== netName) {
            console.error(`CRITICAL ERROR: Path for net '${netName}' passes through pin ${pin.ref}:${pin.name} which belongs to net '${pin.net}' at (${p.x},${p.y})`);
            process.exit(1);
        }
    }
}

// 3. Update JSON
let targetNet = data.nets.find(n => n.name === netName);
if (!targetNet) {
    targetNet = { name: netName, segments: [], jumpers: [] };
    data.nets.push(targetNet);
}
targetNet.segments.push({ x1, y1, x2, y2 });

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Success: Added segment to net '${netName}' from (${x1},${y1}) to (${x2},${y2})`);

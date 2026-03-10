const fs = require('fs');

const file = 'layout/perfoboard-layout.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const netsByHole = new Map(); 

data.nets.forEach(n => {
  if (!n.segments) return;
  n.segments.forEach(s => {
    const dx = Math.sign(s.x2 - s.x1);
    const dy = Math.sign(s.y2 - s.y1);
    let currX = s.x1; let currY = s.y1;
    while (true) {
      const holeKey = `${currX}:${currY}`;
      
      if (!netsByHole.has(holeKey)) netsByHole.set(holeKey, new Set());
      const netsAtHole = netsByHole.get(holeKey);
      netsAtHole.add(n.name);

      if (currX === s.x2 && currY === s.y2) break;
      currX += dx; currY += dy;
    }
  });
});

console.log("--- Short Circuits Debug ---");
netsByHole.forEach((nets, hole) => {
  if (nets.size > 1) {
    console.log(`Hole ${hole} has multiple nets: ${Array.from(nets).join(', ')}`);
  }
});

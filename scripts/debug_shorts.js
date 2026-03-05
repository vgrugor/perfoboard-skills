const fs = require('fs');
const file = 'layout/ne555-astable-v18.json';
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
      if (netsAtHole.size > 0 && !netsAtHole.has(n.name)) {
          console.log(`Short at (${currX},${currY}) between: ${Array.from(netsAtHole).join(', ')} and ${n.name}`);
      }
      netsAtHole.add(n.name);
      if (currX === s.x2 && currY === s.y2) break;
      currX += dx; currY += dy;
    }
  });
});

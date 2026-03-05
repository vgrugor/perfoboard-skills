const fs = require('fs');

const file = process.argv[2] || 'layout/ne555-astable.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

if (!data.components || !data.nets) {
  console.log("Invalid format");
  process.exit(1);
}

// Bbox Calculation
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
data.components.forEach(c => {
  if (c.pins) c.pins.forEach(p => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
});
const w = maxX - minX + 1;
const h = maxY - minY + 1;
const bboxArea = w * h;

// Wire Length (Manhattan)
let wireLength = 0;
data.nets.forEach(n => {
  if (n.segments) {
    n.segments.forEach(s => {
      wireLength += Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
    });
  }
});

// Short Circuit, Hole & Intersection Detection
const netsByHole = new Map(); // "x:y" -> Set of netNames
let shortCircuits = 0;

// Предварительно индексируем пины и их принадлежность к нетам
const pinNets = new Map();
data.components.forEach(c => {
  if (c.pins) {
    c.pins.forEach(p => {
      // Ищем, к какому нету привязан этот пин в данных JSON
      const net = data.nets.find(n => {
          if (n.segments) {
              return n.segments.some(s => (s.x1 === p.x && s.y1 === p.y) || (s.x2 === p.x && s.y2 === p.y));
          }
          return false;
      });
      if (net) pinNets.set(`${p.x}:${p.y}`, net.name);
    });
  }
});

data.nets.forEach(n => {
  if (!n.segments) return;
  n.segments.forEach(s => {
    const dx = Math.sign(s.x2 - s.x1);
    const dy = Math.sign(s.y2 - s.y1);
    let currX = s.x1;
    let currY = s.y1;
    
    while (true) {
      const holeKey = `${currX}:${currY}`;
      
      // Проверка конфликта с ЧУЖИМ пином
      if (pinNets.has(holeKey) && pinNets.get(holeKey) !== n.name) {
          shortCircuits++;
      }

      // Проверка пересечения с ЧУЖОЙ трассой
      if (!netsByHole.has(holeKey)) netsByHole.set(holeKey, new Set());
      const netsAtHole = netsByHole.get(holeKey);
      if (netsAtHole.size > 0 && !netsAtHole.has(n.name)) {
          shortCircuits++;
      }
      netsAtHole.add(n.name);

      if (currX === s.x2 && currY === s.y2) break;
      currX += dx;
      currY += dy;
    }
  });
});

// 4. Calculate Jumpers Cost (Count + Length)
let jumperPenalty = 0;
let jumpersCount = 0;
data.nets.forEach(n => {
  if (n.jumpers) {
    jumpersCount += n.jumpers.length;
    n.jumpers.forEach(j => {
        const len = Math.abs(j.x2 - j.x1) + Math.abs(j.y2 - j.y1);
        jumperPenalty += 50 + (len * 2);
    });
  }
});

const weights = {
  area: 1.0,
  wire: 0.5,
  jumper: 1.0, // Теперь это множитель для jumperPenalty
  short: 1000.0 // КЗ остается фатальным
};

const score = (bboxArea * weights.area) + (wireLength * weights.wire) + (jumperPenalty * weights.jumper) + (shortCircuits * weights.short);

console.log(`
--- Benchmark Report ---
File: ${file}
BBox: ${w}x${h} (Area: ${bboxArea})
Wire Length: ${wireLength}
Jumpers: ${jumpersCount} (Penalty: ${jumperPenalty})
Short Circuits: ${shortCircuits}
-----------------------
TOTAL SCORE: ${score.toFixed(1)}
-----------------------
`);

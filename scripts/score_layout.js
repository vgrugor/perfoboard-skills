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

// Short Circuit & Hole Conflict Detection
const segmentsByEdge = new Map();
const pinsByHole = new Map();
let shortCircuits = 0;

// Сначала индексируем все пины
data.components.forEach(c => {
  if (c.pins) {
    c.pins.forEach(p => {
      pinsByHole.set(`${p.x}:${p.y}`, { net: null, ref: c.ref, name: p.name });
    });
  }
});

// Привязываем пины к нетам
data.nets.forEach(n => {
  if (n.segments) {
    n.segments.forEach(s => {
      // Проверяем все точки (отверстия) на сегменте
      const dx = Math.sign(s.x2 - s.x1);
      const dy = Math.sign(s.y2 - s.y1);
      let currX = s.x1;
      let currY = s.y1;
      
      while (true) {
        const holeKey = `${currX}:${currY}`;
        if (pinsByHole.has(holeKey)) {
            const pin = pinsByHole.get(holeKey);
            if (pin.net && pin.net !== n.name) {
                shortCircuits++; // Провод одной цепи прошел через пин другой
            }
            pin.net = n.name;
        }
        if (currX === s.x2 && currY === s.y2) break;
        currX += dx;
        currY += dy;
      }

      // Проверка наложения ребер (как раньше)
      const x1 = Math.min(s.x1, s.x2);
      const x2 = Math.max(s.x1, s.x2);
      const y1 = Math.min(s.y1, s.y2);
      const y2 = Math.max(s.y1, s.y2);
      if (x1 === x2) {
        for (let y = y1; y < y2; y++) {
          const key = `v:${x1}:${y}:${y+1}`;
          if (segmentsByEdge.has(key) && segmentsByEdge.get(key) !== n.name) shortCircuits++;
          segmentsByEdge.set(key, n.name);
        }
      } else if (y1 === y2) {
        for (let x = x1; x < x2; x++) {
          const key = `h:${y1}:${x}:${x+1}`;
          if (segmentsByEdge.has(key) && segmentsByEdge.get(key) !== n.name) shortCircuits++;
          segmentsByEdge.set(key, n.name);
        }
      }
    });
  }
});

const weights = {
  area: 1.0,
  wire: 0.5,
  jumper: 50.0,
  short: 1000.0 // Огромный штраф за КЗ
};

const score = (bboxArea * weights.area) + (wireLength * weights.wire) + (shortCircuits * weights.short);

console.log(`
--- Benchmark Report ---
File: ${file}
BBox: ${w}x${h} (Area: ${bboxArea})
Wire Length: ${wireLength}
Short Circuits: ${shortCircuits}
-----------------------
TOTAL SCORE: ${score.toFixed(1)}
-----------------------
`);

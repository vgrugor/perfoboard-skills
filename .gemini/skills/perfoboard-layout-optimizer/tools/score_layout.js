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

// Short Circuit, Hole, Intersection & Bypass Detection
const netsByHole = new Map(); 
let shortCircuits = 0;

// Индексация: какой пин какой детали к какой цепи подключен
const componentPinNets = new Map(); // "ref" -> { pinName -> netName }

data.nets.forEach(n => {
  if (!n.segments) return;
  n.segments.forEach(s => {
    const dx = Math.sign(s.x2 - s.x1);
    const dy = Math.sign(s.y2 - s.y1);
    let currX = s.x1; let currY = s.y1;
    while (true) {
      const holeKey = `${currX}:${currY}`;
      
      // Ищем, не пин ли это
      data.components.forEach(c => {
          if (c.pins) {
              c.pins.forEach(p => {
                  if (p.x === currX && p.y === currY) {
                      if (!componentPinNets.has(c.ref)) componentPinNets.set(c.ref, {});
                      const pins = componentPinNets.get(c.ref);
                      pins[p.name] = n.name;
                  }
              });
          }
      });

      if (!netsByHole.has(holeKey)) netsByHole.set(holeKey, new Set());
      const netsAtHole = netsByHole.get(holeKey);
      if (netsAtHole.size > 0 && !netsAtHole.has(n.name)) {
          console.log(`SHORT CIRCUIT: Hole ${holeKey} used by nets: [${Array.from(netsAtHole).join(', ')}] and [${n.name}]`);
          shortCircuits++;
      }
      netsAtHole.add(n.name);

      if (currX === s.x2 && currY === s.y2) break;
      currX += dx; currY += dy;
    }
  });
});

// Проверка на Bypass (замыкание компонента самим собой)
componentPinNets.forEach((pins, ref) => {
    const netNames = Object.values(pins);
    const uniqueNets = new Set(netNames);
    if (netNames.length > 1 && uniqueNets.size < netNames.length) {
        // Если у компонента >1 пина и они попали в один и тот же нет (кроме GND/VCC если это явно нужно)
        // Для R, C это всегда ошибка
        if (ref.startsWith('R') || ref.startsWith('C') || ref.startsWith('LED')) {
            console.log(`BYPASS ERROR: Component ${ref} is shorted by net '${netNames[0]}'`);
            shortCircuits += 10; // Массивный штраф
        }
    }
});

// 4. Calculate Jumpers Cost (Count + Length)
let jumperPenalty = 0;
let jumpersCount = 0;
let dirtyVias = 0;

const allPins = new Set();
data.components.forEach(c => {
  if (c.pins) c.pins.forEach(p => allPins.add(`${p.x}:${p.y}`));
});

data.nets.forEach(n => {
  if (n.jumpers) {
    jumpersCount += n.jumpers.length;
    n.jumpers.forEach(j => {
        const len = Math.abs(j.x2 - j.x1) + Math.abs(j.y2 - j.y1);
        jumperPenalty += 50 + (len * 2);
        
        // Clean Via Rule check
        if (allPins.has(`${j.x1}:${j.y1}`)) {
            console.log(`DIRTY VIA ERROR: Jumper in net '${n.name}' starts on a component pin at (${j.x1},${j.y1})`);
            dirtyVias++;
        }
        if (allPins.has(`${j.x2}:${j.y2}`)) {
            console.log(`DIRTY VIA ERROR: Jumper in net '${n.name}' ends on a component pin at (${j.x2},${j.y2})`);
            dirtyVias++;
        }
    });
  }
});

const weights = {
  area: 1.0,
  wire: 0.5,
  jumper: 1.0, 
  short: 1000.0,
  dirtyVia: 500.0 // Штраф за грязный переход
};

const score = (bboxArea * weights.area) + (wireLength * weights.wire) + (jumperPenalty * weights.jumper) + (shortCircuits * weights.short) + (dirtyVias * weights.dirtyVia);

console.log(`
--- Benchmark Report ---
File: ${file}
BBox: ${w}x${h} (Area: ${bboxArea})
Wire Length: ${wireLength}
Jumpers: ${jumpersCount} (Penalty: ${jumperPenalty})
Short Circuits: ${shortCircuits}
Dirty Vias: ${dirtyVias}
-----------------------
TOTAL SCORE: ${score.toFixed(1)}
-----------------------
`);

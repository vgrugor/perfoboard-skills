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

// 5. Physical Collision Detection (Body Keepout Overlap)
const bodyOccupancy = new Map(); // "x:y" -> [ref]
let physicalCollisions = 0;

function getKeepoutPoints(comp) {
    const points = new Set();
    const pins = comp.pins || [];
    if (pins.length === 0) return points;

    const pkg = (comp.package || "").toLowerCase();
    
    // Helper: add rectangle
    const addRect = (x1, y1, x2, y2) => {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                points.add(`${x}:${y}`);
            }
        }
    };

    if (pkg.includes("nodemcu")) {
        // NodeMCU keepout: rectangular area between pin rows plus padding
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        addRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    } else if (pkg.includes("buzzer")) {
        // Buzzer: Manhattan radius 2 around center of pins
        const avgX = pins.reduce((sum, p) => sum + p.x, 0) / pins.length;
        const avgY = pins.reduce((sum, p) => sum + p.y, 0) / pins.length;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                if (Math.abs(dx) + Math.abs(dy) <= 2) {
                    points.add(`${Math.round(avgX + dx)}:${Math.round(avgY + dy)}`);
                }
            }
        }
    } else if (pkg.includes("to-92")) {
        // TO-92: 3x2 area near pins
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        addRect(minX, minY, maxX, maxY);
        // Add 1 hole depth for body
        if (maxX - minX > maxY - minY) addRect(minX, minY - 1, maxX, maxY + 1);
        else addRect(minX - 1, minY, maxX + 1, maxY);
    } else if (pkg.includes("led")) {
        // LED: 1 hole around each pin
        pins.forEach(p => {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    points.add(`${p.x + dx}:${p.y + dy}`);
                }
            }
        });
    } else if (pkg.includes("axial")) {
        // Axial: only the holes between pins
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        addRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    } else {
        // Default: just pins
        pins.forEach(p => points.add(`${p.x}:${p.y}`));
    }
    return points;
}

data.components.forEach(c => {
    const points = getKeepoutPoints(c);
    points.forEach(pKey => {
        if (!bodyOccupancy.has(pKey)) bodyOccupancy.set(pKey, []);
        const occupants = bodyOccupancy.get(pKey);
        if (occupants.length > 0) {
            console.log(`BODY COLLISION: Hole ${pKey} occupied by ${occupants.join(", ")} and ${c.ref}`);
            physicalCollisions++;
        }
        occupants.push(c.ref);
    });
});

const weights = {
  area: 1.0,
  wire: 0.5,
  jumper: 1.0, 
  short: 1000.0,
  dirtyVia: 500.0,
  collision: 2000.0 // Штраф за наложение корпусов
};

const score = (bboxArea * weights.area) + (wireLength * weights.wire) + (jumperPenalty * weights.jumper) + (shortCircuits * weights.short) + (dirtyVias * weights.dirtyVia) + (physicalCollisions * weights.collision);

console.log(`
--- Benchmark Report ---
File: ${file}
BBox: ${w}x${h} (Area: ${bboxArea})
Wire Length: ${wireLength}
Jumpers: ${jumpersCount} (Penalty: ${jumperPenalty})
Short Circuits: ${shortCircuits}
Dirty Vias: ${dirtyVias}
Physical Collisions: ${physicalCollisions}
-----------------------
TOTAL SCORE: ${score.toFixed(1)}
-----------------------
`);

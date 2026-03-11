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
let jumperOverPinErrors = 0;

const allPins = new Map(); // "x:y" -> ref
data.components.forEach(c => {
    if (c.pins) c.pins.forEach(p => allPins.set(`${p.x}:${p.y}`, c.ref));
});

data.nets.forEach(n => {
    if (n.jumpers) {
        jumpersCount += n.jumpers.length;
        n.jumpers.forEach(j => {
            const dx = Math.sign(j.x2 - j.x1);
            const dy = Math.sign(j.y2 - j.y1);
            const len = Math.abs(j.x2 - j.x1) + Math.abs(j.y2 - j.y1);
            jumperPenalty += 50 + (len * 2);

            // Clean Via Rule check (Endpoints)
            if (allPins.has(`${j.x1}:${j.y1}`)) {
                console.log(`DIRTY VIA ERROR: Jumper in net '${n.name}' starts on a component pin at (${j.x1},${j.y1})`);
                dirtyVias++;
            }
            if (allPins.has(`${j.x2}:${j.y2}`)) {
                console.log(`DIRTY VIA ERROR: Jumper in net '${n.name}' ends on a component pin at (${j.x2},${j.y2})`);
                dirtyVias++;
            }

            // Jumper Over Pin check (Intermediate holes)
            let currX = j.x1 + dx; let currY = j.y1 + dy;
            // Only check intermediate holes, endpoints are checked by Dirty Via
            if (len > 1) {
                while (!(currX === j.x2 && currY === j.y2)) {
                    const holeKey = `${currX}:${currY}`;
                    if (allPins.has(holeKey)) {
                        console.log(`JUMPER OVER PIN ERROR: Jumper in net '${n.name}' (${j.x1},${j.y1})->(${j.x2},${j.y2}) passes over pin of ${allPins.get(holeKey)} at ${holeKey}`);
                        jumperOverPinErrors++;
                    }
                    currX += dx; currY += dy;
                }
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
        // TO-92: Only pins area for high mounting (3x1)
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        addRect(minX, minY, maxX, maxY);
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

const holeOccupancy = new Map();
data.components.forEach(c => {
    const pkg = (c.package || "").toLowerCase();
    
    // Приоритет отдается свойствам в JSON, если их нет — определяем по типу пакета
    const hasClearance = c.hasClearanceUnderneath !== undefined ? c.hasClearanceUnderneath : pkg.includes("nodemcu");
    const allowUnder = c.allowPlacementUnderBoard !== undefined ? c.allowPlacementUnderBoard : 
        (pkg.includes("axial") || pkg.includes("buzzer") || pkg.includes("to-92") || pkg.includes("led") || pkg.includes("radial") || pkg.includes("dip") || pkg.includes("header") || pkg.includes("0805") || pkg.includes("1206"));

    const pinPoints = new Set((c.pins || []).map(p => `${p.x}:${p.y}`));
    const points = getKeepoutPoints(c);

    points.forEach(pKey => {
        const isPin = pinPoints.has(pKey);
        if (!holeOccupancy.has(pKey)) holeOccupancy.set(pKey, []);
        const occupants = holeOccupancy.get(pKey);

        occupants.forEach(occ => {
            let collision = false;
            
            if (isPin && occ.isPin) {
                // Пин на пин — всегда коллизия в одном отверстии
                collision = true;
            } else if (isPin || occ.isPin) {
                // Пин одного компонента в зоне корпуса другого
                const pinComp = isPin ? { ref: c.ref, hasClearance, allowUnder } : occ;
                const bodyComp = isPin ? occ : { ref: c.ref, hasClearance, allowUnder };

                // Разрешено, если деталь с пином помечена как allowUnder, а деталь с корпусом — как hasClearance
                if (pinComp.allowUnder && bodyComp.hasClearance) {
                    collision = false;
                } else {
                    collision = true;
                }
            } else {
                // Корпус на корпус
                // Разрешено, если один имеет Clearance, а другой — allowUnder
                if ((hasClearance && occ.allowUnder) || (occ.hasClearance && allowUnder)) {
                    collision = false;
                } else {
                    collision = true;
                }
            }

            if (collision) {
                console.log(`BODY COLLISION: Hole ${pKey} occupied by ${occ.ref} and ${c.ref}`);
                physicalCollisions++;
            }
        });
        occupants.push({ ref: c.ref, pkg, isPin, hasClearance, allowUnder });
    });
});

const weights = {
    area: 1.0,
    wire: 0.5,
    jumper: 1.0,
    short: 1000.0,
    dirtyVia: 500.0,
    jumperOverPin: 1000.0,
    collision: 2000.0 // Штраф за наложение корпусов
};

const score = (bboxArea * weights.area) + (wireLength * weights.wire) + (jumperPenalty * weights.jumper) + (shortCircuits * weights.short) + (dirtyVias * weights.dirtyVia) + (jumperOverPinErrors * weights.jumperOverPin) + (physicalCollisions * weights.collision);

console.log(`
--- Benchmark Report ---
File: ${file}
BBox: ${w}x${h} (Area: ${bboxArea})
Wire Length: ${wireLength}
Jumpers: ${jumpersCount} (Penalty: ${jumperPenalty})
Short Circuits: ${shortCircuits}
Dirty Vias: ${dirtyVias}
Jumper Over Pin Errors: ${jumperOverPinErrors}
Physical Collisions: ${physicalCollisions}
-----------------------
TOTAL SCORE: ${score.toFixed(1)}
-----------------------
`);

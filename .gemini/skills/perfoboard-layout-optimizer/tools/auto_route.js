const fs = require('fs');

if (process.argv.length < 8) {
    console.log("Usage: node auto_route.js <file.json> <netName> <x1> <y1> <x2> <y2>");
    process.exit(1);
}

const inputFile = process.argv[2];
const netName = process.argv[3];
const x1 = parseInt(process.argv[4]);
const y1 = parseInt(process.argv[5]);
const x2 = parseInt(process.argv[6]);
const y2 = parseInt(process.argv[7]);

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const W = data.board.width;
const H = data.board.height;

// 1. Построение карты препятствий (Улучшенное)
const blockedHoles = new Set();
const blockedEdges = new Set(); // "x1:y1-x2:y2"
const netEdges = new Set(); // Ребра текущей цепи для переиспользования
const netHoles = new Set(); // Отверстия текущей цепи
const bonusHoles = new Map(); // "x:y" -> cost multiplier (0.6 для прохода под корпусами)

// Функция определения точек корпуса (аналогично score_layout.js)
function getUnderBodyPoints(comp) {
    const points = new Set();
    const pins = comp.pins || [];
    if (pins.length === 0) return points;
    const pkg = (comp.package || "").toLowerCase();
    const pinKeys = new Set(pins.map(p => `${p.x}:${p.y}`));

    const addRect = (x1, y1, x2, y2) => {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                const key = `${x}:${y}`;
                if (!pinKeys.has(key)) points.add(key);
            }
        }
    };

    if (pkg.includes("nodemcu")) {
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        addRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    } else if (pkg.includes("axial") || pkg.includes("dip")) {
        const xs = pins.map(p => p.x);
        const ys = pins.map(p => p.y);
        addRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    } else if (pkg.includes("to-92") || pkg.includes("led")) {
        pins.forEach(p => {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${p.x + dx}:${p.y + dy}`;
                    if (!pinKeys.has(key)) points.add(key);
                }
            }
        });
    }
    return points;
}

data.nets.forEach(n => {
    if (n.segments) {
        n.segments.forEach(s => {
            const edgeKey1 = `${s.x1}:${s.y1}-${s.x2}:${s.y2}`;
            const edgeKey2 = `${s.x2}:${s.y2}-${s.x1}:${s.y1}`;

            if (n.name === netName) {
                netEdges.add(edgeKey1);
                netEdges.add(edgeKey2);
                
                const dx = Math.sign(s.x2 - s.x1);
                const dy = Math.sign(s.y2 - s.y1);
                let cx = s.x1, cy = s.y1;
                while (true) {
                    netHoles.add(`${cx}:${cy}`);
                    if (cx === s.x2 && cy === s.y2) break;
                    cx += dx; cy += dy;
                }
            } else {
                blockedEdges.add(edgeKey1);
                blockedEdges.add(edgeKey2);

                const dx = Math.sign(s.x2 - s.x1);
                const dy = Math.sign(s.y2 - s.y1);
                let cx = s.x1, cy = s.y1;
                while (true) {
                    blockedHoles.add(`${cx}:${cy}`);
                    if (cx === s.x2 && cy === s.y2) break;
                    cx += dx; cy += dy;
                }
            }
        });
    }
    if (n.jumpers) {
        n.jumpers.forEach(j => {
            if (n.name !== netName) {
                blockedHoles.add(`${j.x1}:${j.y1}`);
                blockedHoles.add(`${j.x2}:${j.y2}`);
            }
        });
    }
});

// Собираем бонусы за проход под корпусами
data.components.forEach(c => {
    const underPoints = getUnderBodyPoints(c);
    underPoints.forEach(pKey => {
        bonusHoles.set(pKey, 0.6); // Стимул: проход под корпусом дешевле (0.6 вместо 1.0)
    });
});

// Блокируем чужие пины и собираем ВСЕ пины для правила Clean Via
const allPins = new Set();
data.components.forEach(c => {
    if (c.pins) c.pins.forEach(p => {
        allPins.add(`${p.x}:${p.y}`);
        const isTargetPin = (p.x === x1 && p.y === y1) || (p.x === x2 && p.y === y2);
        let pinBelongsToNet = false;
        const targetNet = data.nets.find(n => n.name === netName);
        if (targetNet && targetNet.nodes) {
            pinBelongsToNet = targetNet.nodes.includes(`${c.ref}.${p.name}`);
        }
        if (!isTargetPin && !pinBelongsToNet) {
            blockedHoles.add(`${p.x}:${p.y}`);
        }
        if (pinBelongsToNet) {
            netHoles.add(`${p.x}:${p.y}`);
        }
    });
});

// 2. Алгоритм A* (Двухслойный)
const queue = [{ x: x1, y: y1, l: 0, cost: 0, path: [] }];
const visited = new Map();
let bestPath = null;

while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const curr = queue.shift();
    const key = `${curr.x}:${curr.y}:${curr.l}`;

    if (visited.has(key) && visited.get(key) <= curr.cost) continue;
    visited.set(key, curr.cost);

    const newPath = [...curr.path, { x: curr.x, y: curr.y, l: curr.l }];
    const holeKey = `${curr.x}:${curr.y}`;

    const isGoal = (curr.x === x2 && curr.y === y2) || (netHoles.has(holeKey) && curr.path.length > 0);

    if (isGoal && curr.l === 0) {
        bestPath = newPath;
        break;
    }

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;

        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const nHoleKey = `${nx}:${ny}`;
            const edgeKey = `${curr.x}:${curr.y}-${nx}:${ny}`;

            // 1. ПУТЬ ПО НИЗУ (Layer 0)
            if (curr.l === 0 && !blockedEdges.has(edgeKey)) {
                if (netHoles.has(nHoleKey) || !blockedHoles.has(nHoleKey)) {
                    let moveCost = netEdges.has(edgeKey) ? 0.1 : 1;
                    
                    // ПРИМЕНЕНИЕ СТИМУЛА: если наступаем в зону под корпусом
                    if (bonusHoles.has(nHoleKey)) {
                        moveCost *= bonusHoles.get(nHoleKey);
                    }
                    
                    queue.push({ x: nx, y: ny, l: 0, cost: curr.cost + moveCost, path: newPath });
                }
            }

            // 2. ПЕРЕХОД НА ВЕРХ (Layer 1 - Jumper Start)
            if (curr.l === 0 && !allPins.has(`${curr.x}:${curr.y}`)) {
                const startJumperCost = 50;
                queue.push({ x: nx, y: ny, l: 1, cost: curr.cost + startJumperCost, path: newPath });
            }

            // 3. ПУТЬ ПО ВЕРХУ (Layer 1 - Jumper Continue)
            if (curr.l === 1) {
                const isOverPin = allPins.has(nHoleKey);
                const continueJumperCost = 2 + (isOverPin ? 1000 : 0);
                queue.push({ x: nx, y: ny, l: 1, cost: curr.cost + continueJumperCost, path: newPath });

                // 4. ПЕРЕХОД НА НИЗ (Layer 1 -> Layer 0 - Jumper End)
                if (!allPins.has(nHoleKey)) {
                    const endJumperCost = 1;
                    queue.push({ x: nx, y: ny, l: 0, cost: curr.cost + endJumperCost, path: newPath });
                }
            }
        }
    }
}

if (!bestPath) {
    console.error(`ERROR: No path found for '${netName}' from (${x1},${y1}) to (${x2},${y2})`);
    process.exit(1);
}

// 3. Сохранение в JSON
let targetNet = data.nets.find(n => n.name === netName);
if (!targetNet) {
    targetNet = { name: netName, segments: [], jumpers: [] };
    data.nets.push(targetNet);
}
if (!targetNet.segments) targetNet.segments = [];
if (!targetNet.jumpers) targetNet.jumpers = [];

for (let i = 1; i < bestPath.length; i++) {
    const p1 = bestPath[i - 1];
    const p2 = bestPath[i];
    if (p2.l === 0) {
        const exists = targetNet.segments.some(s =>
            (s.x1 === p1.x && s.y1 === p1.y && s.x2 === p2.x && s.y2 === p2.y) ||
            (s.x1 === p2.x && s.y1 === p2.y && s.x2 === p1.x && s.y2 === p1.y)
        );
        if (!exists) {
            targetNet.segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        }
    } else {
        targetNet.jumpers.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
}

fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
console.log(`SUCCESS: Route added to '${netName}'. Jumper used: ${bestPath.some(p => p.l === 1)}`);

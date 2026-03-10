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

data.nets.forEach(n => {
    if (n.segments) {
        n.segments.forEach(s => {
            const edgeKey1 = `${s.x1}:${s.y1}-${s.x2}:${s.y2}`;
            const edgeKey2 = `${s.x2}:${s.y2}-${s.x1}:${s.y1}`;
            
            if (n.name === netName) {
                netEdges.add(edgeKey1);
                netEdges.add(edgeKey2);
                netHoles.add(`${s.x1}:${s.y1}`);
                netHoles.add(`${s.x2}:${s.y2}`);
            } else {
                blockedEdges.add(edgeKey1);
                blockedEdges.add(edgeKey2);
                
                // Блокируем все отверстия на пути чужого сегмента
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

// Блокируем чужие пины
data.components.forEach(c => {
    if (c.pins) c.pins.forEach(p => {
        const isTargetPin = (p.x === x1 && p.y === y1) || (p.x === x2 && p.y === y2);
        // Если пин не принадлежит текущей цепи и не является точкой старта/финиша - блокируем
        let pinBelongsToNet = false;
        const targetNet = data.nets.find(n => n.name === netName);
        if (targetNet && targetNet.nodes) {
            pinBelongsToNet = targetNet.nodes.includes(`${c.ref}.${p.name}`);
        }
        
        if (!isTargetPin && !pinBelongsToNet) {
            blockedHoles.add(`${p.x}:${p.y}`);
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

    if (curr.x === x2 && curr.y === y2) {
        bestPath = newPath;
        break;
    }

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;

        if (nx >= 0 && nx < W && ny >= 0 && ny < H) { // Сетка от 0
            const holeKey = `${nx}:${ny}`;
            const edgeKey = `${curr.x}:${curr.y}-${nx}:${ny}`;

            // 1. ПУТЬ ПО НИЗУ (Layer 0)
            if (!blockedEdges.has(edgeKey)) {
                // Если мы на нижнем слое, проверяем отверстие (кроме случая, когда это уже наша цепь)
                if (curr.l === 0 && (netHoles.has(holeKey) || !blockedHoles.has(holeKey))) {
                    // Стоимость: 0.1 если ребро уже в цепи, иначе 1
                    const moveCost = netEdges.has(edgeKey) ? 0.1 : 1;
                    queue.push({ x: nx, y: ny, l: 0, cost: curr.cost + moveCost, path: newPath });
                }
            }

            // 2. ПУТЬ ПО ВЕРХУ (Layer 1 - Jumper)
            // Джампер можно ставить только если текущее отверстие НЕ занято чужим пином
            if (curr.l === 1 || !blockedHoles.has(`${curr.x}:${curr.y}`)) {
                const jumperCost = (curr.l === 1) ? 2 : 50; 
                queue.push({ x: nx, y: ny, l: 1, cost: curr.cost + jumperCost, path: newPath });
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
    const p1 = bestPath[i-1];
    const p2 = bestPath[i];
    if (p2.l === 0) {
        // Добавляем только если такого сегмента еще нет
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

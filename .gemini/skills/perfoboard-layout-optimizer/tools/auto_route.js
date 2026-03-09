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

data.nets.forEach(n => {
    // Блокируем отверстия и ребра от существующих сегментов
    if (n.segments) {
        n.segments.forEach(s => {
            const dx = Math.sign(s.x2 - s.x1);
            const dy = Math.sign(s.y2 - s.y1);
            let cx = s.x1, cy = s.y1;
            while (true) {
                if (n.name !== netName) blockedHoles.add(`${cx}:${cy}`);
                if (cx === s.x2 && cy === s.y2) break;
                const pX = cx, pY = cy;
                cx += dx; cy += dy;
                if (n.name !== netName) {
                    blockedEdges.add(`${pX}:${pY}-${cx}:${cy}`);
                    blockedEdges.add(`${cx}:${cy}-${pX}:${pY}`);
                }
            }
        });
    }
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Блокируем отверстия, занятые джамперами
    if (n.jumpers) {
        n.jumpers.forEach(j => {
            if (n.name !== netName) {
                blockedHoles.add(`${j.x1}:${j.y1}`);
                blockedHoles.add(`${j.x2}:${j.y2}`);
                // Ребро джампера (верхний слой) не блокирует нижний слой, 
                // но точки входа (holes) теперь заблокированы.
            }
        });
    }
});

// Блокируем чужие пины
data.components.forEach(c => {
    if (c.pins) c.pins.forEach(p => {
        if (!((p.x === x1 && p.y === y1) || (p.x === x2 && p.y === y2))) {
            // Если это не наша точка старта/финиша, и мы не знаем чей это пин - на всякий случай блокируем
            // (В идеале тут должна быть проверка связи пина с нетом)
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

        if (nx >= 1 && nx <= W && ny >= 1 && ny <= H) {
            const holeKey = `${nx}:${ny}`;
            const edgeKey = `${curr.x}:${curr.y}-${nx}:${ny}`;

            // 1. ПУТЬ ПО НИЗУ (Layer 0)
            // Можно двигаться по низу, только если и текущая, и следующая точки свободны (для перехода 1->0)
            // Но фактически curr.l === 0 уже гарантирует, что curr был свободен (или был стартом).
            if (!blockedHoles.has(holeKey) && !blockedEdges.has(edgeKey)) {
                // Если мы переходим с верха на низ, текущая точка ДОЛЖНА быть свободна
                if (curr.l === 0 || !blockedHoles.has(`${curr.x}:${curr.y}`)) {
                    queue.push({ x: nx, y: ny, l: 0, cost: curr.cost + 1, path: newPath });
                }
            }

            // 2. ПУТЬ ПО ВЕРХУ (Layer 1 - Jumper)
            // Перейти на верх можно только из свободной точки
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
if (!targetNet.jumpers) targetNet.jumpers = [];

for (let i = 1; i < bestPath.length; i++) {
    const p1 = bestPath[i-1];
    const p2 = bestPath[i];
    if (p2.l === 0) {
        targetNet.segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    } else {
        targetNet.jumpers.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
}

fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
console.log(`SUCCESS: Route added to '${netName}'. Jumper used: ${bestPath.some(p => p.l === 1)}`);

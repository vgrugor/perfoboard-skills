//Autorouter (A* Grid)
function autoroute(netlist, placement, routing, rules) {

    const width = placement.board.width
    const height = placement.board.height

    const grid = createGrid(width, height)

    markComponentObstacles(grid, placement, rules)
    markEscapeTracks(grid, routing)

    const finalRoutes = []

    for (const net of netlist.nets) {

        const netId = net.id || net.name
        const escapes = routing.routes.filter(r => r.net === netId)

        if (escapes.length < 2) continue

        const start = escapes[0].to
        const end = escapes[1].to

        const path = aStar(grid, start, end)

        if (path) {

            occupyPath(grid, path)

            finalRoutes.push({
                net: netId,
                path
            })

        }

    }

    routing.routes.push(...finalRoutes)

    return routing

}

if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.error('Usage: node autorouter.js <netlist_path> <placement_path> <routing_path> <rules_path>');
        process.exit(1);
    }

    const netlist = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const placement = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const routing = JSON.parse(fs.readFileSync(args[2], 'utf8'));
    const rules = JSON.parse(fs.readFileSync(args[3], 'utf8'));

    const updated = autoroute(netlist, placement, routing, rules);

    fs.writeFileSync(args[2], JSON.stringify(updated, null, 2));
    console.log(`Successfully completed autorouting at: ${args[2]}`);
}

module.exports = { autoroute };


//Создание grid
function createGrid(w, h) {

    const grid = []

    for (let y = 0; y < h; y++) {

        const row = []

        for (let x = 0; x < w; x++) {

            row.push({
                x,
                y,
                occupied: false
            })

        }

        grid.push(row)

    }

    return grid

}

//Пометить компоненты как препятствия
function markComponentObstacles(grid, placement, rules) {

    for (const comp of placement.components) {

        const size = rules.packages?.[comp.package] || { w: 2, h: 2 }

        for (let dx = 0; dx < size.w; dx++) {
            for (let dy = 0; dy < size.h; dy++) {

                const x = comp.x + dx
                const y = comp.y + dy

                if (grid[y] && grid[y][x]) {
                    grid[y][x].occupied = true
                }

            }
        }

    }

}

//Пометить escape дорожки
function markEscapeTracks(grid, routing) {

    for (const r of routing.routes) {

        if (r.type !== "escape") continue

        const { x, y } = r.to

        if (grid[y] && grid[y][x]) {
            grid[y][x].occupied = true
        }

    }

}

//A* поиск пути
function aStar(grid, start, end) {

    const open = []
    const visited = new Set()

    open.push({
        x: start.x,
        y: start.y,
        g: 0,
        f: heuristic(start, end),
        parent: null,
        dir: null
    })

    while (open.length) {

        open.sort((a, b) => a.f - b.f)

        const current = open.shift()

        if (current.x === end.x && current.y === end.y) {
            return reconstructPath(current)
        }

        visited.add(current.x + "," + current.y)

        for (const n of neighbors(current)) {

            const key = n.x + "," + n.y

            if (visited.has(key)) continue
            if (!grid[n.y] || !grid[n.y][n.x]) continue

            const cell = grid[n.y][n.x]

            let cost = 1

            if (cell.occupied) cost += 10000

            if (current.dir && n.dir !== current.dir) {
                cost += 2
            }

            const g = current.g + cost

            open.push({
                x: n.x,
                y: n.y,
                g,
                f: g + heuristic(n, end),
                parent: current,
                dir: n.dir
            })

        }

    }

    return null

}

//Соседи клетки
function neighbors(node) {

    return [
        { x: node.x + 1, y: node.y, dir: "R" },
        { x: node.x - 1, y: node.y, dir: "L" },
        { x: node.x, y: node.y + 1, dir: "D" },
        { x: node.x, y: node.y - 1, dir: "U" }
    ]

}

//Эвристика
function heuristic(a, b) {

    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

}

//Восстановление пути
function reconstructPath(node) {

    const path = []

    let current = node

    while (current) {

        path.push({
            x: current.x,
            y: current.y
        })

        current = current.parent

    }

    return path.reverse()

}

//Занять клетки трассой
function occupyPath(grid, path) {

    for (const p of path) {

        if (grid[p.y] && grid[p.y][p.x]) {
            grid[p.y][p.x].occupied = true
        }

    }

}


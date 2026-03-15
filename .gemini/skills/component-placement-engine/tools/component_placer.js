function placeComponents(netlist, placement, rules) {

    const result = []

    for (const segment of placement.segments) {

        const segId = segment.id
        const bbox = segment.bbox

        const components = netlist.components.filter(
            c => c.segment === segId
        )

        if (components.length === 0) continue

        // --- 1. построить граф связей

        const graph = {}

        for (const comp of components) {
            graph[comp.id] = new Set()
        }

        for (const net of netlist.nets) {

            const nodes = net.nodes || net.connections.map(c => `${c.component}.${c.pin}`)

            const comps = nodes
                .map(n => n.split(".")[0])
                .filter(c => graph[c])

            for (let i = 0; i < comps.length; i++) {
                for (let j = i + 1; j < comps.length; j++) {

                    graph[comps[i]].add(comps[j])
                    graph[comps[j]].add(comps[i])

                }
            }
        }

        // --- 2. найти начало цепочки

        let start = components[0].id

        for (const id in graph) {
            if (graph[id].size === 1) {
                start = id
                break
            }
        }

        // --- 3. построить топологический порядок

        const visited = new Set()
        const order = []

        function dfs(node) {

            if (visited.has(node)) return

            visited.add(node)
            order.push(node)

            for (const next of graph[node]) {
                dfs(next)
            }

        }

        dfs(start)

        // --- 4. линейный placement

        let cursorX = bbox.x1 + rules.clearance
        const centerY = Math.floor((bbox.y1 + bbox.y2) / 2)

        for (const compId of order) {

            const comp = components.find(c => c.id === compId)

            const pkg = rules.packages[comp.package] || { w: 2, h: 2 }

            const x = cursorX
            const y = centerY - Math.floor(pkg.h / 2)

            result.push({
                id: comp.id,
                segment: segId,
                x,
                y,
                rotation: 0
            })

            cursorX += pkg.w + rules.clearance

        }

    }

    const existingIds = new Set(result.map(c => c.id))
    placement.components = [
        ...(placement.components || []).filter(c => !existingIds.has(c.id)),
        ...result
    ]

    return placement

}

if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: node component_placer.js <netlist_path> <placement_path> <rules_path>');
        process.exit(1);
    }

    const netlist = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const placement = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const rules = JSON.parse(fs.readFileSync(args[2], 'utf8'));

    const updated = placeComponents(netlist, placement, rules);

    fs.writeFileSync(args[1], JSON.stringify(updated, null, 2));
    console.log(`Successfully updated component placement at: ${args[1]}`);
}

module.exports = { placeComponents };


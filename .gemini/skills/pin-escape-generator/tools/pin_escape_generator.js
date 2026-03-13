function generatePinEscapes(netlist, placement, rules) {

    const routes = []

    const compMap = {}
    for (const c of placement.components) {
        compMap[c.id] = c
    }

    for (const net of netlist.nets) {

        const nodes = net.nodes || net.connections.map(c => `${c.component}.${c.pin}`)

        for (const node of nodes) {

            const [compId, pinId] = node.split(".")

            const compPlacement = compMap[compId]
            if (!compPlacement) continue

            const compDef = netlist.components.find(c => c.id === compId)
            if (!compDef) continue

            const pkg = rules.packages[compDef.package]
            if (!pkg) continue

            const pin = pkg.pins[pinId]
            if (!pin) continue

            // --- абсолютная позиция пина

            const pinX = compPlacement.x + pin.x
            const pinY = compPlacement.y + pin.y

            // --- определить направление выхода

            let dx = 0
            let dy = 0

            if (Math.abs(pin.x) > Math.abs(pin.y)) {
                dx = Math.sign(pin.x)
            } else {
                dy = Math.sign(pin.y)
            }

            const escapeLength = rules.escape_length || 2

            const escapeX = pinX + dx * escapeLength
            const escapeY = pinY + dy * escapeLength

            const netId = net.id || net.name

            routes.push({
                type: "escape",
                net: netId,
                from: {
                    component: compId,
                    pin: pinId,
                    x: pinX,
                    y: pinY
                },
                to: {
                    x: escapeX,
                    y: escapeY
                },
                path: [
                    { x: pinX, y: pinY },
                    { x: escapeX, y: escapeY }
                ]
            })

        }

    }

    return {
        routes
    }

}

if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.error('Usage: node pin_escape_generator.js <netlist_path> <placement_path> <rules_path> <output_path>');
        process.exit(1);
    }

    const netlist = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const placement = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const rules = JSON.parse(fs.readFileSync(args[2], 'utf8'));

    const routing = generatePinEscapes(netlist, placement, rules);

    const outDir = path.dirname(args[3]);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(args[3], JSON.stringify(routing, null, 2));
    console.log(`Successfully generated pin escapes at: ${args[3]}`);
}

module.exports = { generatePinEscapes };


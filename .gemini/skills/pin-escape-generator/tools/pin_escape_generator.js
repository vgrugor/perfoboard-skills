function generatePinEscapes(netlist, placement, rules) {

    const routes = []

    const compMap = {}
    for (const c of placement.components) {
        compMap[c.id] = c
    }

    for (const net of netlist.nets) {

        for (const node of net.nodes) {

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

            routes.push({
                type: "escape",
                net: net.id,
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

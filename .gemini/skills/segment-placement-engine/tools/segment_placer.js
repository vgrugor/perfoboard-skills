function placeSegments(board, zones, segments) {

    const padding = 1

    // --- 1. вычисляем высоту зон

    const zoneHeight = Math.floor(board.height / zones.length)

    const zoneMap = {}

    zones.forEach((zone, i) => {

        const yStart = i * zoneHeight
        const yEnd = (i + 1) * zoneHeight

        zoneMap[zone.id] = {
            x1: 0,
            x2: board.width,
            y1: yStart,
            y2: yEnd,
            cursorX: padding,
            cursorY: yStart + padding,
            rowHeight: 0
        }

    })

    const result = []

    // --- 2. сортируем сегменты по zone_level

    segments.sort((a, b) => a.zone_level - b.zone_level)

    // --- 3. размещаем сегменты

    for (const seg of segments) {

        const zone = zoneMap[seg.zone_assignment]

        if (!zone) {
            throw new Error(`Zone not found: ${seg.zone_assignment}`)
        }

        // --- оценка размера сегмента

        const comp = seg.components || 1

        const width = Math.ceil(Math.sqrt(comp)) + 2
        const height = Math.ceil(Math.sqrt(comp)) + 2

        // --- перенос строки если не помещается

        if (zone.cursorX + width > zone.x2) {

            zone.cursorX = padding
            zone.cursorY += zone.rowHeight + padding
            zone.rowHeight = 0

        }

        // --- проверка выхода за зону

        if (zone.cursorY + height > zone.y2) {

            throw new Error(
                `Zone overflow: ${seg.id} does not fit in ${seg.zone_assignment}`
            )

        }

        const bbox = {
            x1: zone.cursorX,
            y1: zone.cursorY,
            x2: zone.cursorX + width,
            y2: zone.cursorY + height
        }

        result.push({
            id: seg.id,
            zone: seg.zone_assignment,
            origin: {
                x: zone.cursorX,
                y: zone.cursorY
            },
            bbox
        })

        zone.cursorX += width + padding
        zone.rowHeight = Math.max(zone.rowHeight, height)

    }

    return result

}

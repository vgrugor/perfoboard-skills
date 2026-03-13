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

    // --- 2. сортируем сегменты по level

    segments.sort((a, b) => a.level - b.level)

    // --- 3. размещаем сегменты

    for (const seg of segments) {

        const zone = zoneMap[seg.zone]

        if (!zone) {
            throw new Error(`Zone not found: ${seg.zone}`)
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
                `Zone overflow: ${seg.id} does not fit in ${seg.zone}`
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
            zone: seg.zone,
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

if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node segment_placer.js <placement_json_path>');
        process.exit(1);
    }

    const filePath = path.resolve(args[0]);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const placement = placeSegments(data.board, data.zones, data.segments);
    
    // Обновляем сегменты в исходных данных
    data.segments = placement;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Successfully updated placement at: ${filePath}`);
}

module.exports = { placeSegments };


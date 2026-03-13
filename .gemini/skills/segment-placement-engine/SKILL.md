---
name: "segment-placement-engine"
description: "Размещает целые сегменты, а не компоненты. Использовать после создания зон и этажей на плате для определения их координат"
---

#

## Что делает

принимать твои данные сегментов, зон и этажей в них
разбивать плату на координатные области зон и этажей в них
размещать сегменты внутри зон и этажей
учитывать этаж зоны - level
возвращать origin и bounding box сегмента

## Ожидаемый вход

Скрипт ожидает структуру примерно такого вида как в файле assets/input_example.js

## Использование

Файл скрипта tools/segment_placer.js

Запустить напрямую из CLI:
```bash
node .gemini/skills/segment-placement-engine/tools/segment_placer.js placement/Net_1.json
```

Программный вызов:
const { placeSegments } = require("./tools/segment_placer.js")
const placement = placeSegments(board, zones, segments)

## Пример результата

[
  {
    "id": "power_input",
    "zone": "zone_1",
    "origin": { "x": 1, "y": 1 },
    "bbox": { "x1": 1, "y1": 1, "x2": 5, "y2": 5 }
  },
  {
    "id": "driver_1",
    "zone": "zone_2",
    "origin": { "x": 1, "y": 8 },
    "bbox": { "x1": 1, "y1": 8, "x2": 4, "y2": 11 }
  }
]

## Обновить файл в папке placement, добавив свойства размещения сегментов origin и bbox для каждого сегмента по его id

Результат должен быть примерно таким:
{
  "board": {
    "width": 30,
    "height": 20
  },
  "zones": [
    {
      "id": "zone_1",
      "type": "left",
      "priority": 2,
      "capacity": "medium"
    },
    {
      "id": "zone_2",
      "type": "under_component",
      "priority": 1,
      "capacity": "small"
    },
    {
      "id": "zone_3",
      "type": "right",
      "priority": 2,
      "capacity": "medium"
    }
  ],
  "segments": [
    {
      "id": "mcu_block",
      "zone": "zone_1",
      "level": 1,
      "origin": { "x": 1, "y": 1 },
      "bbox": { "x1": 1, "y1": 1, "x2": 5, "y2": 5 }
    },
    {
      "id": "buzzer_driver_1",
      "zone": "zone_2",
      "level": 1,
      "origin": { "x": 1, "y": 8 },
      "bbox": { "x1": 1, "y1": 8, "x2": 4, "y2": 11 }
    },
    {
      "id": "buzzer_driver_2",
      "zone": "zone_2",
      "level": 2,
      "origin": { "x": 1, "y": 8 },
      "bbox": { "x1": 1, "y1": 8, "x2": 4, "y2": 11 }
    }
  ]
}

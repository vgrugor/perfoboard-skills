---
name: "pin-escape-generator"
description: "Генерирует пин-эскейпы для компонентов. Для каждого пина создает выход из плотной зоны пинов. Задача уменьшить блокировки, пересечения, тупики маршрутов для будущего автотрейсинга"
---

#

## Что делает

Для каждого пина компонента создаёт короткий “escape” сегмент наружу, резервируя дорожку, чтобы дальше autorouter мог работать в свободном пространстве

## Что использует

component.x
component.y
rotation
package
pin positions

## Выход (в новый файл):

Создает новый файл в папке routing с именем подобным routing_1.json

## Ожидаемые данные rules.json

Pin positions — относительно центра корпуса.
{
  "grid": 1,
  "escape_length": 2,
  "packages": {
    "QFN": {
      "w": 4,
      "h": 4,
      "pins": {
        "1": { "x": -2, "y": -1 },
        "2": { "x": -2, "y": 0 },
        "3": { "x": -2, "y": 1 }
      }
    }
  }
}

## Использование

Файл скрипта tools/pin_escape_generator.js

Запустить напрямую из CLI:
```bash
node .gemini/skills/pin-escape-generator/tools/pin_escape_generator.js nets/Net_1.json placement/Net_1.json tools/rules.json routing/Net_1.json
```

Программный вызов:
const { generatePinEscapes } = require("./tools/pin_escape_generator.js")
const routing = generatePinEscapes(netlist, placement, rules)

## Пример результата routing.json

{
  "routes": [
    {
      "type": "escape",
      "net": "n1",
      "from": {
        "component": "U1",
        "pin": "1",
        "x": 10,
        "y": 8
      },
      "to": {
        "x": 12,
        "y": 8
      },
      "path": [
        { "x": 10, "y": 8 },
        { "x": 12, "y": 8 }
      ]
    }
  ]
}


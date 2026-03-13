---
name: "component-placement-engine"
description: "Размещает компоненты в сегментах"
---

#

## Что делает

читает netlist (компоненты + nets + сегменты) из файла в папке nets
читает placement (где уже есть bbox сегментов) из файла в папке placement
определяет топологию сегмента
строит линейный placement внутри bbox
учитывает размер корпуса и clearance
записывает результат в placement.components.

## Ожидаемые входные данные

Берет информацию о components, nets из netlist из папки nets
Берет информацию о размещении segments из placement из папки placement
Размеры корпусов находит в паке ./gemini/rules по названию корпуса и имени файла

## Использование

Запустить скрипт в tools/component_placer.js

Пример использования
const netlist = load("netlist.json")
const placement = load("placement.json")
const rules = load("rules.json")

const updated = placeComponents(netlist, placement, rules)

save("placement.json", updated)

## Пример результата

{
  "components": [
    {
      "id": "R1",
      "segment": "driver_1",
      "x": 9,
      "y": 8,
      "rotation": 0
    },
    {
      "id": "Q1",
      "segment": "driver_1",
      "x": 11,
      "y": 8,
      "rotation": 0
    },
    {
      "id": "BZ1",
      "segment": "driver_1",
      "x": 14,
      "y": 7,
      "rotation": 0
    }
  ]
}

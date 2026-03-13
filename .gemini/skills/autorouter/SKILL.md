---
name: "autorouter"
description: "Прокладывает маршруты между пин-эскейпами. Этот этап использует результат предыдущего шага (из папки routing с escape-точками)."
---

#

## Что делает

строит grid по размеру платы
учитывает занятые клетки (компоненты и escape-дорожки)
для каждой сети маршрутизирует путь A* между точками

штрафует:
занятые клетки
повороты
длину

## Входные данные

Данные из папки routing (escape-точки)
{
  "routes": [
    {
      "type": "escape",
      "net": "n1",
      "from": { "x": 10, "y": 8 },
      "to": { "x": 12, "y": 8 }
    }
  ]
}

Данные из папки placement (компоненты и их bbox)
Нужны координаты компонентов и размеры платы.
{
  "board": { "width": 30, "height": 20 },
  "components": [
    { "id": "R1", "x": 10, "y": 8 },
    { "id": "Q1", "x": 13, "y": 8 }
  ]
}

Данные из папки netlist (сети)
{
  "nets": [
    { "id": "n1", "nodes": ["R1.1", "Q1.1"] }
  ]
}

## Использование

Файл скрипта tools/autorouter.js

Запустить подобным образом:

const netlist = load("netlist.json")
const placement = load("placement.json")
const routing = load("routing.json")
const rules = load("rules.json")

const updated = autoroute(netlist, placement, routing, rules)

save("routing.json", updated)
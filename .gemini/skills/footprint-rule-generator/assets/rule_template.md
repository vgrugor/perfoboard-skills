---
description: "Когда в задаче встречаются компоненты в корпусе {{PACKAGE_NAME}} на perfboard, используй это правило для допустимого footprint и ориентации."
alwaysApply: false
---

# Правила размещения: {{PACKAGE_NAME}} ({{MOUNTING_TYPE}})

## Соответствие имён корпуса

Считать этим типом корпуса всё, что пользователь обозначает как:
- {{NAME_VARIANTS}}

## Геометрия perfboard (предпосылка)

- Сетка отверстий 2.54 мм, координаты целочисленные (x,y)
- Каждый вывод занимает ровно одно отверстие

## Footprint (по умолчанию)

{{FOOTPRINT_DESCRIPTION}}

## Нумерация выводов (по умолчанию)

{{PIN_NUMBERING_DESCRIPTION}}

## Занимаемые отверстия

- pinHoles: {{PIN_HOLES_LOGIC}}
- bodyKeepout: {{KEEPOUT_LOGIC}}

## Допуски и изгиб выводов

{{TOLERANCE_DESCRIPTION}}

## Рекомендации для оптимизации площади

{{OPTIMIZATION_RECOMMENDATIONS}}

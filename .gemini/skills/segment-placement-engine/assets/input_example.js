const board = {
  width: 30,
  height: 20
}

const zones = [
  { id: "zone_1" },
  { id: "zone_2" },
  { id: "zone_3" }
]

const segments = [
  {
    id: "power_input",
    zone: "zone_1",
    level: 0,
  },
  {
    id: "driver_1",
    zone: "zone_2",
    level: 1,
  },
  {
    id: "logic",
    zone: "zone_3",
    level: 2,
  }
]

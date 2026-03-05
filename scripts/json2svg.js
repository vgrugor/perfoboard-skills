const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.json', '.svg');

if (!inputFile) {
  console.error("Usage: node json2svg.js <input.json> [output.svg]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const CELL = 20;
const MARGIN = 20;
const BOARD_W = data.board.width;
const BOARD_H = data.board.height;

const WIDTH = BOARD_W * CELL + MARGIN * 2;
const HEIGHT = BOARD_H * CELL + MARGIN * 2;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" style="background: white; font-family: sans-serif;">
  <defs>
    <style>
      .grid { stroke: #eee; stroke-width: 1; }
      .pin { fill: #1976d2; }
      .trace { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; opacity: 0.7; }
      .comp-body { fill: rgba(100, 100, 100, 0.1); stroke: #666; stroke-width: 1; }
      .text { font-size: 10px; fill: #333; text-anchor: middle; dominant-baseline: middle; }
      .pin-label { font-size: 8px; fill: #666; }
    </style>
  </defs>
`;

// Grid
for (let x = 0; x <= BOARD_W; x++) {
  const px = MARGIN + x * CELL;
  svg += `<line x1="${px}" y1="${MARGIN}" x2="${px}" y2="${HEIGHT-MARGIN}" class="grid" />`;
}
for (let y = 0; y <= BOARD_H; y++) {
  const py = MARGIN + y * CELL;
  svg += `<line x1="${MARGIN}" y1="${py}" x2="${WIDTH-MARGIN}" y2="${py}" class="grid" />`;
}

// Helper: Grid to Pixel
const g2p = (g) => MARGIN + (g - 1) * CELL + CELL / 2;
// Helper: Rect from coords
const drawRect = (x1, y1, x2, y2, cls) => {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) + 1;
    const h = Math.abs(y2 - y1) + 1;
    
    // Convert to pixels (rect covers full cells)
    const px = MARGIN + (rx - 1) * CELL;
    const py = MARGIN + (ry - 1) * CELL;
    const pw = w * CELL;
    const ph = h * CELL;
    
    return `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" class="${cls}" />`;
};

// Components
if (data.components) {
  data.components.forEach(c => {
    // Body
    if (c.body) {
      svg += drawRect(c.body.x1, c.body.y1, c.body.x2, c.body.y2, "comp-body");
    }
    
    // Label
    let cx = 0, cy = 0;
    if (c.body) {
        cx = MARGIN + (c.body.x1 + c.body.x2 - 2) * CELL / 2 + CELL;
        cy = MARGIN + (c.body.y1 + c.body.y2 - 2) * CELL / 2 + CELL;
    } else if (c.pins && c.pins.length > 0) {
        // Average pin pos
        const xs = c.pins.map(p => p.x);
        const ys = c.pins.map(p => p.y);
        cx = MARGIN + (Math.min(...xs) + Math.max(...xs) - 2) * CELL / 2 + CELL;
        cy = MARGIN + (Math.min(...ys) + Math.max(...ys) - 2) * CELL / 2 + CELL;
    }
    if (cx) {
        svg += `<text x="${cx}" y="${cy}" class="text" style="font-weight: bold;">${c.ref}</text>`;
    }

    // Pins
    if (c.pins) {
      c.pins.forEach(p => {
        const px = g2p(p.x);
        const py = g2p(p.y);
        svg += `<circle cx="${px}" cy="${py}" r="4" class="pin" />`;
        // Pin name
        // svg += `<text x="${px+6}" y="${py-6}" class="pin-label">${p.name}</text>`; 
      });
    }
  });
}

// Nets
const colors = ["#e91e63", "#9c27b0", "#2196f3", "#00bcd4", "#4caf50", "#ff9800", "#795548"];
if (data.nets) {
  data.nets.forEach((n, i) => {
    const color = colors[i % colors.length];
    if (n.segments) {
      let d = "";
      n.segments.forEach(s => {
        d += `M ${g2p(s.x1)} ${g2p(s.y1)} L ${g2p(s.x2)} ${g2p(s.y2)} `;
      });
      svg += `<path d="${d}" class="trace" stroke="${color}" />`;
    }
  });
}

svg += `</svg>`;

fs.writeFileSync(outputFile, svg);
console.log(`SVG generated: ${outputFile}`);

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("file");
const fitBtn = document.getElementById("fit");
const showKeepout = document.getElementById("showKeepout");
const showLabels = document.getElementById("showLabels");
const showBody = document.getElementById("showBody");

let data = null;
let cell = 20;
let margin = 20;
let scaleFit = true;
let colorCache = new Map();

fileInput.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      data = JSON.parse(r.result);
      colorCache = new Map();
      draw();
    } catch (err) {
      alert("Ошибка JSON: " + err.message);
    }
  };
  r.readAsText(f);
});

fitBtn.addEventListener("click", () => {
  scaleFit = true;
  draw();
});
showKeepout.addEventListener("change", draw);
showLabels.addEventListener("change", draw);
showBody.addEventListener("change", draw);

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!data || !data.board) return;
  const w = Number(data.board.width) || 0;
  const h = Number(data.board.height) || 0;
  if (w <= 0 || h <= 0) return;
  const availW = canvas.width - 2 * margin;
  const availH = canvas.height - 2 * margin;
  if (scaleFit) {
    cell = Math.floor(Math.min(availW / w, availH / h));
    cell = Math.max(8, cell);
  }
  const startX = (canvas.width - cell * w) / 2;
  const startY = (canvas.height - cell * h) / 2;
  drawGrid(startX, startY, w, h);
  if (Array.isArray(data.components)) drawComponents(startX, startY);
  if (Array.isArray(data.nets)) drawNets(startX, startY);
}

function drawGrid(startX, startY, w, h) {
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let y = 0; y <= h; y++) {
    const ypx = startY + y * cell;
    ctx.beginPath();
    ctx.moveTo(startX, ypx);
    ctx.lineTo(startX + w * cell, ypx);
    ctx.stroke();
  }
  for (let x = 0; x <= w; x++) {
    const xpx = startX + x * cell;
    ctx.beginPath();
    ctx.moveTo(xpx, startY);
    ctx.lineTo(xpx, startY + h * cell);
    ctx.stroke();
  }
}

function holeX(startX, x) {
  return startX + (x - 1) * cell;
}
function holeY(startY, y) {
  return startY + (y - 1) * cell;
}

function drawComponents(startX, startY) {
  for (const c of data.components) {
    if (showBody.checked) {
      if (c.body && Number.isFinite(c.body.x1)) {
        const colors = bodyColors(c);
        const bx1 = holeX(startX, c.body.x1) + cell / 2;
        const by1 = holeY(startY, c.body.y1) + cell / 2;
        const bx2 = holeX(startX, c.body.x2) + cell / 2;
        const by2 = holeY(startY, c.body.y2) + cell / 2;
        const rx = Math.min(bx1, bx2) - cell / 2;
        const ry = Math.min(by1, by2) - cell / 2;
        const rw = Math.abs(bx2 - bx1) + cell;
        const rh = Math.abs(by2 - by1) + cell;
        ctx.fillStyle = colors.fill;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rw, rh);
      } else {
        let hasBox = false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (Array.isArray(c.keepout) && c.keepout.length) {
          for (const k of c.keepout) {
            minX = Math.min(minX, k.x1, k.x2);
            minY = Math.min(minY, k.y1, k.y2);
            maxX = Math.max(maxX, k.x1, k.x2);
            maxY = Math.max(maxY, k.y1, k.y2);
            hasBox = true;
          }
        }
        if (!hasBox && Array.isArray(c.pins) && c.pins.length) {
          for (const p of c.pins) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          hasBox = true;
        }
        if (hasBox && Number.isFinite(minX) && Number.isFinite(minY)) {
          const colors = bodyColors(c);
          const bx1 = holeX(startX, minX) + cell / 2;
          const by1 = holeY(startY, minY) + cell / 2;
          const bx2 = holeX(startX, maxX) + cell / 2;
          const by2 = holeY(startY, maxY) + cell / 2;
          const rx = Math.min(bx1, bx2) - cell / 2;
          const ry = Math.min(by1, by2) - cell / 2;
          const rw = Math.abs(bx2 - bx1) + cell;
          const rh = Math.abs(by2 - by1) + cell;
          ctx.fillStyle = colors.fillLight;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, rw, rh);
        }
      }
    }
    if (c.keepout && showKeepout.checked) {
      ctx.fillStyle = "rgba(255,165,0,0.2)";
      for (const k of c.keepout) {
        const x1 = holeX(startX, k.x1) + cell / 2;
        const y1 = holeY(startY, k.y1) + cell / 2;
        const x2 = holeX(startX, k.x2) + cell / 2;
        const y2 = holeY(startY, k.y2) + cell / 2;
        const rx = Math.min(x1, x2) - cell / 2;
        const ry = Math.min(y1, y2) - cell / 2;
        const rw = Math.abs(x2 - x1) + cell;
        const rh = Math.abs(y2 - y1) + cell;
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
    if (Array.isArray(c.pins)) {
      const xs = c.pins.map(p => p.x);
      const ys = c.pins.map(p => p.y);
      const allSameX = xs.every(x => x === xs[0]);
      const allSameY = ys.every(y => y === ys[0]);
      const sortedX = [...xs].sort((a,b)=>a-b);
      const sortedY = [...ys].sort((a,b)=>a-b);
      const consecX = sortedX.every((v,i,arr)=> i===0 || v-arr[i-1]===1);
      const consecY = sortedY.every((v,i,arr)=> i===0 || v-arr[i-1]===1);
      const linearRow = allSameY && consecX;
      const linearCol = allSameX && consecY;
      for (const p of c.pins) {
        const x = holeX(startX, p.x) + cell / 2;
        const y = holeY(startY, p.y) + cell / 2;
        ctx.fillStyle = "#1976d2";
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, cell * 0.25), 0, Math.PI * 2);
        ctx.fill();
        if (showLabels.checked) {
          ctx.fillStyle = "#000";
          ctx.font = Math.max(10, Math.floor(cell * 0.5)) + "px system-ui";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          const label = (linearRow || linearCol) ? String(p.name || "") : (String(c.ref || "") + ":" + String(p.name || ""));
          ctx.fillText(label, x + 4, y + 4);
        }
      }
      if (showLabels.checked && (linearRow || linearCol)) {
        let minX, minY, maxX, maxY;
        if (c.body && Number.isFinite(c.body.x1)) {
          minX = Math.min(c.body.x1, c.body.x2);
          minY = Math.min(c.body.y1, c.body.y2);
          maxX = Math.max(c.body.x1, c.body.x2);
          maxY = Math.max(c.body.y1, c.body.y2);
        } else if (Array.isArray(c.keepout) && c.keepout.length) {
          minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
          for (const k of c.keepout) {
            minX = Math.min(minX, k.x1, k.x2);
            minY = Math.min(minY, k.y1, k.y2);
            maxX = Math.max(maxX, k.x1, k.x2);
            maxY = Math.max(maxY, k.y1, k.y2);
          }
        } else {
          minX = Math.min(...xs); maxX = Math.max(...xs);
          minY = Math.min(...ys); maxY = Math.max(...ys);
        }
        const bx1 = holeX(startX, minX) + cell / 2;
        const by1 = holeY(startY, minY) + cell / 2;
        const bx2 = holeX(startX, maxX) + cell / 2;
        const by2 = holeY(startY, maxY) + cell / 2;
        const rx = Math.min(bx1, bx2) - cell / 2;
        const ry = Math.min(by1, by2) - cell / 2;
        const rw = Math.abs(bx2 - bx1) + cell;
        const rh = Math.abs(by2 - by1) + cell;
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        ctx.fillStyle = "#000";
        ctx.font = Math.max(10, Math.floor(cell * 0.6)) + "px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.ref || ""), cx, cy);
      }
    }
  }
}

function bodyColors(c){
  const key = String(c.ref||Math.random());
  if (colorCache.has(key)) return colorCache.get(key);
  const hue = Math.floor(Math.random()*360);
  const colors = {
    fill: `hsla(${hue},65%,55%,0.25)`,
    fillLight: `hsla(${hue},65%,55%,0.12)`,
    stroke: `hsla(${hue},65%,40%,0.85)`
  };
  colorCache.set(key, colors);
  return colors;
}

function drawNets(startX, startY) {
  ctx.strokeStyle = "#e91e63";
  ctx.lineWidth = Math.max(1, Math.floor(cell * 0.15));
  for (const n of data.nets) {
    if (!Array.isArray(n.segments)) continue;
    for (const s of n.segments) {
      const x1 = holeX(startX, s.x1) + cell / 2;
      const y1 = holeY(startY, s.y1) + cell / 2;
      const x2 = holeX(startX, s.x2) + cell / 2;
      const y2 = holeY(startY, s.y2) + cell / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}

window.addEventListener("resize", () => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width);
  canvas.height = Math.floor(window.innerHeight - rect.top);
  draw();
});

(function init() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width);
  canvas.height = Math.floor(window.innerHeight - rect.top);
  draw();
})();

const fs = require('fs');
const { execSync } = require('child_process');

const inputFile = process.argv[2];
if (!inputFile) {
    console.error("Usage: node compress_layout.js <layout.json>");
    process.exit(1);
}

function loadData() {
    return JSON.parse(fs.readFileSync(inputFile, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(inputFile, JSON.stringify(data, null, 2));
}

function getScore() {
    try {
        const output = execSync(`node .gemini/skills/perfoboard-layout-optimizer/tools/score_layout.js ${inputFile}`).toString();
        const scoreMatch = output.match(/TOTAL SCORE: ([\d.]+)/);
        const scMatch = output.match(/Short Circuits: (\d+)/);
        return {
            total: scoreMatch ? parseFloat(scoreMatch[1]) : Infinity,
            shortCircuits: scMatch ? parseInt(scMatch[1]) : Infinity
        };
    } catch (e) {
        return { total: Infinity, shortCircuits: Infinity };
    }
}

function getAnchor(data) {
    let anchor = null;
    let maxPins = -1;
    data.components.forEach(c => {
        if (c.pins.length > maxPins) {
            maxPins = c.pins.length;
            anchor = c;
        }
    });
    return anchor;
}

function getCenter(component) {
    let sx = 0, sy = 0;
    component.pins.forEach(p => { sx += p.x; sy += p.y; });
    return { x: sx / component.pins.length, y: sy / component.pins.length };
}

function moveComponent(data, ref, dx, dy) {
    const c = data.components.find(x => x.ref === ref);
    c.pins.forEach(p => { p.x += dx; p.y += dy; });
    if (c.body) { c.body.x1 += dx; c.body.x2 += dx; c.body.y1 += dy; c.body.y2 += dy; }
    if (c.keepout) c.keepout.forEach(k => { k.x1 += dx; k.x2 += dx; k.y1 += dy; k.y2 += dy; });
}

function rotateComponent(data, ref) {
    const c = data.components.find(x => x.ref === ref);
    const center = getCenter(c);
    // Rotate 90 degrees around center (integer grid)
    c.pins.forEach(p => {
        const relX = p.x - Math.round(center.x);
        const relY = p.y - Math.round(center.y);
        p.x = Math.round(center.x) - relY;
        p.y = Math.round(center.y) + relX;
    });
    // Simplified: we also need to update body/keepout if they exist
    // For now, let's just rotate pins and see if it works. 
    // In a real project, body/keepout rotation is more complex (needs swap width/height).
}

function clearNetsForComponent(data, ref) {
    const pins = data.components.find(c => c.ref === ref).pins.map(p => `${ref}:${p.name}`);
    data.nets.forEach(n => {
        // This is tricky: we only want to clear segments connected to this component
        // But auto_route usually rebuilds the whole net. 
        // For simplicity: clear all segments of nets that touch this component.
        const touches = data.netlist && Object.entries(data.netlist).some(([name, pList]) => 
            name === n.name && pList.some(p => pins.includes(p))
        );
        if (touches) {
            n.segments = [];
            n.jumpers = [];
        }
    });
}

function routeAll(data) {
    saveData(data);
    if (!data.netlist) return;
    for (const [netName, pins] of Object.entries(data.netlist)) {
        for (let i = 0; i < pins.length - 1; i++) {
            const p1 = pins[i];
            const p2 = pins[i+1];
            const c1 = data.components.find(c => c.pins.some(p => `${c.ref}:${p.name}` === p1));
            const c2 = data.components.find(c => c.pins.some(p => `${c.ref}:${p.name}` === p2));
            const pin1 = c1.pins.find(p => `${c1.ref}:${p.name}` === p1);
            const pin2 = c2.pins.find(p => `${c2.ref}:${p.name}` === p2);
            try {
                execSync(`node .gemini/skills/perfoboard-layout-optimizer/tools/auto_route.js ${inputFile} "${netName}" ${pin1.x} ${pin1.y} ${pin2.x} ${pin2.y}`, { stdio: 'ignore' });
            } catch (e) {
                // Ignore route errors, score will handle it
            }
        }
    }
}

async function compress() {
    let data = loadData();
    const anchor = getAnchor(data);
    const aCenter = getCenter(anchor);
    
    console.log(`Anchor identified: ${anchor.ref} at (${aCenter.x.toFixed(1)}, ${aCenter.y.toFixed(1)})`);

    // Phase 1: Wide Placement
    data.components.forEach(c => {
        if (c.ref === anchor.ref) return;
        const cCenter = getCenter(c);
        const dx = Math.sign(cCenter.x - aCenter.x) * 4;
        const dy = Math.sign(cCenter.y - aCenter.y) * 4;
        moveComponent(data, c.ref, dx, dy);
    });
    
    console.log("Phase 1: Wide placement done.");
    routeAll(data);
    let currentBest = getScore();
    console.log(`Initial Score: ${currentBest.total}`);

    let improved = true;
    let iteration = 0;
    while (improved && iteration < 50) {
        improved = false;
        iteration++;
        console.log(`Iteration ${iteration}...`);

        // Sort components by distance to anchor (furthest first)
        const sorted = data.components
            .filter(c => c.ref !== anchor.ref)
            .sort((a, b) => {
                const distA = Math.hypot(getCenter(a).x - aCenter.x, getCenter(a).y - aCenter.y);
                const distB = Math.hypot(getCenter(b).x - aCenter.x, getCenter(b).y - aCenter.y);
                return distB - distA;
            });

        for (const c of sorted) {
            const cCenter = getCenter(c);
            const dx = Math.sign(aCenter.x - cCenter.x);
            const dy = Math.sign(aCenter.y - cCenter.y);

            const attempts = [
                {dx, dy: 0}, {dx: 0, dy}, {dx, dy}
            ];

            for (const att of attempts) {
                if (att.dx === 0 && att.dy === 0) continue;
                
                const snapshot = JSON.parse(JSON.stringify(data));
                moveComponent(data, c.ref, att.dx, att.dy);
                
                // Clear and Reroute
                data.nets.forEach(n => { n.segments = []; n.jumpers = []; }); // Simple: clear all and reroute
                routeAll(data);
                
                const newScore = getScore();
                if (newScore.shortCircuits === 0 && newScore.total < currentBest.total) {
                    currentBest = newScore;
                    improved = true;
                    console.log(`  Moved ${c.ref} -> Score: ${currentBest.total}`);
                    break; 
                } else {
                    data = snapshot; // Rollback
                    saveData(data);
                }
            }
        }
    }
    console.log("Compression finished.");
}

compress();

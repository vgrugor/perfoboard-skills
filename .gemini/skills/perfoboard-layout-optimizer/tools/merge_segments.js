const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error("Usage: node merge_segments.js <file.json>"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function merge(arr) {
    if (!arr || arr.length <= 1) return arr;
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                const s1 = arr[i];
                const s2 = arr[j];
                
                // Check if they share a point and are collinear
                let canMerge = false;
                let newS = null;

                // Case 1: Horizontal
                if (s1.y1 === s1.y2 && s2.y1 === s2.y2 && s1.y1 === s2.y1) {
                    const min1 = Math.min(s1.x1, s1.x2);
                    const max1 = Math.max(s1.x1, s1.x2);
                    const min2 = Math.min(s2.x1, s2.x2);
                    const max2 = Math.max(s2.x1, s2.x2);
                    if (max1 >= min2 && max2 >= min1) { // Overlap or touch
                        canMerge = true;
                        newS = { x1: Math.min(min1, min2), y1: s1.y1, x2: Math.max(max1, max2), y2: s1.y1 };
                    }
                }
                // Case 2: Vertical
                else if (s1.x1 === s1.x2 && s2.x1 === s2.x2 && s1.x1 === s2.x1) {
                    const min1 = Math.min(s1.y1, s1.y2);
                    const max1 = Math.max(s1.y1, s1.y2);
                    const min2 = Math.min(s2.y1, s2.y2);
                    const max2 = Math.max(s2.y1, s2.y2);
                    if (max1 >= min2 && max2 >= min1) { // Overlap or touch
                        canMerge = true;
                        newS = { x1: s1.x1, y1: Math.min(min1, min2), x2: s1.x1, y2: Math.max(max1, max2) };
                    }
                }

                if (canMerge) {
                    arr.splice(j, 1);
                    arr.splice(i, 1, newS);
                    merged = true;
                    break;
                }
            }
            if (merged) break;
        }
    }
    return arr;
}

data.nets.forEach(n => {
    n.segments = merge(n.segments || []);
    n.jumpers = merge(n.jumpers || []);
});

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Segments and jumpers merged successfully.");

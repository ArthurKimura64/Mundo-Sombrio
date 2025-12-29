const fs = require('fs');
const path = require('path');

const mapFile = path.join(__dirname, '..', 'js', 'mapData.js');
const connFile = path.join(__dirname, '..', 'data', 'connections.json');

const mapText = fs.readFileSync(mapFile, 'utf8');

// Regex mais flexível para extrair tiles
const idRegex = /id:\s*(\d+)/g;
const pathRegex = /pathId:\s*['"]([^'"]+)['"]/g;

// Encontrar todos os tiles
const tiles = [];
const tileBlockRegex = /\{\s*id:\s*(\d+)[^}]*pathId:\s*['"]([^'"]+)['"]/g;
let match;

while ((match = tileBlockRegex.exec(mapText)) !== null) {
    tiles.push({
        id: Number(match[1]),
        pathId: match[2]
    });
}

const idToPath = {};
const pathToId = {};
tiles.forEach(t => {
    idToPath[t.id] = t.pathId;
    pathToId[t.pathId] = t.id;
});

console.log(`Encontrados ${tiles.length} tiles`);

if (Object.keys(idToPath).length === 0) {
    console.error('Não foi possível extrair tiles de mapData.js');
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(connFile, 'utf8'));
const newObj = {};

for (const key of Object.keys(raw)) {
    const k = Number(key);
    let newKey;
    if (!Number.isNaN(k)) {
        newKey = idToPath[k];
    } else {
        newKey = key;
    }
    if (!newKey) {
        console.warn('Chave não encontrada no mapa:', key);
        continue;
    }
    newObj[newKey] = raw[key].map(v => {
        const vn = Number(v);
        if (!Number.isNaN(vn)) return idToPath[vn] || v;
        return v;
    });
}

fs.writeFileSync(connFile, JSON.stringify(newObj, null, 4), 'utf8');
console.log('✅ connections.json convertido para usar pathIds como chaves.');

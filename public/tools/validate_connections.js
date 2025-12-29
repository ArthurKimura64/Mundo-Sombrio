const fs = require('fs');
const path = require('path');

const mapFile = path.join(__dirname, '..', 'js', 'mapData.js');
const connFile = path.join(__dirname, '..', 'data', 'connections.json');

const mapText = fs.readFileSync(mapFile, 'utf8');

// Regex mais flexível para capturar pathIds
const tileRegex = /pathId:\s*['"]([^'"]+)['"]/g;
let match;
const pathSet = new Set();
while ((match = tileRegex.exec(mapText)) !== null) {
    pathSet.add(match[1]);
}

console.log(`Encontrados ${pathSet.size} paths no mapData.js`);

const raw = JSON.parse(fs.readFileSync(connFile, 'utf8'));
let ok = true;
let errorCount = 0;

for (const key of Object.keys(raw)) {
    if (!pathSet.has(key)) {
        console.error('Chave ausente no mapa:', key);
        ok = false;
        errorCount++;
    }
    for (const v of raw[key]) {
        if (!pathSet.has(v)) {
            console.error('Vizinho ausente no mapa:', v, 'na chave', key);
            ok = false;
            errorCount++;
        }
    }
}

if (ok) {
    console.log('✅ Validação concluída: todas as chaves e vizinhos existem no mapa.');
} else {
    console.error(`❌ Validação falhou com ${errorCount} erros.`);
    process.exit(2);
}

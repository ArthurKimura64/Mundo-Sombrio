// Dados do mapa - Mundo Sombrio
// Gerado automaticamente a partir do connections.json

(function() {
    // Carregar connections.json e gerar MAP_DATA dinamicamente
    fetch('/data/connections.json')
        .then(response => response.json())
        .then(connections => {
            // Extrair todos os pathIds únicos das conexões
            const pathIds = new Set();
            for (const key of Object.keys(connections)) {
                pathIds.add(key);
                for (const neighbor of connections[key]) {
                    pathIds.add(neighbor);
                }
            }
            
            // Separar paths (pathXXX) de locais (outros nomes)
            const paths = [];
            const locations = [];
            
            for (const id of pathIds) {
                if (id.startsWith('path')) {
                    paths.push(id);
                } else {
                    locations.push(id);
                }
            }
            
            // Ordenar paths numericamente
            paths.sort((a, b) => {
                const numA = parseInt(a.replace('path', ''));
                const numB = parseInt(b.replace('path', ''));
                return numA - numB;
            });
            
            // Ordenar locais alfabeticamente
            locations.sort();
            
            // Criar tiles com ID = pathId (string)
            const tiles = [];
            
            // Adicionar paths
            for (const pathId of paths) {
                tiles.push({
                    id: pathId,
                    pathId: pathId,
                    isLocation: false
                });
            }
            
            // Adicionar locais
            for (const locationId of locations) {
                tiles.push({
                    id: locationId,
                    pathId: locationId,
                    isLocation: true
                });
            }
            
            window.MAP_DATA = {
                viewBox: {
                    width: 13300,
                    height: 9000
                },
                tiles: tiles,
                connections: connections
            };
            
            console.log('MAP_DATA carregado:', tiles.length, 'casas (', paths.length, 'paths +', locations.length, 'locais)');
            
            // Disparar evento para notificar que MAP_DATA está pronto
            window.dispatchEvent(new Event('mapDataReady'));
        })
        .catch(error => {
            console.error('Erro ao carregar connections.json:', error);
        });
})();

// Mundo Sombrio - Servidor de Desenvolvimento
// Apenas serve arquivos estáticos (toda a lógica real está no Supabase)

const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota catch-all para SPA (opcional)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor HTTP e WebSocket
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║        🎮 MUNDO SOMBRIO - Dev Server 🎮           ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Servidor rodando em: http://localhost:${PORT}        ║
║                                                   ║
║  Multiplayer: via Supabase Realtime               ║
║  Deploy: Vercel ou GitHub Pages                   ║
║  Live Reload: ws://localhost:${PORT}              ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
});

// WebSocket para live reload
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected' }));
});

// Watcher para arquivos da pasta public
const watcher = chokidar.watch(path.join(__dirname, 'public'), {
    ignoreInitial: true,
});

watcher.on('all', (event, filePath) => {
    // Notifica todos os clientes conectados
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'reload' }));
        }
    });
});

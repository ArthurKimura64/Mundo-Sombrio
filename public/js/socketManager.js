// Mundo Sombrio - Socket.IO Client Manager
// Gerencia toda a comunicação em tempo real com o servidor

class SocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;
        this.eventHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // Inicializar conexão
    init() {
        return new Promise((resolve, reject) => {
            try {
                // Conectar ao servidor Socket.IO
                this.socket = io({
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: this.maxReconnectAttempts
                });

                this.setupEventListeners();

                this.socket.on('connect', () => {
                    console.log('🔌 Conectado ao servidor Socket.IO');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connectionStatus', { connected: true });
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    console.error('❌ Erro de conexão:', error);
                    this.connected = false;
                    this.emit('connectionStatus', { connected: false, error });
                    reject(error);
                });

                // Timeout para conexão inicial
                setTimeout(() => {
                    if (!this.connected) {
                        reject(new Error('Timeout na conexão'));
                    }
                }, 5000);

            } catch (error) {
                console.error('Erro ao inicializar Socket.IO:', error);
                reject(error);
            }
        });
    }

    // Configurar listeners de eventos do servidor
    setupEventListeners() {
        // Reconexão
        this.socket.on('reconnect', (attempt) => {
            console.log(`🔄 Reconectado após ${attempt} tentativas`);
            this.connected = true;
            this.emit('reconnected', { attempt });
            
            // Re-sincronizar estado
            if (this.playerName) {
                this.socket.emit('joinGame', {
                    playerName: this.playerName,
                    playerId: this.playerId
                });
            }
            this.socket.emit('requestSync');
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('❌ Erro na reconexão:', error);
            this.reconnectAttempts++;
        });

        this.socket.on('reconnect_failed', () => {
            console.error('❌ Falha total na reconexão');
            this.emit('connectionFailed');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Desconectado:', reason);
            this.connected = false;
            this.emit('disconnected', { reason });
        });

        // Estado do jogo
        this.socket.on('gameState', (state) => {
            this.emit('gameState', state);
        });

        // Jogadores conectados
        this.socket.on('connectedPlayers', (players) => {
            this.emit('connectedPlayers', players);
        });

        // Jogador entrou
        this.socket.on('playerJoined', (data) => {
            this.emit('playerJoined', data);
            this.addLogEntry(`👤 ${data.playerName} entrou na sala`);
        });

        // Jogador adicionado ao jogo
        this.socket.on('playerAdded', (player) => {
            this.emit('playerAdded', player);
            this.addLogEntry(`➕ ${player.name} entrou no jogo como ${player.characterId}`);
        });

        // Jogador removido
        this.socket.on('playerRemoved', (playerId) => {
            this.emit('playerRemoved', playerId);
        });

        // Jogador desconectou
        this.socket.on('playerDisconnected', (data) => {
            this.emit('playerDisconnected', data);
            if (data.playerName) {
                this.addLogEntry(`🔌 ${data.playerName} desconectou`);
            }
        });

        // Movimento iniciado
        this.socket.on('movementStarted', (data) => {
            this.emit('movementStarted', data);
        });

        // Tile selecionado
        this.socket.on('tileSelected', (data) => {
            this.emit('tileSelected', data);
        });

        // Movimento confirmado
        this.socket.on('movementConfirmed', (data) => {
            this.emit('movementConfirmed', data);
        });

        // Movimento cancelado
        this.socket.on('movementCancelled', (data) => {
            this.emit('movementCancelled', data);
        });

        // Ação principal executada
        this.socket.on('mainActionExecuted', (data) => {
            this.emit('mainActionExecuted', data);
        });

        // Ação bônus executada
        this.socket.on('bonusActionExecuted', (data) => {
            this.emit('bonusActionExecuted', data);
        });

        // Turno terminado
        this.socket.on('turnEnded', (data) => {
            this.emit('turnEnded', data);
        });

        // Estado do jogador atualizado
        this.socket.on('playerStateUpdated', (data) => {
            this.emit('playerStateUpdated', data);
        });

        // Jogo resetado
        this.socket.on('gameReset', () => {
            this.emit('gameReset');
            this.addLogEntry('🔄 Jogo foi resetado');
        });

        // Mensagem de chat
        this.socket.on('chatMessage', (data) => {
            this.emit('chatMessage', data);
            this.addLogEntry(`💬 ${data.from}: ${data.message}`, 'chat');
        });

        // Erros
        this.socket.on('error', (data) => {
            this.emit('serverError', data);
            console.error('Erro do servidor:', data.message);
        });
    }

    // Sistema de eventos interno
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => handler(data));
        }
    }

    // === MÉTODOS DE COMUNICAÇÃO COM O SERVIDOR ===

    // Entrar no jogo
    joinGame(playerName) {
        this.playerName = playerName;
        this.socket.emit('joinGame', { 
            playerName,
            playerId: this.playerId 
        });
    }

    // Adicionar jogador
    addPlayer(playerData) {
        this.playerId = playerData.id;
        this.socket.emit('addPlayer', playerData);
    }

    // Remover jogador
    removePlayer(playerId) {
        this.socket.emit('removePlayer', playerId);
    }

    // Iniciar movimento
    startMovement() {
        this.socket.emit('startMovement', {});
    }

    // Selecionar tile
    selectTile(tileId) {
        this.socket.emit('selectTile', { tileId });
    }

    // Confirmar movimento
    confirmMove(tileId) {
        this.socket.emit('confirmMove', { tileId });
    }

    // Cancelar movimento
    cancelMove() {
        this.socket.emit('cancelMove');
    }

    // Executar ação principal
    executeMainAction(action) {
        this.socket.emit('executeMainAction', { action });
    }

    // Executar ação bônus
    executeBonusAction(action) {
        this.socket.emit('executeBonusAction', { action });
    }

    // Finalizar turno
    endTurn() {
        this.socket.emit('endTurn');
    }

    // Atualizar estado do jogador
    updatePlayerState(playerId, state) {
        this.socket.emit('updatePlayerState', { playerId, state });
    }

    // Resetar jogo
    resetGame() {
        this.socket.emit('resetGame');
    }

    // Enviar mensagem de chat
    sendChatMessage(message) {
        this.socket.emit('chatMessage', { message });
    }

    // Solicitar sincronização
    requestSync() {
        this.socket.emit('requestSync');
    }

    // Adicionar entrada no log
    addLogEntry(message, type = 'system') {
        const logElement = document.getElementById('gameLog');
        if (logElement) {
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.innerHTML = message;
            logElement.appendChild(entry);
            logElement.scrollTop = logElement.scrollHeight;
        }
    }

    // Verificar se é o turno do jogador local
    isMyTurn(currentPlayerId) {
        return this.playerId === currentPlayerId;
    }

    // Obter ID do socket
    getSocketId() {
        return this.socket?.id;
    }

    // Verificar conexão
    isConnected() {
        return this.connected && this.socket?.connected;
    }
}

// Instância global
window.socketManager = new SocketManager();

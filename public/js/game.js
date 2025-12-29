// Mundo Sombrio - Game Engine com Phaser 3
// Sistema de personagens com movimentação fixa
// Integrado com Socket.IO para multiplayer

class MundoSombrioGame {
    constructor() {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.gameStarted = false;
        this.mapData = null;
        this.connections = {};
        
        // Decks com quantidades
        this.decksData = null;
        this.deckQuantities = {};
        this.cardQuantities = {};
        // Rodadas padrão para montar quando jogador NÃO possui o talento requerido
        // Cada personagem terá suas próprias rodadas por nível de talento
        this.defaultMountingRounds = {
            "inteligencia": 5,
            "tecnologia": 6,
            "dinheiro": 4,
            "geografia": 3,
            "traducao": 7
        };
        
        // Estado do movimento
        this.isMoving = false;
        this.reachableTiles = new Map();
        this.selectedTile = null;
        
        // Sistema de ações por rodada
        this.currentTurnActions = {
            movementUsed: false,
            mainActionUsed: false,
            bonusActions: []
        };
        
        // Seleção de personagem
        this.selectedCharacterId = null;
        
        // Centros calculados dos paths
        this.tileCenters = {};
        
        // Configurações de tamanho
        this.tokenRadius = 75;
        this.tokenSpreadRadius = 90;
        
        // Phaser
        this.phaserGame = null;
        this.gameScene = null;
        this.mapSprite = null;
        this.tokenContainer = null;
        this.highlightContainer = null;
        this.clickableAreas = {};
        this.initialZoom = 1;
        
        // Dimensões reais do mapa (extraídas do SVG)
        this.mapWidth = null;
        this.mapHeight = null;

        // Cache de elementos UI
        this.ui = {};
        
        // Multiplayer (false = modo local/single-player)
        this.isMultiplayer = false;
        this.localPlayerId = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Inicializar sistemas
            await window.i18n.init();
            await window.characterManager.init();
            window.i18n.updateUI();
            
            // Carregar decks
            await this.loadDecks();
            
            // Aguardar MAP_DATA estar disponível
            await this.waitForMapData();
            this.setupUI();
            await this.loadConnections();
            await this.loadSVGAndCalculateCenters();
            this.initPhaser();
            
            // Inicializar sistema de salas/multiplayer
            await this.initMultiplayer();
            
            console.log('✅ Jogo inicializado');
        } catch (error) {
            console.error('Erro na inicialização:', error);
            this.showError(window.i18n.get('errors.initError'));
        }
    }
    
    async initMultiplayer() {
        const config = window.MUNDO_SOMBRIO_CONFIG || {};
        
        // Tentar inicializar Supabase se configurado
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            try {
                const initialized = await window.supabaseManager.init(
                    config.SUPABASE_URL,
                    config.SUPABASE_ANON_KEY
                );
                
                if (initialized) {
                    this.isMultiplayer = true;
                    this.setupSupabaseListeners();
                    console.log('✅ Multiplayer online habilitado');
                }
            } catch (error) {
                console.warn('⚠️ Falha ao conectar Supabase, modo offline:', error);
            }
        }
        
        // Inicializar gerenciador de salas
        window.roomManager.init();
        
        // Listener para quando entrar em uma sala
        window.supabaseManager.on('roomJoined', async (data) => {
            this.localPlayerId = window.supabaseManager.playerId;
            this.isMultiplayer = true;
            
            // Carregar estado do jogo do Supabase
            await this.loadGameState();
        });
        
        // Listener para modo local
        window.supabaseManager.on('roomLeft', () => {
            this.isMultiplayer = false;
        });
    }
    
    setupSupabaseListeners() {
        const sm = window.supabaseManager;
        
        // Estado da sala atualizado
        sm.on('roomUpdated', (room) => {
            // Sincronizar estado da sala
            this.currentPlayerIndex = room.current_player_index || 0;
            this.currentTurnActions = room.current_turn_actions || {
                movementUsed: false,
                mainActionUsed: false,
                bonusActions: []
            };
            
            if (room.deck_quantities) {
                this.deckQuantities = room.deck_quantities;
                this.updateDecksDisplay();
            }
            if (room.card_quantities) {
                this.cardQuantities = room.card_quantities;
            }
            
            // Atualizar UI
            this.updateTurnIndicator();
            this.updateActionButtons();
        });
        
        // Jogador adicionado (via banco)
        sm.on('playerAdded', (player) => {
            // Se não for o jogador local, adicionar
            if (!this.players.find(p => p.id === player.id)) {
                this.addRemotePlayer(player);
            }
        });
        
        // Jogador atualizado (via banco - posição, inventário, estado)
        sm.on('playerUpdated', (playerData) => {
            const player = this.players.find(p => p.id === playerData.id);
            if (player) {
                // Atualizar posição
                if (playerData.position && playerData.position !== player.position) {
                    player.position = playerData.position;
                    this.updateAllTokenPositions();
                }
                
                // Atualizar estado
                if (playerData.state) {
                    player.state = { ...player.state, ...playerData.state };
                }
                
                // Atualizar cartas/inventário
                if (playerData.cards) {
                    player.cards = playerData.cards;
                }
                if (playerData.inventory) {
                    player.cards = playerData.inventory.cards || [];
                }
                
                this.updatePlayerList();
                if (this.isLocalPlayer(playerData.id)) {
                    this.showCharacterInfo(player);
                    this.updatePlayerCards();
                }
            }
        });
        
        // Jogador removido
        sm.on('playerRemoved', (playerId) => {
            this.removePlayerById(playerId);
        });
        
        // Movimento iniciado por outro jogador
        sm.on('movementStarted', (data) => {
            if (!this.isLocalPlayer(data.playerId)) {
                // Mostrar que outro jogador está movendo
                this.showRemoteMovement(data);
            }
        });
        
        // Tile selecionado por outro jogador
        sm.on('tileSelected', (data) => {
            if (!this.isLocalPlayer(data.playerId)) {
                this.showRemoteTileSelection(data.tileId);
            }
        });
        
        // Movimento confirmado
        sm.on('movementConfirmed', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.position = data.newPosition;
                this.updateAllTokenPositions();
                this.updatePlayerList();
                
                if (!this.isLocalPlayer(data.playerId)) {
                    this.addLogEntry(`🚶 ${player.name} moveu para uma nova posição`);
                }
            }
        });
        
        // Movimento cancelado
        sm.on('movementCancelled', (data) => {
            if (!this.isLocalPlayer(data.playerId)) {
                this.clearHighlights();
            }
        });
        
        // Ação principal executada
        sm.on('mainActionExecuted', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player && !this.isLocalPlayer(data.playerId)) {
                this.addLogEntry(`⚔️ ${player.name} executou: ${data.action}`);
            }
            this.currentTurnActions.mainActionUsed = true;
            this.updateActionButtons();
        });
        
        // Ação bônus executada
        sm.on('bonusActionExecuted', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player && !this.isLocalPlayer(data.playerId)) {
                this.addLogEntry(`✨ ${player.name} usou ação bônus: ${data.action}`);
            }
        });
        
        // Turno terminado
        sm.on('turnEnded', (data) => {
            this.currentPlayerIndex = data.currentPlayerIndex;
            this.currentTurnActions = {
                movementUsed: false,
                mainActionUsed: false,
                bonusActions: []
            };
            
            this.updateTurnIndicator();
            this.updatePlayerList();
            this.clearHighlights();
            
            const currentPlayer = this.players[this.currentPlayerIndex];
            if (currentPlayer) {
                this.focusOnPlayer(currentPlayer);
                this.showCharacterInfo(currentPlayer);
                
                if (this.isLocalPlayer(currentPlayer.id)) {
                    this.addLogEntry(`🎯 É o seu turno!`, 'highlight');
                    this.startMovementPhase();
                } else {
                    this.addLogEntry(`⏭️ Turno de ${currentPlayer.name}`);
                    this.hideActionPanel();
                }
            }
        });
        
        // Estado do jogador atualizado
        sm.on('playerStateUpdated', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.state = { ...player.state, ...data.state };
                this.updatePlayerList();
                if (this.isLocalPlayer(data.playerId)) {
                    this.showCharacterInfo(player);
                }
            }
        });
        
        // Jogo resetado
        sm.on('gameReset', () => {
            this.handleGameReset();
        });
        
        // Jogo iniciado (do waiting room)
        sm.on('gameStarted', () => {
            this.gameStarted = true;
            window.roomManager?.showScreen('game');
            this.addLogEntry('🎮 A partida começou!', 'highlight');
            
            // Se tiver jogadores, iniciar
            if (this.players.length > 0) {
                this.startGame();
            }
        });
        
        // Status de conexão
        sm.on('connectionStatus', (status) => {
            this.showConnectionStatus(status.connected);
        });
        
        sm.on('disconnected', () => {
            this.showConnectionStatus(false);
            this.addLogEntry('⚠️ Conexão perdida com o servidor', 'error');
        });
        
        sm.on('reconnected', () => {
            this.showConnectionStatus(true);
            this.addLogEntry('✅ Reconectado ao servidor', 'system');
        });
        
        // Erro do servidor
        sm.on('serverError', (data) => {
            this.showActionFeedback(`❌ ${data.message}`);
        });
        
        // Chat
        sm.on('chatMessage', (data) => {
            // Já é adicionado pelo socketManager
        });
    }
    
    syncGameState(state) {
        // Sincronizar estado do servidor
        this.currentPlayerIndex = state.currentPlayerIndex;
        this.gameStarted = state.gameStarted;
        this.currentTurnActions = state.currentTurnActions;
        
        // Sincronizar jogadores
        state.players.forEach(serverPlayer => {
            const existingPlayer = this.players.find(p => p.id === serverPlayer.id);
            if (!existingPlayer) {
                this.addRemotePlayer(serverPlayer);
            } else {
                // Atualizar posição e estado
                existingPlayer.position = serverPlayer.position;
                existingPlayer.state = serverPlayer.state;
            }
        });
        
        // Remover jogadores que não estão no servidor
        this.players = this.players.filter(p => 
            state.players.some(sp => sp.id === p.id)
        );
        
        this.updateAllTokenPositions();
        this.updatePlayerList();
        this.updateTurnIndicator();
        
        // Atualizar UI baseado em quem é o jogador atual
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer) {
            this.showCharacterInfo(currentPlayer);
            if (this.isLocalPlayer(currentPlayer.id)) {
                this.showActionPanel();
            } else {
                this.hideActionPanel();
            }
        }
    }
    
    addRemotePlayer(playerData) {
        const player = {
            id: playerData.id,
            name: playerData.name,
            characterId: playerData.characterId,
            color: playerData.color,
            position: playerData.position || 'path001',
            state: playerData.state,
            token: null
        };
        
        this.players.push(player);
        
        if (this.gameScene) {
            this.createPlayerToken(player);
            this.updateAllTokenPositions();
        }
        
        this.updatePlayerList();
        this.addLogEntry(`👤 ${player.name} entrou no jogo`);
    }
    
    removePlayerById(playerId) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            const player = this.players[playerIndex];
            
            // Remover token
            if (player.token) {
                player.token.destroy();
            }
            
            this.players.splice(playerIndex, 1);
            
            // Ajustar índice
            if (this.currentPlayerIndex >= this.players.length) {
                this.currentPlayerIndex = 0;
            }
            
            this.updateAllTokenPositions();
            this.updatePlayerList();
            this.updateTurnIndicator();
            
            this.addLogEntry(`👋 ${player.name} saiu do jogo`);
        }
    }
    
    showRemoteMovement(data) {
        const player = this.players.find(p => p.id === data.playerId);
        if (player) {
            this.addLogEntry(`🚶 ${player.name} está se movendo...`);
        }
    }
    
    showRemoteTileSelection(tileId) {
        // Mostrar visualmente onde outro jogador está considerando mover
        const center = this.tileCenters[tileId];
        if (center && this.gameScene) {
            // Criar um highlight temporário
            const highlight = this.gameScene.add.graphics();
            highlight.lineStyle(4, 0xff9800, 0.8);
            highlight.strokeCircle(center.x, center.y, 100);
            this.highlightContainer.add(highlight);
            
            // Remover após 2 segundos
            this.gameScene.time.delayedCall(2000, () => {
                highlight.destroy();
            });
        }
    }
    
    clearHighlights() {
        if (this.highlightContainer) {
            this.highlightContainer.removeAll(true);
        }
        this.isMoving = false;
        this.selectedTile = null;
        this.reachableTiles.clear();
    }
    
    hideActionPanel() {
        // Desabilitar botões de ação
        const btnEndTurn = document.getElementById('btnEndTurn');
        if (btnEndTurn) {
            btnEndTurn.disabled = true;
        }
        if (this.ui.movementPanel) {
            this.ui.movementPanel.style.display = 'none';
        }
    }
    
    handleGameReset() {
        // Limpar containers
        if (this.tokenContainer) {
            this.tokenContainer.removeAll(true);
        }
        if (this.highlightContainer) {
            this.highlightContainer.removeAll(true);
        }
        
        // Resetar estado
        this.players = [];
        this.currentPlayerIndex = 0;
        this.gameStarted = false;
        this.isMoving = false;
        this.selectedTile = null;
        this.reachableTiles = new Map();
        this.selectedCharacterId = null;
        this.localPlayerId = null;
        
        // Resetar UI
        this.resetUI();
    }
    
    isLocalPlayer(playerId) {
        return this.localPlayerId === playerId;
    }
    
    isMyTurn() {
        // Em modo single-player, sempre é o turno do jogador
        if (!this.isMultiplayer) {
            return true;
        }
        
        // Em multiplayer, verificar se é o jogador local
        const currentPlayer = this.players[this.currentPlayerIndex];
        return currentPlayer && this.isLocalPlayer(currentPlayer.id);
    }
    
    isPlayerInLocation(player) {
        if (!player || !player.position) return false;
        
        // Verificar se a posição começa com "path" - se sim, é um caminho, não um local
        // Locais são: ArthurHouse, SwordStone, etc (não começam com "path")
        return !player.position.startsWith('path');
    }
    
    getLocationName(position) {
        // Retorna nome legível do local
        if (!position) return 'Desconhecido';
        if (position.startsWith('path')) {
            return `Caminho ${position.replace('path', '')}`;
        }
        // Para locais, converter camelCase para espaços
        return position.replace(/([A-Z])/g, ' $1').trim();
    }
    
    switchTab(tabName) {
        // Atualizar botões das tabs
        this.ui.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Atualizar conteúdo das tabs
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        });
    }
    
    addLogEntry(message, type = 'system') {
        const logElement = document.getElementById('gameLog');
        if (logElement) {
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            
            // Adicionar timestamp
            const time = new Date().toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
            
            logElement.appendChild(entry);
            logElement.scrollTop = logElement.scrollHeight;
        }
    }
    
    waitForMapData() {
        return new Promise((resolve, reject) => {
            if (window.MAP_DATA) {
                this.mapData = window.MAP_DATA;
                console.log('MAP_DATA já disponível');
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                reject(new Error('MAP_DATA não carregado (timeout)'));
            }, 10000);
            
            window.addEventListener('mapDataReady', () => {
                clearTimeout(timeout);
                this.mapData = window.MAP_DATA;
                console.log('MAP_DATA carregado via evento');
                resolve();
            }, { once: true });
        });
    }
    
    showError(message) {
        const container = document.getElementById('game-container');
        if (container) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #e74c3c; font-size: 1.2rem; text-align: center; padding: 20px;">
                    <div>
                        <p>⚠️ ${message}</p>
                        <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; cursor: pointer;">${window.i18n.get('errors.reload')}</button>
                    </div>
                </div>
            `;
        }
    }
    
    showConnectionStatus(connected) {
        // Função placeholder para status de conexão
        // Pode ser expandida futuramente para mostrar indicador visual
        console.log(connected ? '🟢 Online' : '🔴 Offline');
    }
    
    async loadConnections() {
        try {
            const response = await fetch('/data/connections.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const rawConnections = await response.json();
            
            // Agora usamos os IDs como strings diretamente
            this.connections = rawConnections;
            console.log('Conexões carregadas:', Object.keys(this.connections).length);
        } catch (error) {
            console.error('Erro ao carregar conexões:', error);
            this.connections = {};
        }
    }
    
    async loadDecks() {
        try {
            const response = await fetch('/data/decks.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.decksData = await response.json();
            
            // Inicializar quantidades dos decks
            this.resetDeckQuantities();
            
            console.log('✅ Decks carregados:', Object.keys(this.decksData.decks).length);
        } catch (error) {
            console.error('❌ Erro ao carregar decks.json:', error);
            this.decksData = { decks: {} };
        }
    }
    
    resetDeckQuantities() {
        this.deckQuantities = {};
        this.cardQuantities = {};
        if (this.decksData && this.decksData.decks) {
            for (const [key, deck] of Object.entries(this.decksData.decks)) {
                // Calcular quantidade total somando as quantidades de cada carta
                let totalQuantity = 0;
                this.cardQuantities[key] = {};
                
                if (deck.cards) {
                    for (const card of deck.cards) {
                        const cardQty = card.quantity || 1;
                        totalQuantity += cardQty;
                        this.cardQuantities[key][card.id] = cardQty;
                    }
                }
                
                this.deckQuantities[key] = totalQuantity;
            }
        }
        console.log('🔄 Quantidades de decks resetadas:', this.deckQuantities);
        console.log('🔄 Quantidades de cartas:', this.cardQuantities);
    }
    
    getDeckQuantity(deckId) {
        return this.deckQuantities[deckId] || 0;
    }
    
    decrementDeck(deckId) {
        if (this.deckQuantities[deckId] > 0) {
            this.deckQuantities[deckId]--;
            this.updateDecksDisplay();
            this.saveGameState();
            return true;
        }
        return false;
    }
    
    isDeckEmpty(deckId) {
        return this.getDeckQuantity(deckId) === 0;
    }
    
    setupUI() {
        this.ui = {
            resetBtn: document.getElementById('resetGame'),
            addPlayerBtn: document.getElementById('addPlayer'),
            playerNameInput: document.getElementById('playerName'),
            openCharacterSelectBtn: document.getElementById('openCharacterSelect'),
            cancelMoveBtn: document.getElementById('cancelMove'),
            confirmMoveBtn: document.getElementById('confirmMove'),
            endTurnBtn: document.getElementById('endTurn'),
            movementPanel: document.getElementById('movementPanel'),
            maxMoves: document.getElementById('maxMoves'),
            currentPlayerDisplay: document.getElementById('currentPlayerDisplay'),
            // Modal
            characterSelectModal: document.getElementById('characterSelectModal'),
            characterGrid: document.getElementById('characterGrid'),
            cancelCharacterSelectBtn: document.getElementById('cancelCharacterSelect'),
            confirmCharacterSelectBtn: document.getElementById('confirmCharacterSelect'),
            // Setup Area
            setupArea: document.getElementById('setupArea'),
            setupPlayersList: document.getElementById('setupPlayersList'),
            btnStartGame: document.getElementById('btnStartGame'),
            // Top Bar
            topBar: document.getElementById('topBar'),
            playersBar: document.getElementById('playersBar'),
            decksArea: document.getElementById('decksArea'),
            decksIcons: document.getElementById('decksIcons'),
            bottomBar: document.getElementById('bottomBar'),
            // Panel
            rightPanel: document.getElementById('rightPanel'),
            toggleRightPanel: document.getElementById('toggleRightPanel'),
            // Tabs
            tabBtns: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content'),
            gameLog: document.getElementById('gameLog')
        };
        
        // Inicializar ícones dos decks
        this.initDecksIcons();
        
        // Event listeners
        if (this.ui.resetBtn) {
            this.ui.resetBtn.addEventListener('click', () => this.resetGame());
        }
        if (this.ui.addPlayerBtn) {
            this.ui.addPlayerBtn.addEventListener('click', () => this.addPlayer());
        }
        if (this.ui.playerNameInput) {
            this.ui.playerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && this.selectedCharacterId) {
                    this.addPlayer();
                }
            });
        }
        if (this.ui.openCharacterSelectBtn) {
            this.ui.openCharacterSelectBtn.addEventListener('click', () => this.openCharacterSelectModal());
        }
        if (this.ui.cancelMoveBtn) {
            this.ui.cancelMoveBtn.addEventListener('click', () => this.cancelMove());
        }
        if (this.ui.confirmMoveBtn) {
            this.ui.confirmMoveBtn.addEventListener('click', () => this.confirmMove());
        }
        if (this.ui.endTurnBtn) {
            this.ui.endTurnBtn.addEventListener('click', () => this.endTurn());
        }
        if (this.ui.cancelCharacterSelectBtn) {
            this.ui.cancelCharacterSelectBtn.addEventListener('click', () => this.closeCharacterSelectModal());
        }
        if (this.ui.confirmCharacterSelectBtn) {
            this.ui.confirmCharacterSelectBtn.addEventListener('click', () => this.confirmCharacterSelection());
        }
        if (this.ui.btnStartGame) {
            this.ui.btnStartGame.addEventListener('click', () => this.startGame());
        }
        
        // Botão para limpar save
        const btnClearSave = document.getElementById('btnClearSave');
        if (btnClearSave) {
            btnClearSave.addEventListener('click', () => this.clearSavedGame());
        }
        
        // Event listeners - Painel lateral
        if (this.ui.toggleRightPanel) {
            this.ui.toggleRightPanel.addEventListener('click', () => {
                const isCollapsed = this.ui.rightPanel.classList.toggle('collapsed');
                this.ui.toggleRightPanel.textContent = isCollapsed ? '▶' : '◀';
                
                // Aguardar animação CSS terminar antes de resize do Phaser
                setTimeout(() => {
                    if (this.phaserGame && this.phaserGame.scale) {
                        this.phaserGame.scale.resize(
                            document.getElementById('game-container').clientWidth,
                            document.getElementById('game-container').clientHeight
                        );
                    }
                }, 350); // Tempo da transição CSS (0.3s + margem)
            });
        }
        
        // Event listeners - Tabs
        this.ui.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        
        // Event listeners para botões de ação da barra inferior
        const btnTrack = document.getElementById('btnTrack');
        if (btnTrack) {
            btnTrack.addEventListener('click', () => this.executeTracking());
        }
        
        const btnEndTurn = document.getElementById('btnEndTurn');
        if (btnEndTurn) {
            btnEndTurn.addEventListener('click', () => this.endTurn());
        }
        
        const btnSkills = document.getElementById('btnSkills');
        if (btnSkills) {
            btnSkills.addEventListener('click', () => {
                this.switchTab('skills');
                if (this.ui.rightPanel.classList.contains('collapsed')) {
                    this.ui.rightPanel.classList.remove('collapsed');
                    this.ui.toggleRightPanel.textContent = '◀';
                }
            });
        }
        
        // Event listeners para ações legadas (antigo painel)
        const movementActionBtn = document.getElementById('movementActionBtn');
        if (movementActionBtn) {
            movementActionBtn.addEventListener('click', () => this.startMovementAction());
        }
        
        const executeMainActionBtn = document.getElementById('executeMainActionBtn');
        if (executeMainActionBtn) {
            executeMainActionBtn.addEventListener('click', () => this.executeMainAction());
        }
        
        const executeBonusActionBtn = document.getElementById('executeBonusActionBtn');
        if (executeBonusActionBtn) {
            executeBonusActionBtn.addEventListener('click', () => this.executeBonusAction());
        }
        
        const mainActionSelect = document.getElementById('mainActionSelect');
        if (mainActionSelect) {
            mainActionSelect.addEventListener('change', () => {
                const executeBtn = document.getElementById('executeMainActionBtn');
                if (executeBtn) {
                    executeBtn.disabled = mainActionSelect.value === '' || this.currentTurnActions.mainActionUsed;
                }
            });
        }
    }
    
    // === MODAL DE SELEÇÃO DE PERSONAGEM ===
    
    openCharacterSelectModal() {
        if (!this.ui.characterGrid || !this.ui.characterSelectModal) {
            console.error('Elementos do modal não encontrados');
            return;
        }
        
        const usedIds = this.players.map(p => p.characterId);
        this.ui.characterGrid.innerHTML = window.characterManager.generateCharacterSelectHTML(usedIds);
        
        // Adicionar eventos de clique aos cards
        this.ui.characterGrid.querySelectorAll('.modal-character-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', () => this.selectCharacterCard(card));
        });
        
        this.selectedCharacterId = null;
        if (this.ui.confirmCharacterSelectBtn) {
            this.ui.confirmCharacterSelectBtn.disabled = true;
        }
        this.ui.characterSelectModal.classList.remove('hidden');
    }
    
    selectCharacterCard(card) {
        // Remover seleção anterior
        this.ui.characterGrid.querySelectorAll('.modal-character-card').forEach(c => {
            c.classList.remove('selected');
        });
        
        // Selecionar novo
        card.classList.add('selected');
        this.selectedCharacterId = card.dataset.characterId;
        this.ui.confirmCharacterSelectBtn.disabled = false;
    }
    
    confirmCharacterSelection() {
        if (!this.selectedCharacterId) return;
        
        this.closeCharacterSelectModal();
        this.ui.addPlayerBtn.disabled = false;
        
        // Mostrar personagem selecionado no botão
        const character = window.characterManager.getById(this.selectedCharacterId);
        if (character) {
            const name = window.characterManager.getName(character);
            this.ui.openCharacterSelectBtn.innerHTML = `${character.icon} ${name}`;
        }
    }
    
    closeCharacterSelectModal() {
        this.ui.characterSelectModal.classList.add('hidden');
    }
    
    async loadSVGAndCalculateCenters() {
        try {
            const response = await fetch('/mapa-mundo-sombrio.svg');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const svgText = await response.text();
            
            const tempDiv = document.createElement('div');
            tempDiv.style.cssText = 'position: absolute; visibility: hidden; width: 0; height: 0; overflow: hidden;';
            tempDiv.innerHTML = svgText;
            document.body.appendChild(tempDiv);
            
            const svgElement = tempDiv.querySelector('svg');

            // Extrair dimensões reais do SVG (viewBox ou width/height)
            try {
                if (svgElement) {
                    const vb = svgElement.getAttribute('viewBox');
                    if (vb) {
                        const nums = vb.trim().split(/[,\s]+/).map(Number);
                        if (nums.length >= 4 && !Number.isNaN(nums[2]) && !Number.isNaN(nums[3])) {
                            this.mapWidth = nums[2];
                            this.mapHeight = nums[3];
                        }
                    }

                    if ((!this.mapWidth || !this.mapHeight) && svgElement.hasAttribute('width') && svgElement.hasAttribute('height')) {
                        const w = parseFloat(svgElement.getAttribute('width')) || null;
                        const h = parseFloat(svgElement.getAttribute('height')) || null;
                        if (w && h) {
                            this.mapWidth = this.mapWidth || w;
                            this.mapHeight = this.mapHeight || h;
                        }
                    }
                }
            } catch (e) {
                // Ignorar erros de parsing e usar valores padrão
            }
            
            // Calcular centro de cada path
            this.mapData.tiles.forEach(tile => {
                const pathElement = svgElement?.querySelector(`#${tile.pathId}`);
                if (pathElement) {
                    try {
                        const bbox = pathElement.getBBox();
                        if (bbox && bbox.width > 0 && bbox.height > 0) {
                            this.tileCenters[tile.id] = {
                                x: bbox.x + bbox.width / 2,
                                y: bbox.y + bbox.height / 2
                            };
                        } else {
                            this.tileCenters[tile.id] = this.calculatePathCenterFromD(pathElement);
                        }
                    } catch (e) {
                        this.tileCenters[tile.id] = this.calculatePathCenterFromD(pathElement);
                    }
                }
            });
            
            // Limpar elemento temporário
            document.body.removeChild(tempDiv);

            // Se ainda não temos dimensões, tentar extrair de mapData.viewBox
            if ((!this.mapWidth || !this.mapHeight) && this.mapData && this.mapData.viewBox) {
                this.mapWidth = this.mapWidth || this.mapData.viewBox.width;
                this.mapHeight = this.mapHeight || this.mapData.viewBox.height;
            }

            // Garantir valores padrão mínimos (dimensões do novo mapa)
            this.mapWidth = this.mapWidth || 13300;
            this.mapHeight = this.mapHeight || 9000;
            
            console.log('Centros calculados:', Object.keys(this.tileCenters).length);
        } catch (error) {
            console.error('Erro ao carregar SVG:', error);
        }
    }
    
    calculatePathCenterFromD(pathElement) {
        const d = pathElement.getAttribute('d');
        if (!d) return { x: 0, y: 0 };
        
        // Usar bounding box (minX, minY, maxX, maxY) em vez de array de pontos - mais eficiente
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let cx = 0, cy = 0;
        let hasPoints = false;
        
        // Regex otimizado para extrair comandos
        const cmdRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
        const numRegex = /-?[\d.]+/g;
        let match;
        
        const updateBounds = (x, y) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasPoints = true;
        };
        
        while ((match = cmdRegex.exec(d)) !== null) {
            const type = match[1];
            const nums = match[2].match(numRegex)?.map(Number) || [];
            const len = nums.length;
            
            switch (type) {
                case 'M': case 'L': case 'T':
                    for (let i = 0; i + 1 < len; i += 2) {
                        cx = nums[i]; cy = nums[i + 1];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'm': case 'l': case 't':
                    for (let i = 0; i + 1 < len; i += 2) {
                        cx += nums[i]; cy += nums[i + 1];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'H':
                    for (let i = 0; i < len; i++) { cx = nums[i]; updateBounds(cx, cy); }
                    break;
                case 'h':
                    for (let i = 0; i < len; i++) { cx += nums[i]; updateBounds(cx, cy); }
                    break;
                case 'V':
                    for (let i = 0; i < len; i++) { cy = nums[i]; updateBounds(cx, cy); }
                    break;
                case 'v':
                    for (let i = 0; i < len; i++) { cy += nums[i]; updateBounds(cx, cy); }
                    break;
                case 'C': // Cubic Bezier (x1,y1,x2,y2,x,y)
                    for (let i = 0; i + 5 < len; i += 6) {
                        updateBounds(nums[i], nums[i + 1]);
                        updateBounds(nums[i + 2], nums[i + 3]);
                        cx = nums[i + 4]; cy = nums[i + 5];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'c':
                    for (let i = 0; i + 5 < len; i += 6) {
                        updateBounds(cx + nums[i], cy + nums[i + 1]);
                        updateBounds(cx + nums[i + 2], cy + nums[i + 3]);
                        cx += nums[i + 4]; cy += nums[i + 5];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'S': case 'Q': // Smooth cubic / Quadratic (x1,y1,x,y)
                    for (let i = 0; i + 3 < len; i += 4) {
                        updateBounds(nums[i], nums[i + 1]);
                        cx = nums[i + 2]; cy = nums[i + 3];
                        updateBounds(cx, cy);
                    }
                    break;
                case 's': case 'q':
                    for (let i = 0; i + 3 < len; i += 4) {
                        updateBounds(cx + nums[i], cy + nums[i + 1]);
                        cx += nums[i + 2]; cy += nums[i + 3];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'A': // Arc (rx,ry,angle,large,sweep,x,y)
                    for (let i = 0; i + 6 < len; i += 7) {
                        cx = nums[i + 5]; cy = nums[i + 6];
                        updateBounds(cx, cy);
                    }
                    break;
                case 'a':
                    for (let i = 0; i + 6 < len; i += 7) {
                        cx += nums[i + 5]; cy += nums[i + 6];
                        updateBounds(cx, cy);
                    }
                    break;
                // Z/z fecha o path, não afeta bounds
            }
        }
        
        if (!hasPoints) return { x: 0, y: 0 };
        
        // Centro do bounding box
        return { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
    }
    
    initPhaser() {
        const container = document.getElementById('game-container');
        if (!container) {
            console.error('Container do jogo não encontrado');
            return;
        }
        
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;
        
        const self = this;
        
        const config = {
            type: Phaser.AUTO,
            parent: 'game-container',
            width: width,
            height: height,
            backgroundColor: '#1a1a2e',
            scene: {
                preload: function() { self.preload(this); },
                create: function() { self.create(this); },
                update: function() { self.update(this); }
            },
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH
            }
        };
        
        this.phaserGame = new Phaser.Game(config);
    }

    getMapSize() {
        const mw = this.mapWidth || this.mapData?.viewBox?.width || 13300;
        const mh = this.mapHeight || this.mapData?.viewBox?.height || 9000;
        return { mw, mh };
    }
    
    preload(scene) {
        const { mw, mh } = this.getMapSize();
        scene.load.svg('map', '/mapa-mundo-sombrio.svg', { width: mw, height: mh });
    }
    
    create(scene) {
        this.gameScene = scene;
        
        // Criar o mapa
        this.mapSprite = scene.add.image(0, 0, 'map');
        this.mapSprite.setOrigin(0, 0);
        
        // Container para highlights (abaixo dos tokens)
        this.highlightContainer = scene.add.container(0, 0);
        
        // Container para os tokens (acima do mapa)
        this.tokenContainer = scene.add.container(0, 0);
        
        // Setup da câmera
        const cam = scene.cameras.main;
        const { mw, mh } = this.getMapSize();
        
        cam.setBounds(0, 0, mw, mh);
        
        // Zoom inicial
        const scaleX = scene.scale.width / mw;
        const scaleY = scene.scale.height / mh;
        this.initialZoom = Math.min(scaleX, scaleY) * 1.8;
        cam.setZoom(this.initialZoom);
        cam.centerOn(mw / 2, mh / 2);
        
        // Setup dos controles
        this.setupCameraControls(scene);
        this.createClickableAreas(scene);
        
        // Configurar blur em campos de formulário ao clicar no canvas
        this.setupCanvasBlur(scene);
        
        // Listener de resize para ajustar câmera quando o canvas muda de tamanho
        scene.scale.on('resize', (gameSize) => {
            this.handleResize(scene, gameSize);
        });
        
        // Carregar estado salvo
        this.loadGameState();
    }
    
    setupCanvasBlur(scene) {
        try {
            const canvas = scene.game?.canvas;
            if (canvas && !canvas._blurListenerAdded) {
                canvas.addEventListener('pointerdown', (ev) => {
                    const active = document.activeElement;
                    if (!active) return;
                    const tag = active.tagName;
                    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && ev.target === canvas) {
                        active.blur();
                    }
                });
                canvas._blurListenerAdded = true;
            }
        } catch (e) {
            // Ignorar erros
        }
    }
    
    handleResize(scene, gameSize) {
        if (!scene || !scene.cameras || !scene.cameras.main) return;
        
        const cam = scene.cameras.main;
        const { mw, mh } = this.getMapSize();
        
        // Recalcular zoom mínimo baseado no novo tamanho da viewport
        const fitZoomWidth = gameSize.width / mw;
        const fitZoomHeight = gameSize.height / mh;
        const fitZoom = Math.max(fitZoomWidth, fitZoomHeight);
        
        this.minZoom = fitZoom;
        this.maxZoom = 3;
        
        // Ajustar zoom atual se estiver fora dos novos limites
        const currentZoom = cam.zoom;
        if (currentZoom < this.minZoom) {
            cam.setZoom(this.minZoom);
        }
        
        // Manter o centro aproximado da viewport
        cam.setBounds(0, 0, mw, mh);
    }
    
    setupCameraControls(scene) {
        const cam = scene.cameras.main;
        const { mw, mh } = this.getMapSize();

        // Calcular zoom mínimo para que o mapa sempre preencha a viewport
        // Evita que o jogador dê zoom out além dos limites do mapa e veja áreas vazias
        const fitZoomWidth = scene.scale.width / mw;
        const fitZoomHeight = scene.scale.height / mh;
        const fitZoom = Math.max(fitZoomWidth, fitZoomHeight);
        const minZoom = fitZoom; // zoom que garante o mapa preenche a viewport
        const maxZoom = 3;

        this.minZoom = minZoom;
        this.maxZoom = maxZoom;

        // Configurações da câmera
        cam.roundPixels = false;
        
        // Usar bounds do Phaser para limitar a câmera (mais preciso que clamp manual)
        cam.setBounds(0, 0, mw, mh);
        cam.useBounds = true;
        
        // Zoom com scroll do mouse - ANCORADO NO CURSOR
        scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            // Prevenir scroll da página
            if (pointer.event) {
                pointer.event.preventDefault();
                pointer.event.stopPropagation();
            }

            const oldZoom = cam.zoom;
            
            // Ponto do mundo sob o cursor ANTES do zoom
            // Fórmula Phaser 3: worldX = scrollX + (screenX - width/2) / zoom
            const worldX = cam.scrollX + (pointer.x - cam.width * 0.5) / oldZoom;
            const worldY = cam.scrollY + (pointer.y - cam.height * 0.5) / oldZoom;

            // Calcular novo zoom (scroll para baixo = afastar, para cima = aproximar)
            const zoomFactor = deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Phaser.Math.Clamp(oldZoom * zoomFactor, minZoom, maxZoom);
            
            // Se o zoom não mudou, não fazer nada
            if (newZoom === oldZoom) return;

            // Aplicar novo zoom
            cam.setZoom(newZoom);

            // Recalcular scroll para manter o mesmo ponto do mundo sob o cursor
            // Invertendo a fórmula: scrollX = worldX - (screenX - width/2) / newZoom
            cam.scrollX = worldX - (pointer.x - cam.width * 0.5) / newZoom;
            cam.scrollY = worldY - (pointer.y - cam.height * 0.5) / newZoom;
        });
        
        // Pan com drag (qualquer botão do mouse)
        let isDragging = false;
        let lastPointerX = 0;
        let lastPointerY = 0;

        scene.input.on('pointerdown', (pointer) => {
            isDragging = true;
            lastPointerX = pointer.x;
            lastPointerY = pointer.y;
            scene.game.canvas.style.cursor = 'grabbing';
        });

        scene.input.on('pointermove', (pointer) => {
            if (!isDragging) return;
            
            // Calcular delta em coordenadas do mundo
            const dx = (pointer.x - lastPointerX) / cam.zoom;
            const dy = (pointer.y - lastPointerY) / cam.zoom;
            
            cam.scrollX -= dx;
            cam.scrollY -= dy;
            
            lastPointerX = pointer.x;
            lastPointerY = pointer.y;
        });

        scene.input.on('pointerup', () => {
            isDragging = false;
            scene.game.canvas.style.cursor = 'default';
        });

        scene.input.on('pointerupoutside', () => {
            isDragging = false;
            scene.game.canvas.style.cursor = 'default';
        });
        
        // Double-click para resetar zoom e centralizar
        const canvas = scene.game.canvas;
        if (canvas && !canvas._dblClickAdded) {
            canvas.addEventListener('dblclick', () => {
                const targetZoom = Phaser.Math.Clamp(this.initialZoom, minZoom, maxZoom);
                cam.zoomTo(targetZoom, 300);
                cam.pan(mw / 2, mh / 2, 300);
            });
            canvas._dblClickAdded = true;
        }
        
        // Pan com teclado (WASD e setas)
        const keyLeft = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false);
        const keyRight = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false);
        const keyUp = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false);
        const keyDown = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false);
        const keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false);
        const keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false);
        const keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false);
        const keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
        
        scene.events.on('update', () => {
            // Não mover se campo de formulário em foco
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                return;
            }
            
            const speedBase = 18;
            const speed = speedBase / Math.max(cam.zoom, 0.1);
            
            if (keyLeft.isDown || keyA.isDown) cam.scrollX -= speed;
            if (keyRight.isDown || keyD.isDown) cam.scrollX += speed;
            if (keyUp.isDown || keyW.isDown) cam.scrollY -= speed;
            if (keyDown.isDown || keyS.isDown) cam.scrollY += speed;
        });
    }
    
    createClickableAreas(scene) {
        this.clickableAreas = {};
        
        this.mapData.tiles.forEach(tile => {
            const center = this.tileCenters[tile.id];
            if (!center) return;
            
            const zone = scene.add.zone(center.x, center.y, 400, 250);
            zone.setInteractive();
            zone.setData('tileId', tile.id);
            
            zone.on('pointerover', () => {
                if (this.isMoving && this.reachableTiles.has(tile.id)) {
                    scene.game.canvas.style.cursor = 'pointer';
                }
            });
            
            zone.on('pointerout', () => {
                scene.game.canvas.style.cursor = 'default';
            });
            
            zone.on('pointerdown', (pointer) => {
                if (pointer.leftButtonDown()) {
                    this.onTileClick(tile.id);
                }
            });
            
            this.clickableAreas[tile.id] = zone;
        });
    }
    
    update(scene) {
        // Loop de atualização (se necessário)
    }
    
    // === GERENCIAMENTO DE JOGADORES ===
    
    async addPlayer() {
        const name = this.ui.playerNameInput?.value?.trim();
        if (!name) {
            alert(window.i18n.get('errors.noName'));
            return;
        }
        
        if (this.players.length >= 6) {
            alert(window.i18n.get('errors.maxPlayers'));
            return;
        }
        
        if (!this.selectedCharacterId) {
            alert(window.i18n.get('errors.noCharacter'));
            return;
        }
        
        // Verificar se personagem já está em uso
        if (this.players.some(p => p.characterId === this.selectedCharacterId)) {
            alert(window.i18n.get('errors.characterInUse'));
            return;
        }
        
        const character = window.characterManager.getById(this.selectedCharacterId);
        if (!character) return;
        
        const playerState = window.characterManager.createPlayerState(character);
        
        const player = {
            id: Date.now(),
            name: name,
            characterId: this.selectedCharacterId,
            color: parseInt(character.color),
            position: 'path001', // Posição inicial no primeiro path do mapa
            state: playerState,
            token: null,
            hasMoved: false,
            cards: []
        };
        
        // Adicionar à lista local
        this.players.push(player);
        
        // Salvar no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.addPlayerToRoom({
                    odPlayerId: player.id,
                    name: player.name,
                    characterId: player.characterId,
                    color: player.color,
                    position: player.position,
                    state: player.state,
                    cards: player.cards,
                    turnOrder: this.players.length - 1
                });
            } catch (e) {
                console.error('Erro ao salvar jogador no Supabase:', e);
            }
        }
        
        // Reset form
        this.ui.playerNameInput.value = '';
        this.selectedCharacterId = null;
        this.ui.addPlayerBtn.disabled = true;
        this.ui.openCharacterSelectBtn.innerHTML = window.i18n.get('ui.selectCharacter');
        
        // Atualizar lista de setup
        this.updateSetupPlayersList();
        
        // Habilitar botão de iniciar se tiver pelo menos 1 jogador
        if (this.ui.btnStartGame) {
            this.ui.btnStartGame.disabled = this.players.length === 0;
        }
    }
    
    updateSetupPlayersList() {
        if (!this.ui.setupPlayersList) return;
        
        if (this.players.length === 0) {
            this.ui.setupPlayersList.innerHTML = '<div class="no-players-setup">Nenhum jogador adicionado ainda</div>';
            return;
        }
        
        let html = '';
        this.players.forEach(player => {
            const character = window.characterManager.getById(player.characterId);
            html += `
                <div class="setup-player-card" data-player-id="${player.id}">
                    <div class="player-avatar">${character.icon}</div>
                    <div class="player-info">
                        <div class="player-name">${player.name}</div>
                        <div class="character-name">${window.characterManager.getName(character)}</div>
                    </div>
                    <button class="btn-remove" onclick="game.removePlayerFromSetup(${player.id})">Remover</button>
                </div>
            `;
        });
        
        this.ui.setupPlayersList.innerHTML = html;
    }
    
    async removePlayerFromSetup(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.updateSetupPlayersList();
        
        // Remover do Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.removePlayerFromRoom(playerId);
            } catch (e) {
                console.error('Erro ao remover jogador do Supabase:', e);
            }
        }
        
        if (this.ui.btnStartGame) {
            this.ui.btnStartGame.disabled = this.players.length === 0;
        }
    }
    
    async startGame() {
        if (this.players.length === 0) {
            alert('Adicione pelo menos um jogador para iniciar!');
            return;
        }
        
        this.gameStarted = true;
        
        // Atualizar status no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.updateRoomStatus('playing');
            } catch (e) {
                console.error('Erro ao atualizar status no Supabase:', e);
            }
        }
        
        // Esconder área de setup
        if (this.ui.setupArea) {
            this.ui.setupArea.classList.add('hidden');
        }
        
        // Mostrar barra superior, jogadores e barra inferior
        if (this.ui.topBar) {
            this.ui.topBar.style.display = 'flex';
        }
        if (this.ui.bottomBar) {
            this.ui.bottomBar.style.display = 'flex';
        }
        
        // Criar tokens para todos os jogadores
        console.log('Criando tokens. gameScene:', !!this.gameScene, 'players:', this.players.length, 'tileCenters:', Object.keys(this.tileCenters).length);
        this.players.forEach(player => {
            console.log(`Criando token para jogador ${player.name}, posição ${player.position}`);
            this.createPlayerToken(player);
        });
        
        this.updateAllTokenPositions();
        this.updatePlayerList();
        this.updateTurnIndicator();
        this.showCharacterInfo(this.players[0]);
        this.startMovementPhase();
        this.saveGameState();
        
        this.addLogEntry('🎮 Partida iniciada! Boa sorte!');
    }
    
    initDecksIcons() {
        const decksIcons = document.getElementById('decksIcons');
        if (!decksIcons || !this.decksData) return;
        
        this.updateDecksDisplay();
    }
    
    updateDecksDisplay() {
        const decksIcons = document.getElementById('decksIcons');
        if (!decksIcons || !this.decksData) return;
        
        const deckMapping = {
            'verde': 'Verde',
            'amarelo': 'Amarelo',
            'laranja': 'Laranja',
            'russo': 'Russo',
            'personagens': 'Personagens'
        };
        
        let html = '';
        for (const [key, deck] of Object.entries(this.decksData.decks)) {
            const quantity = this.getDeckQuantity(key);
            const isEmpty = quantity === 0;
            const displayName = deckMapping[key] || deck.nameKey;
            
            html += `
                <div class="deck-icon ${isEmpty ? 'deck-empty' : ''}" 
                     style="background: ${deck.color}; opacity: ${isEmpty ? '0.3' : '1'};" 
                     title="${displayName} (${deck.minRoll}-${deck.maxRoll}) - ${quantity} cartas restantes"
                     data-deck="${key}"
                     data-quantity="${quantity}">
                    🃏
                    <span class="deck-count">${quantity}</span>
                </div>
            `;
        }
        
        decksIcons.innerHTML = html;
    }
    
    createPlayerToken(player) {
        if (!this.gameScene) {
            console.warn('gameScene não está pronta para criar token');
            return;
        }
        
        const center = this.tileCenters[player.position];
        if (!center) {
            console.warn(`Centro não encontrado para posição ${player.position}. Posições disponíveis:`, Object.keys(this.tileCenters));
            return;
        }
        
        const pos = this.getTokenPosition(player.position, player.id);
        const character = window.characterManager.getById(player.characterId);
        
        // Criar gráficos do token
        const glow = this.gameScene.add.graphics();
        glow.fillStyle(0x000000, 0.3);
        glow.fillCircle(5, 5, this.tokenRadius);
        
        const token = this.gameScene.add.graphics();
        token.fillStyle(player.color, 1);
        token.fillCircle(0, 0, this.tokenRadius);
        token.lineStyle(4, 0xffffff, 1);
        token.strokeCircle(0, 0, this.tokenRadius);
        
        // Adicionar ícone do personagem
        const iconText = this.gameScene.add.text(0, 0, character?.icon || '?', {
            fontSize: '60px',
            fontFamily: 'Arial'
        });
        iconText.setOrigin(0.5, 0.5);
        
        // Container
        const container = this.gameScene.add.container(pos.x, pos.y, [glow, token, iconText]);
        container.setData('playerId', player.id);
        
        player.token = container;
        this.tokenContainer.add(container);
    }
    
    getTokenPosition(tileId, playerId) {
        const center = this.tileCenters[tileId];
        if (!center) return { x: 0, y: 0 };
        
        const playersOnTile = this.players.filter(p => p.position === tileId);
        const playerIndex = playersOnTile.findIndex(p => p.id === playerId);
        const totalPlayers = playersOnTile.length;
        
        if (totalPlayers <= 1) {
            return { x: center.x, y: center.y };
        }
        
        const radius = this.tokenSpreadRadius;
        const angleStep = (2 * Math.PI) / totalPlayers;
        const angle = angleStep * playerIndex - Math.PI / 2;
        
        return {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
        };
    }
    
    updateAllTokenPositions() {
        this.players.forEach(player => {
            if (player.token && this.gameScene) {
                const pos = this.getTokenPosition(player.position, player.id);
                
                this.gameScene.tweens.add({
                    targets: player.token,
                    x: pos.x,
                    y: pos.y,
                    duration: 300,
                    ease: 'Power2'
                });
            }
        });
    }
    
    updatePlayerList() {
        const playersBar = this.ui.playersBar;
        if (!playersBar) return;
        
        playersBar.innerHTML = '';
        
        this.players.forEach((player, index) => {
            const character = window.characterManager.getById(player.characterId);
            const isCurrentTurn = index === this.currentPlayerIndex;
            
            const div = document.createElement('div');
            div.className = `player-card-top ${isCurrentTurn ? 'active-turn' : ''}`;
            div.innerHTML = `
                <div class="player-avatar">${character?.icon || '?'}</div>
                <div class="player-info">
                    <div class="player-name">${this.escapeHtml(player.name)}</div>
                    <div class="player-class">${window.characterManager.getName(character)}</div>
                    <div class="player-stats">
                        <span class="stat hp">❤️${player.state.currentHealth}/${player.state.maxHealth}</span>
                        <span class="stat mov">🦶${player.state.movement}</span>
                        <span class="stat dmg">⚔️${player.state.damage || 2}</span>
                    </div>
                </div>
            `;
            div.addEventListener('click', () => {
                this.focusOnPlayer(player);
                this.showCharacterInfo(player);
            });
            playersBar.appendChild(div);
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updateTurnIndicator() {
        const display = this.ui.currentPlayerDisplay;
        if (!display) return;
        
        const player = this.players[this.currentPlayerIndex];
        
        if (player) {
            const character = window.characterManager.getById(player.characterId);
            const colorHex = '#' + player.color.toString(16).padStart(6, '0');
            display.innerHTML = `${character?.icon || ''} ${player.name}`;
            display.style.color = colorHex;
        } else {
            display.textContent = '-';
            display.style.color = '#fff';
        }
    }
    
    showCharacterInfo(player) {
        if (!player) return;
        
        const character = window.characterManager.getById(player.characterId);
        if (!character) return;
        
        // Atualizar info do jogador atual
        const currentPlayerInfo = document.getElementById('currentPlayerInfo');
        if (currentPlayerInfo) {
            currentPlayerInfo.innerHTML = `
                <span class="player-icon">${character.icon}</span>
                <span class="player-name">${player.name} - ${window.characterManager.getName(character)}</span>
            `;
        }
        
        // Atualizar talentos
        const talentsList = document.getElementById('talentsList');
        if (talentsList && character.talents) {
            let html = '';
            character.talents.forEach(talent => {
                const name = window.i18n.get(talent.nameKey) || talent.id;
                const value = player.state[talent.id] || talent.levels[0];
                html += `
                    <div class="talent-item">
                        <span class="talent-name">${name}</span>
                        <span class="talent-value">${value}</span>
                    </div>
                `;
            });
            talentsList.innerHTML = html || '<div class="no-talents">Sem talentos</div>';
        }
        
        // Atualizar habilidades
        const abilitiesList = document.getElementById('abilitiesList');
        if (abilitiesList && character.abilities) {
            let html = '';
            character.abilities.forEach(ability => {
                const name = window.i18n.get(ability.nameKey) || ability.id;
                const desc = window.i18n.get(ability.descriptionKey) || '';
                const typeClass = ability.type === 'passive' ? 'passive' : '';
                html += `
                    <div class="ability-item ${typeClass}">
                        <div class="ability-name">${name}</div>
                        <div class="ability-type">${ability.type === 'passive' ? 'Passiva' : 'Ativa'}</div>
                        <div class="ability-desc">${desc}</div>
                    </div>
                `;
            });
            abilitiesList.innerHTML = html || '<div class="no-abilities">Sem habilidades</div>';
        }
    }
    
    focusOnPlayer(player) {
        if (!this.gameScene) return;
        
        const center = this.tileCenters[player.position];
        if (!center) return;
        
        this.gameScene.cameras.main.pan(center.x, center.y, 500, 'Power2');
    }
    
    // === MOVIMENTO FIXO ===
    
    startMovementPhase() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Se ainda não usou o movimento, iniciar automaticamente
        if (!this.currentTurnActions.movementUsed) {
            this.isMoving = true;
            this.selectedTile = null;
            
            this.calculateReachableTiles();
            this.highlightReachableTiles();
            
            this.addLogEntry(`🚶 ${currentPlayer.name} pode se mover até ${currentPlayer.state.movement} casas`);
        }
        
        // Atualizar botões de ação
        this.updateActionButtons();
    }
    
    startMovementAction() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer || this.currentTurnActions.movementUsed) return;
        
        // Verificar se o jogo começou
        if (!this.gameStarted) {
            this.showActionFeedback('❌ O jogo ainda não começou!');
            return;
        }
        
        this.isMoving = true;
        this.selectedTile = null;
        
        const movement = currentPlayer.state.movement;
        
        if (this.ui.movementPanel) {
            this.ui.movementPanel.style.display = 'block';
        }
        if (this.ui.maxMoves) {
            this.ui.maxMoves.textContent = movement;
        }
        if (this.ui.confirmMoveBtn) {
            this.ui.confirmMoveBtn.disabled = true;
        }
        if (this.ui.endTurnBtn) {
            this.ui.endTurnBtn.disabled = true;
        }
        
        this.calculateReachableTiles();
        this.highlightReachableTiles();
    }
    
    calculateReachableTiles() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        const startTile = currentPlayer.position;
        const maxDistance = currentPlayer.state.movement;
        
        // BFS para encontrar casas alcançáveis
        this.reachableTiles = new Map();
        const visited = new Set();
        const queue = [{ tile: startTile, distance: 0 }];
        visited.add(startTile);
        
        while (queue.length > 0) {
            const { tile, distance } = queue.shift();
            
            if (distance > 0 && distance <= maxDistance) {
                this.reachableTiles.set(tile, distance);
            }
            
            if (distance < maxDistance) {
                const connections = this.connections[tile] || [];
                for (const nextTile of connections) {
                    if (!visited.has(nextTile)) {
                        visited.add(nextTile);
                        queue.push({ tile: nextTile, distance: distance + 1 });
                    }
                }
            }
        }
    }
    
    highlightReachableTiles() {
        if (!this.highlightContainer || !this.gameScene) return;
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        const maxDistance = currentPlayer?.state?.movement || 3;
        
        this.highlightContainer.removeAll(true);
        
        this.reachableTiles.forEach((distance, tileId) => {
            const center = this.tileCenters[tileId];
            if (!center) return;
            
            // Cor baseada na distância
            const ratio = distance / maxDistance;
            const color = Phaser.Display.Color.Interpolate.ColorWithColor(
                { r: 0, g: 255, b: 100 },
                { r: 255, g: 200, b: 0 },
                100,
                ratio * 100
            );
            const hexColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
            
            const highlight = this.gameScene.add.graphics();
            highlight.fillStyle(hexColor, 0.3);
            highlight.fillCircle(center.x, center.y, 120);
            highlight.lineStyle(4, hexColor, 0.8);
            highlight.strokeCircle(center.x, center.y, 120);
            highlight.setData('tileId', tileId);
            
            this.highlightContainer.add(highlight);
            
            // Animação de pulso
            this.gameScene.tweens.add({
                targets: highlight,
                alpha: 0.5,
                duration: 800,
                yoyo: true,
                repeat: -1
            });
        });
    }
    
    highlightSelectedTile() {
        if (!this.selectedTile || !this.gameScene) return;
        
        const center = this.tileCenters[this.selectedTile];
        if (!center) return;
        
        // Remover seleção anterior
        this.highlightContainer.each(child => {
            if (child.getData('selected')) {
                child.destroy();
            }
        });
        
        // Criar destaque de seleção
        const selection = this.gameScene.add.graphics();
        selection.lineStyle(6, 0xffffff, 1);
        selection.strokeCircle(center.x, center.y, 130);
        selection.setData('selected', true);
        this.highlightContainer.add(selection);
    }
    
    async onTileClick(tileId) {
        if (!this.isMoving) return;
        if (!this.reachableTiles.has(tileId)) return;
        
        // Mover diretamente ao clicar
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Mover jogador
        const oldPosition = currentPlayer.position;
        currentPlayer.position = tileId;
        this.currentTurnActions.movementUsed = true;
        
        // Salvar posição no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.updatePlayerPosition(currentPlayer.id, tileId);
            } catch (e) {
                console.error('Erro ao salvar posição no Supabase:', e);
            }
        }
        
        // Atualizar visualmente
        this.updateAllTokenPositions();
        this.updatePlayerList();
        
        // Mover câmera para nova posição
        const center = this.tileCenters[tileId];
        if (center && this.gameScene) {
            this.gameScene.cameras.main.pan(center.x, center.y, 300, 'Power2');
        }
        
        // Log com nome do local
        const locationName = this.getLocationName(tileId);
        this.addLogEntry(`🚶 ${currentPlayer.name} moveu para ${locationName}`);
        
        // Finalizar movimento
        this.finishMove();
        this.updateActionButtons();
        this.saveGameState();
    }
    
    async confirmMove() {
        // Função mantida para compatibilidade, mas não é mais usada
        if (!this.selectedTile) return;
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Mover jogador
        currentPlayer.position = this.selectedTile;
        this.currentTurnActions.movementUsed = true;
        
        // Salvar posição no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.updatePlayerPosition(currentPlayer.id, this.selectedTile);
            } catch (e) {
                console.error('Erro ao salvar posição no Supabase:', e);
            }
        }
        
        this.updateAllTokenPositions();
        this.updatePlayerList();
        
        const center = this.tileCenters[this.selectedTile];
        if (center && this.gameScene) {
            this.gameScene.cameras.main.pan(center.x, center.y, 300, 'Power2');
        }
        
        this.addLogEntry(`🚶 ${currentPlayer.name} moveu para ${this.getLocationName(this.selectedTile)}`);
        
        this.finishMove();
        this.showActionPanel();
    }
    
    cancelMove() {
        if (this.highlightContainer) {
            this.highlightContainer.removeAll(true);
        }
        
        this.isMoving = false;
        this.selectedTile = null;
        this.reachableTiles.clear();
        
        if (this.ui.movementPanel) {
            this.ui.movementPanel.style.display = 'none';
        }
        
        // Mostrar painel de ações novamente
        this.showActionPanel();
    }
    
    finishMove() {
        if (this.highlightContainer) {
            this.highlightContainer.removeAll(true);
        }
        
        this.isMoving = false;
        this.selectedTile = null;
        this.reachableTiles.clear();
        
        if (this.ui.movementPanel) {
            this.ui.movementPanel.style.display = 'none';
        }
        
        this.saveGameState();
    }
    
    endTurn() {
        // Verificar se o jogo começou
        if (!this.gameStarted) {
            this.showActionFeedback('❌ O jogo ainda não começou!');
            return;
        }
        
        // Verificar se há jogadores
        if (this.players.length === 0) {
            this.showActionFeedback('❌ Nenhum jogador no jogo!');
            return;
        }
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        this.addLogEntry(`⏭️ ${currentPlayer?.name || 'Jogador'} finalizou o turno`);
        
        // Resetar ações do turno
        this.currentTurnActions = {
            movementUsed: false,
            mainActionUsed: false,
            bonusActions: []
        };
        
        this.nextTurn();
    }
    
    nextTurn() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.updateTurnIndicator();
        this.updatePlayerList();
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer) {
            // Processar montagens automáticas no início do turno
            this.processAutoMounting();
            
            this.focusOnPlayer(currentPlayer);
            this.showCharacterInfo(currentPlayer);
            this.updatePlayerCards(); // Atualizar cartas do novo jogador
            this.startMovementPhase();
        }
        
        this.saveGameState();
    }
    
    // === SISTEMA DE AÇÕES ===
    
    showActionPanel() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Atualizar status das ações
        this.updateActionButtons();
        
        // Habilitar botão de fim de turno
        const endTurnBtn = document.getElementById('btnEndTurn');
        if (endTurnBtn) {
            endTurnBtn.disabled = false;
        }
    }
    
    updateActionButtons() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        
        // Botão de rastrear - só habilitado em locais
        const btnTrack = document.getElementById('btnTrack');
        if (btnTrack && currentPlayer) {
            const isInLocation = this.isPlayerInLocation(currentPlayer);
            const mainActionUsed = this.currentTurnActions.mainActionUsed;
            btnTrack.disabled = !isInLocation || mainActionUsed || !this.gameStarted;
            btnTrack.classList.toggle('used', mainActionUsed);
            
            if (!isInLocation) {
                btnTrack.title = 'Rastrear (apenas em locais)';
            } else if (mainActionUsed) {
                btnTrack.title = 'Ação principal já usada';
            } else {
                btnTrack.title = 'Rastrear';
            }
        }
        
        // Botões legados (antigo painel)
        const movementBtn = document.getElementById('movementActionBtn');
        const mainActionSelect = document.getElementById('mainActionSelect');
        const executeMainActionBtn = document.getElementById('executeMainActionBtn');
        
        if (movementBtn) {
            movementBtn.disabled = this.currentTurnActions.movementUsed;
            movementBtn.innerHTML = this.currentTurnActions.movementUsed ? '✓ Movimento Usado' : '🚶 Usar Movimento';
        }
        
        if (mainActionSelect && executeMainActionBtn) {
            mainActionSelect.disabled = this.currentTurnActions.mainActionUsed;
            executeMainActionBtn.disabled = this.currentTurnActions.mainActionUsed || mainActionSelect.value === '';
            if (this.currentTurnActions.mainActionUsed) {
                mainActionSelect.innerHTML = '<option>✓ Ação Principal Usada</option>';
            }
        }
    }
    
    // === SISTEMA DE RASTREAMENTO ===
    
    executeTracking() {
        // Verificar se o jogo começou
        if (!this.gameStarted) {
            this.showActionFeedback('❌ O jogo ainda não começou!');
            return;
        }
        
        // Verificar se já usou ação principal
        if (this.currentTurnActions.mainActionUsed) {
            this.showActionFeedback('❌ Você já usou sua ação principal neste turno!');
            return;
        }
        
        // Verificar se está em um local (não em um path)
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        const isInLocation = this.isPlayerInLocation(currentPlayer);
        if (!isInLocation) {
            this.showActionFeedback('❌ Você só pode rastrear dentro de locais!');
            this.addLogEntry('🔍 Rastrear só funciona em locais, não em caminhos (paths)', 'error');
            return;
        }
        
        // Rolar d20 + bônus
        const character = window.characterManager.getById(currentPlayer.characterId);
        const trackingBonus = character?.talents?.find(t => t.id === 'tracking')?.levels[0] || 0;
        
        const diceRoll = Math.floor(Math.random() * 20) + 1;
        const totalResult = diceRoll + trackingBonus;
        
        this.addLogEntry(`🎲 ${currentPlayer.name} rolou ${diceRoll} (d20) + ${trackingBonus} (bônus) = ${totalResult}`);
        
        // Determinar deck disponível
        const availableDecks = this.getAvailableDecks(totalResult);
        
        if (availableDecks.length === 0) {
            this.showActionFeedback(`🎲 Resultado: ${totalResult} - Muito baixo!`);
            this.addLogEntry('❌ Resultado muito baixo! Nenhuma carta obtida.', 'error');
            this.currentTurnActions.mainActionUsed = true;
            this.updateActionButtons();
            this.saveGameState();
            return;
        }
        
        // Mostrar escolha de decks disponíveis
        this.showDeckSelection(availableDecks, totalResult);
    }
    
    showDeckSelection(availableDecks, totalResult) {
        // Criar overlay para seleção de deck
        const overlay = document.createElement('div');
        overlay.className = 'deck-selection-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
        `;
        
        const panel = document.createElement('div');
        panel.style.cssText = `
            background: var(--bg-card);
            border: 3px solid var(--border-color);
            border-radius: 15px;
            padding: 30px;
            max-width: 600px;
        `;
        
        panel.innerHTML = `
            <h3 style="color: var(--text-primary); margin-bottom: 10px; text-align: center;">
                🔍 Escolha um Deck
            </h3>
            <p style="color: var(--text-secondary); text-align: center; margin-bottom: 20px;">
                Resultado: ${totalResult}
            </p>
            <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;" id="deckChoices"></div>
        `;
        
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        
        const deckChoices = panel.querySelector('#deckChoices');
        availableDecks.forEach(deck => {
            const btn = document.createElement('button');
            btn.className = 'deck-choice-btn';
            btn.style.cssText = `
                background: ${deck.color};
                color: white;
                border: none;
                border-radius: 10px;
                padding: 20px 30px;
                font-size: 1.1rem;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                min-width: 120px;
            `;
            
            // Se o deck está vazio, mostrar de forma diferente
            if (deck.isEmpty) {
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
                btn.innerHTML = `🃏<br>${deck.name}<br><small>(${deck.range})</small><br><span style="color: #ef4444;">VAZIO</span>`;
            } else {
                btn.innerHTML = `🃏<br>${deck.name}<br><small>(${deck.range})</small><br><span style="font-size: 0.8rem;">${deck.quantity} restantes</span>`;
                
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'scale(1.1)';
                    btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'scale(1)';
                    btn.style.boxShadow = 'none';
                });
                
                btn.addEventListener('click', () => {
                    this.selectDeck(deck.id, deck.name);
                    overlay.remove();
                });
            }
            
            deckChoices.appendChild(btn);
        });
    }
    
    async selectDeck(deckId, deckName) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Verificar se o deck está vazio
        if (this.isDeckEmpty(deckId)) {
            this.showActionFeedback(`❌ Deck ${deckName} está vazio!`);
            return;
        }
        
        // Sortear carta do deck
        const card = this.drawCardFromDeck(deckId, deckName);
        
        // Decrementar quantidade do deck
        if (!this.decrementDeck(deckId)) {
            this.showActionFeedback(`❌ Deck ${deckName} está vazio!`);
            return;
        }
        
        // Adicionar carta ao jogador
        if (!currentPlayer.cards) {
            currentPlayer.cards = [];
        }
        currentPlayer.cards.push(card);
        
        // Salvar carta no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.addCardToPlayer(currentPlayer.id, card);
            } catch (e) {
                console.error('Erro ao salvar carta no Supabase:', e);
            }
        }
        
        // Feedback visual
        this.showActionFeedback(`🃏 ${deckName}: ${card.name}`);
        this.addLogEntry(`🃏 Obteve carta do deck ${deckName}: ${card.name} (${this.getDeckQuantity(deckId)} restantes)`);
        
        // Marcar ação principal como usada
        this.currentTurnActions.mainActionUsed = true;
        
        // Atualizar UI
        this.updatePlayerCards();
        this.updateActionButtons();
        this.saveGameState();
    }
    
    rollTrackingDice() {
        const diceDisplay = document.getElementById('diceDisplay');
        if (!diceDisplay) return;
        
        // Animação de rolagem
        let rolls = 0;
        const maxRolls = 10;
        const interval = setInterval(() => {
            const tempRoll = Math.floor(Math.random() * 20) + 1;
            diceDisplay.innerHTML = `<span class="dice-face">${tempRoll}</span>`;
            rolls++;
            
            if (rolls >= maxRolls) {
                clearInterval(interval);
                
                // Resultado final
                const currentPlayer = this.players[this.currentPlayerIndex];
                const character = window.characterManager.getById(currentPlayer?.characterId);
                const trackingBonus = character?.talents?.find(t => t.id === 'tracking')?.levels[0] || 0;
                
                const diceRoll = Math.floor(Math.random() * 20) + 1;
                const totalResult = diceRoll + trackingBonus;
                
                diceDisplay.innerHTML = `<span class="dice-face">${diceRoll}</span>`;
                
                // Mostrar resultado
                this.showTrackingResult(diceRoll, trackingBonus, totalResult);
            }
        }, 100);
    }
    
    showTrackingResult(diceRoll, bonus, total) {
        const phaseRoll = document.getElementById('trackingPhaseRoll');
        const phaseResult = document.getElementById('trackingPhaseResult');
        const resultSpan = document.getElementById('diceResult');
        const deckSelection = document.getElementById('deckSelection');
        
        if (phaseRoll) phaseRoll.hidden = true;
        if (phaseResult) phaseResult.hidden = false;
        if (resultSpan) resultSpan.textContent = `${total} (${diceRoll}+${bonus})`;
        
        // Determinar decks disponíveis
        const availableDecks = this.getAvailableDecks(total);
        
        if (deckSelection) {
            let html = '';
            availableDecks.forEach(deck => {
                html += `
                    <button class="deck-choice" style="background: ${deck.color};" 
                            onclick="game.selectTrackingDeck('${deck.name}')">
                        🃏 ${deck.name}
                    </button>
                `;
            });
            
            if (availableDecks.length === 0) {
                html = '<p class="no-deck">Resultado muito baixo! Nenhum deck disponível.</p>';
            }
            
            deckSelection.innerHTML = html;
        }
        
        this.addLogEntry(`🎲 Rastreamento: ${total} (d20: ${diceRoll} + bônus: ${bonus})`);
    }
    
    // === SISTEMA DE MONTAGEM ===
    
    openMountingPanel() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        // Verificar se tem cartas para montar
        const unmountedCards = (currentPlayer.cards || []).filter(card => 
            card.mounting && !card.mounted && card.mountingProgress === 0
        );
        
        const mountingCards = (currentPlayer.cards || []).filter(card => 
            card.mounting && !card.mounted && card.mountingProgress > 0
        );
        
        if (unmountedCards.length === 0 && mountingCards.length === 0) {
            this.showActionFeedback('❌ Nenhuma carta disponível para montar!');
            return;
        }
        
        // Criar overlay de montagem
        const overlay = document.createElement('div');
        overlay.id = 'mountingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const character = window.characterManager.getById(currentPlayer.characterId);
        const playerTalents = this.getPlayerTalents(currentPlayer);
        
        let cardsHtml = '';
        
        // Cartas em progresso de montagem
        if (mountingCards.length > 0) {
            cardsHtml += '<h4 style="color: #f59e0b; margin: 15px 0;">🔧 Em Montagem</h4>';
            mountingCards.forEach((card, index) => {
                const originalIndex = currentPlayer.cards.indexOf(card);
                const roundsRemaining = this.getMountingRoundsRemaining(card, playerTalents);
                cardsHtml += this.createMountingCardHtml(card, originalIndex, playerTalents, 'progress', roundsRemaining);
            });
        }
        
        // Cartas disponíveis para iniciar montagem
        if (unmountedCards.length > 0) {
            cardsHtml += '<h4 style="color: #22c55e; margin: 15px 0;">📦 Disponíveis para Montar</h4>';
            unmountedCards.forEach((card, index) => {
                const originalIndex = currentPlayer.cards.indexOf(card);
                const roundsNeeded = this.calculateMountingRounds(card, playerTalents);
                cardsHtml += this.createMountingCardHtml(card, originalIndex, playerTalents, 'available', roundsNeeded);
            });
        }
        
        overlay.innerHTML = `
            <div style="
                background: #0f0f23;
                border: 2px solid #333366;
                border-radius: 16px;
                padding: 25px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                color: white;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">🔧 Sistema de Montagem</h3>
                    <button onclick="this.closest('#mountingOverlay').remove()" style="
                        background: #ef4444;
                        border: none;
                        color: white;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 1rem;
                    ">✕</button>
                </div>
                
                <p style="color: #a0a0c0; margin-bottom: 15px; font-size: 0.9rem;">
                    Montar cartas requer talentos específicos. Se você tem o talento, o tempo é reduzido!
                </p>
                
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${cardsHtml}
                </div>
                
                <div style="margin-top: 20px; text-align: center;">
                    <button onclick="this.closest('#mountingOverlay').remove()" style="
                        background: #333366;
                        border: none;
                        color: white;
                        padding: 10px 30px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                    ">Fechar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }
    
    createMountingCardHtml(card, cardIndex, playerTalents, status, rounds) {
        const deckColors = {
            'Verde': '#22c55e',
            'Amarelo': '#eab308',
            'Laranja': '#f97316',
            'Russo': '#ef4444',
            'Personagens': '#8b5cf6'
        };
        const color = deckColors[card.deck] || '#666';
        
        // Verificar talentos necessários
        const requiredTalents = card.mounting?.requiredTalents || [];
        const hasTalent = this.playerHasMountingTalent(requiredTalents, playerTalents);
        const talentNames = requiredTalents.map(t => window.i18n.get(`talent.${t}.name`) || t).join(' ou ');
        
        let statusHtml = '';
        let actionButton = '';
        
        if (status === 'progress') {
            const progress = card.mountingProgress || 0;
            const total = this.calculateMountingRounds(card, playerTalents);
            statusHtml = `
                <div style="background: #1a1a2e; padding: 8px; border-radius: 6px; margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Progresso:</span>
                        <span>${progress}/${total} rodadas</span>
                    </div>
                    <div style="background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: #22c55e; height: 100%; width: ${(progress/total)*100}%;"></div>
                    </div>
                </div>
            `;
            actionButton = `
                <button onclick="game.advanceMounting(${cardIndex})" style="
                    background: #f59e0b;
                    border: none;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    margin-top: 8px;
                ">⏳ Continuar (+1 rodada)</button>
            `;
        } else {
            statusHtml = `
                <div style="font-size: 0.85rem; color: #a0a0c0; margin-top: 5px;">
                    ⏱️ Tempo: <strong>${rounds} rodada${rounds > 1 ? 's' : ''}</strong>
                    ${hasTalent ? '<span style="color: #22c55e;"> (bônus de talento!)</span>' : ''}
                </div>
            `;
            actionButton = `
                <button onclick="game.startMounting(${cardIndex})" style="
                    background: #22c55e;
                    border: none;
                    color: white;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    margin-top: 8px;
                ">🔧 Iniciar Montagem</button>
            `;
        }
        
        return `
            <div style="
                background: #252545;
                border: 2px solid ${color};
                border-radius: 10px;
                padding: 12px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-weight: bold; font-size: 1rem;">${card.name}</div>
                        <div style="font-size: 0.8rem; color: #a0a0c0;">${card.type}</div>
                        <div style="font-size: 0.85rem; margin-top: 5px;">${card.effect}</div>
                    </div>
                    <div style="
                        background: ${color};
                        color: white;
                        padding: 3px 8px;
                        border-radius: 4px;
                        font-size: 0.7rem;
                        font-weight: bold;
                    ">${card.deck}</div>
                </div>
                
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333366;">
                    <div style="font-size: 0.8rem; color: ${hasTalent ? '#22c55e' : '#f59e0b'};">
                        📋 Talento necessário: <strong>${talentNames}</strong>
                        ${hasTalent ? ' ✓' : ''}
                    </div>
                    ${statusHtml}
                    ${actionButton}
                </div>
            </div>
        `;
    }
    
    getPlayerTalents(player) {
        if (!player) return {};
        const character = window.characterManager.getById(player.characterId);
        if (!character) return {};
        
        const talents = {};
        (character.talents || []).forEach((talent, index) => {
            const level = player.state?.talentLevels?.[talent.id] || 0;
            talents[talent.id] = {
                level: level,
                value: talent.levels[level] || talent.levels[0]
            };
        });
        return talents;
    }
    
    playerHasMountingTalent(requiredTalents, playerTalents) {
        return requiredTalents.some(talentId => 
            playerTalents[talentId] && playerTalents[talentId].level > 0
        );
    }
    
    getBestMountingTalent(requiredTalents, playerTalents) {
        if (!requiredTalents || requiredTalents.length === 0) return 1;
        
        let bestRounds = Infinity;
        
        for (const talentId of requiredTalents) {
            let rounds;
            
            // Se jogador tem o talento, usar o valor específico dele
            if (playerTalents[talentId] && playerTalents[talentId].mountingRounds !== undefined) {
                rounds = playerTalents[talentId].mountingRounds;
            } else {
                // Sem talento: usar valor padrão
                rounds = this.defaultMountingRounds?.[talentId] || 5;
            }
            
            // Pegar o melhor (menor número de rodadas)
            bestRounds = Math.min(bestRounds, rounds);
        }
        
        return bestRounds === Infinity ? 1 : bestRounds;
    }
    
    calculateMountingRounds(card, playerTalents) {
        if (!card.mounting || !card.mounting.requiredTalents) return 1;
        
        const requiredTalents = card.mounting.requiredTalents || [];
        
        // getBestMountingTalent agora retorna o número de rodadas diretamente
        return this.getBestMountingTalent(requiredTalents, playerTalents);
    }
    
    getMountingRoundsRemaining(card, playerTalents) {
        const totalRounds = this.calculateMountingRounds(card, playerTalents);
        const progress = card.mountingProgress || 0;
        return Math.max(0, totalRounds - progress);
    }
    
    startMounting(cardIndex) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.cards[cardIndex]) return;
        
        // Verificar se está em um local (não em caminho)
        const isInLocation = this.isPlayerInLocation(currentPlayer);
        if (!isInLocation) {
            this.showActionFeedback('❌ Você só pode montar itens em locais!');
            return;
        }
        
        const card = currentPlayer.cards[cardIndex];
        
        // Verificar se já está montando ou montada
        if (card.mounted) {
            this.showActionFeedback('❌ Carta já montada!');
            return;
        }
        
        if (card.mountingProgress > 0) {
            this.showActionFeedback('❌ Montagem já iniciada!');
            return;
        }
        
        const playerTalents = this.getPlayerTalents(currentPlayer);
        const totalRounds = this.calculateMountingRounds(card, playerTalents);
        
        // Se totalRounds = 0, montar instantaneamente SEM consumir ação principal
        if (totalRounds === 0) {
            card.mounted = true;
            card.mountingProgress = 0;
            this.showActionFeedback(`✅ ${card.name} montada instantaneamente!`);
            this.addLogEntry(`🔧 ${currentPlayer.name} montou ${card.name} instantaneamente!`);
            this.updatePlayerCards();
            this.saveGameState();
            
            // Reabrir painel
            const overlay = document.getElementById('mountingOverlay');
            if (overlay) {
                overlay.remove();
                this.openMountingPanel();
            }
            return;
        }
        
        // Verificar se já usou ação principal (apenas se totalRounds > 0)
        if (this.currentTurnActions.mainActionUsed) {
            this.showActionFeedback('❌ Ação principal já usada neste turno!');
            return;
        }
        
        // Iniciar montagem
        card.mountingProgress = 1;
        
        // Marcar ação principal como usada
        this.currentTurnActions.mainActionUsed = true;
        this.updateActionButtons();
        
        // Verificar se já terminou (1 rodada)
        if (card.mountingProgress >= totalRounds) {
            card.mounted = true;
            card.mountingProgress = 0;
            this.showActionFeedback(`✅ ${card.name} montada instantaneamente!`);
            this.addLogEntry(`🔧 ${currentPlayer.name} montou ${card.name}!`);
        } else {
            this.showActionFeedback(`🔧 Iniciando montagem de ${card.name} (${card.mountingProgress}/${totalRounds})`);
            this.addLogEntry(`🔧 ${currentPlayer.name} começou a montar ${card.name}`);
        }
        
        // Atualizar UI
        this.updatePlayerCards();
        this.saveGameState();
        
        // Reabrir painel
        const overlay = document.getElementById('mountingOverlay');
        if (overlay) {
            overlay.remove();
            this.openMountingPanel();
        }
    }
    
    advanceMounting(cardIndex) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.cards[cardIndex]) return;
        
        // Verificar se está em um local (não em caminho)
        const isInLocation = this.isPlayerInLocation(currentPlayer);
        if (!isInLocation) {
            this.showActionFeedback('❌ Você só pode montar itens em locais!');
            return;
        }
        
        // Verificar se já usou ação principal
        if (this.currentTurnActions.mainActionUsed) {
            this.showActionFeedback('❌ Ação principal já usada neste turno!');
            return;
        }
        
        const card = currentPlayer.cards[cardIndex];
        
        if (card.mounted) {
            this.showActionFeedback('❌ Carta já montada!');
            return;
        }
        
        if (!card.mountingProgress || card.mountingProgress === 0) {
            this.showActionFeedback('❌ Montagem não iniciada!');
            return;
        }
        
        // Avançar montagem
        card.mountingProgress++;
        
        // Marcar ação principal como usada
        this.currentTurnActions.mainActionUsed = true;
        this.updateActionButtons();
        
        const playerTalents = this.getPlayerTalents(currentPlayer);
        const totalRounds = this.calculateMountingRounds(card, playerTalents);
        
        // Verificar se terminou
        if (card.mountingProgress >= totalRounds) {
            card.mounted = true;
            card.mountingProgress = 0;
            this.showActionFeedback(`✅ ${card.name} montada com sucesso!`);
            this.addLogEntry(`🔧 ${currentPlayer.name} terminou de montar ${card.name}!`);
        } else {
            this.showActionFeedback(`🔧 Progresso: ${card.mountingProgress}/${totalRounds}`);
            this.addLogEntry(`🔧 ${currentPlayer.name} continua montando ${card.name} (${card.mountingProgress}/${totalRounds})`);
        }
        
        // Atualizar UI
        this.updatePlayerCards();
        this.saveGameState();
        
        // Reabrir painel
        const overlay = document.getElementById('mountingOverlay');
        if (overlay) {
            overlay.remove();
            this.openMountingPanel();
        }
    }
    
    // Processar montagens no início de cada turno (avançar automaticamente cartas em montagem)
    processAutoMounting() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.cards) return;
        
        // Apenas atualizar UI, não avançar automaticamente
        // A montagem deve ser avançada manualmente pelo jogador usando ação principal
        let hasCardsInProgress = false;
        
        currentPlayer.cards.forEach(card => {
            if (card.mounting && !card.mounted && card.mountingProgress > 0) {
                hasCardsInProgress = true;
            }
        });
        
        if (hasCardsInProgress) {
            this.addLogEntry(`🔧 ${currentPlayer.name} tem itens em montagem`);
        }
        
        this.updatePlayerCards();
    }
    
    getAvailableDecks(result) {
        const decks = [];
        
        if (!this.decksData || !this.decksData.decks) return decks;
        
        const deckMapping = {
            'verde': 'Verde',
            'amarelo': 'Amarelo',
            'laranja': 'Laranja',
            'russo': 'Russo',
            'personagens': 'Personagens'
        };
        
        for (const [key, deck] of Object.entries(this.decksData.decks)) {
            if (result >= deck.minRoll && result <= deck.maxRoll) {
                const quantity = this.getDeckQuantity(key);
                const isEmpty = quantity === 0;
                
                decks.push({
                    id: key,
                    name: deckMapping[key] || deck.nameKey,
                    color: deck.color,
                    range: `${deck.minRoll}${deck.minRoll !== deck.maxRoll ? '-' + deck.maxRoll : ''}`,
                    quantity: quantity,
                    isEmpty: isEmpty
                });
            }
        }
        
        return decks;
    }
    
    drawCardFromDeck(deckId, deckName) {
        // Obter cartas do deck do JSON
        if (this.decksData && this.decksData.decks && this.decksData.decks[deckId]) {
            const deckData = this.decksData.decks[deckId];
            const cards = deckData.cards || [];
            
            if (cards.length === 0) {
                // Fallback se não houver cartas definidas
                return { 
                    name: 'Carta Misteriosa', 
                    type: 'item', 
                    effect: 'Efeito desconhecido',
                    deck: deckName,
                    mounted: false,
                    mounting: null
                };
            }
            
            // Criar pool de cartas baseado nas quantidades disponíveis
            const availableCards = [];
            const cardQtys = this.cardQuantities[deckId] || {};
            
            for (const card of cards) {
                const qtyLeft = cardQtys[card.id] || 0;
                for (let i = 0; i < qtyLeft; i++) {
                    availableCards.push(card);
                }
            }
            
            if (availableCards.length === 0) {
                console.warn('⚠️ Nenhuma carta disponível no deck:', deckId);
                return null;
            }
            
            // Sortear uma carta aleatória do pool disponível
            const randomIndex = Math.floor(Math.random() * availableCards.length);
            const cardData = availableCards[randomIndex];
            
            // Decrementar a quantidade dessa carta específica
            if (cardQtys[cardData.id] > 0) {
                cardQtys[cardData.id]--;
            }
            
            // Obter nome e descrição traduzidos
            const cardName = window.i18n.get(cardData.nameKey) || cardData.id;
            const cardDesc = window.i18n.get(cardData.descriptionKey) || 'Sem descrição';
            
            // Criar objeto mounting se a carta tiver talentos requeridos
            let mounting = null;
            if (cardData.requiredTalents) {
                mounting = {
                    requiredTalents: cardData.requiredTalents
                };
            }
            
            return {
                name: cardName,
                type: cardData.type || 'item',
                effect: cardDesc,
                deck: deckName,
                deckId: deckId,
                id: cardData.id,
                mounted: false,
                mountingProgress: 0,
                mounting: mounting
            };
        }
        
        // Fallback: Definição de cartas hardcoded (caso o JSON não carregue)
        const deckCards = {
            'verde': [
                { name: 'Poção de Cura', type: 'item', effect: '+2 HP' },
                { name: 'Tocha', type: 'item', effect: 'Ilumina área' },
                { name: 'Corda', type: 'item', effect: 'Útil para exploração' },
                { name: 'Comida', type: 'item', effect: 'Recupera energia' },
                { name: 'Mapa Parcial', type: 'informação', effect: 'Revela caminho' }
            ],
            'amarelo': [
                { name: 'Arma Comum', type: 'equipamento', effect: '+1 Dano' },
                { name: 'Armadura Leve', type: 'equipamento', effect: '+1 Defesa' },
                { name: 'Poção Média', type: 'item', effect: '+4 HP' },
                { name: 'Grimório Básico', type: 'item', effect: '+1 Magia' },
                { name: 'Amuleto', type: 'equipamento', effect: '+1 Sorte' }
            ],
            'laranja': [
                { name: 'Arma Rara', type: 'equipamento', effect: '+2 Dano' },
                { name: 'Armadura Média', type: 'equipamento', effect: '+2 Defesa' },
                { name: 'Poção Grande', type: 'item', effect: '+6 HP' },
                { name: 'Pergaminho Mágico', type: 'magia', effect: 'Feitiço único' },
                { name: 'Talismã', type: 'equipamento', effect: '+2 Resistência' }
            ],
            'russo': [
                { name: 'Arma Épica', type: 'equipamento', effect: '+3 Dano' },
                { name: 'Armadura Pesada', type: 'equipamento', effect: '+3 Defesa' },
                { name: 'Elixir Raro', type: 'item', effect: '+8 HP e +2 Energia' },
                { name: 'Livro Antigo', type: 'conhecimento', effect: 'Habilidade especial' },
                { name: 'Relíquia', type: 'equipamento', effect: 'Poder único' }
            ],
            'personagens': [
                { name: 'Aliado Misterioso', type: 'personagem', effect: 'NPC ajuda em combate' },
                { name: 'Mentor', type: 'personagem', effect: '+1 XP permanente' },
                { name: 'Comerciante', type: 'personagem', effect: 'Vende itens raros' },
                { name: 'Informante', type: 'personagem', effect: 'Revela segredos' },
                { name: 'Guardião', type: 'personagem', effect: 'Proteção especial' }
            ]
        };
        
        const cards = deckCards[deckId] || deckCards['verde'];
        const randomIndex = Math.floor(Math.random() * cards.length);
        const card = { ...cards[randomIndex], deck: deckName };
        
        return card;
    }
    
    updatePlayerCards() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        const cardsScroll = document.getElementById('playerCardsScroll');
        if (!cardsScroll) return;
        
        if (!currentPlayer.cards || currentPlayer.cards.length === 0) {
            cardsScroll.innerHTML = '<div class="no-cards">Nenhuma carta</div>';
            return;
        }
        
        // Agrupar cartas iguais (mesmo id e mesmo status de montagem)
        const groupedCards = this.groupCards(currentPlayer.cards);
        
        const deckColors = {
            'Verde': '#22c55e',
            'Amarelo': '#eab308',
            'Laranja': '#f97316',
            'Russo': '#ef4444',
            'Personagens': '#8b5cf6'
        };
        
        let html = '';
        groupedCards.forEach((group) => {
            const card = group.cards[0]; // Pegar primeira carta do grupo como referência
            const quantity = group.cards.length;
            const color = deckColors[card.deck] || '#666';
            const indices = group.indices.join(','); // Índices das cartas no grupo
            
            // Determinar status visual da carta
            let statusIcon = '';
            let statusClass = '';
            let statusKey = group.statusKey;
            
            if (statusKey === 'ready') {
                // Carta não precisa de montagem - pronta para usar
                statusIcon = '⚡';
                statusClass = 'card-ready';
            } else if (statusKey === 'mounted') {
                statusIcon = '✅';
                statusClass = 'card-mounted';
            } else if (statusKey === 'mounting') {
                statusIcon = '🔧';
                statusClass = 'card-mounting';
            } else {
                // unmounted
                statusIcon = '📦';
                statusClass = 'card-unmounted';
            }
            
            // Nome curto (primeiras palavras)
            const shortName = this.getShortCardName(card.name);
            
            // Emoji placeholder baseado no tipo/deck
            const placeholderEmoji = this.getCardPlaceholderEmoji(card);
            
            html += `
                <div class="player-card ${statusClass}" 
                     style="border-color: ${color};" 
                     data-card-indices="${indices}"
                     data-card-id="${card.id}"
                     data-status="${statusKey}">
                    ${quantity > 1 ? `<span class="card-quantity">${quantity}</span>` : ''}
                    <div class="card-image-area">
                        <span class="card-image-placeholder">${placeholderEmoji}</span>
                        <span class="card-status-badge">${statusIcon}</span>
                    </div>
                    <div class="card-name-area">
                        <span class="card-name-short" title="${card.name}">${shortName}</span>
                    </div>
                </div>
            `;
        });
        
        cardsScroll.innerHTML = html;
        
        // Adicionar event listeners para hover/tooltip
        this.setupCardHoverListeners(cardsScroll, currentPlayer);
    }
    
    // Agrupar cartas iguais (mesmo id e mesmo status)
    groupCards(cards) {
        const groups = new Map();
        
        cards.forEach((card, index) => {
            // Determinar status da carta
            let statusKey = 'unmounted';
            if (card.mounting === null) {
                statusKey = 'ready'; // Não precisa montar
            } else if (card.mounted) {
                statusKey = 'mounted';
            } else if (card.mountingProgress > 0) {
                statusKey = 'mounting';
            }
            
            // Chave única: id + status
            const key = `${card.id}_${statusKey}`;
            
            if (!groups.has(key)) {
                groups.set(key, {
                    cards: [],
                    indices: [],
                    statusKey: statusKey
                });
            }
            
            groups.get(key).cards.push(card);
            groups.get(key).indices.push(index);
        });
        
        return Array.from(groups.values());
    }
    
    // Obter nome curto da carta (max 10 caracteres)
    getShortCardName(name) {
        if (!name) return '???';
        if (name.length <= 10) return name;
        
        // Tentar pegar primeira palavra
        const words = name.split(' ');
        const firstWord = words[0];
        
        if (firstWord.length <= 10) {
            return firstWord;
        }
        
        // Se primeira palavra é muito longa, truncar
        return name.substring(0, 9) + '…';
    }
    
    // Obter emoji placeholder para a carta (baseado no tipo)
    getCardPlaceholderEmoji(card) {
        // Emojis baseados no ID ou tipo da carta
        const emojiMap = {
            // Veículos
            'verde_bicicleta': '🚲',
            'verde_barco': '⛵',
            // Armas
            'verde_taco': '🏑',
            'verde_lanca': '🔱',
            // Tecnologia
            'verde_computador': '💻',
            'verde_internet': '🌐',
            'verde_walkie': '📻',
            // Itens
            'verde_medkit': '🏥',
            'verde_raspadinha': '🎫',
            'verde_pilha': '🔋',
            'verde_pisca': '💡',
            'verde_walkman': '🎧',
            'verde_mapa': '🗺️',
            'verde_fosforo': '🪔'
        };
        
        if (emojiMap[card.id]) {
            return emojiMap[card.id];
        }
        
        // Fallback baseado no tipo
        const typeEmojis = {
            'Veículo': '🚗',
            'Arma': '⚔️',
            'Ferramenta': '🔧',
            'Consumível': '✨',
            'Equipamento': '🎒',
            'Item': '📦'
        };
        
        return typeEmojis[card.type] || '🃏';
    }
    
    // Configurar listeners de hover nas cartas
    setupCardHoverListeners(container, player) {
        const cardElements = container.querySelectorAll('.player-card');
        
        cardElements.forEach(cardEl => {
            let tooltipTimeout = null;
            let currentTooltip = null;
            
            cardEl.addEventListener('mouseenter', (e) => {
                // Pequeno delay antes de mostrar tooltip
                tooltipTimeout = setTimeout(() => {
                    const indices = cardEl.dataset.cardIndices.split(',').map(Number);
                    const firstIndex = indices[0];
                    const card = player.cards[firstIndex];
                    const status = cardEl.dataset.status;
                    const quantity = indices.length;
                    
                    currentTooltip = this.showCardTooltip(e, card, status, indices, quantity);
                }, 200);
            });
            
            cardEl.addEventListener('mouseleave', () => {
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                }
                // Dar um pequeno delay antes de remover para permitir mover para o tooltip
                setTimeout(() => {
                    if (currentTooltip && !currentTooltip.matches(':hover')) {
                        currentTooltip.remove();
                        currentTooltip = null;
                    }
                }, 100);
            });
            
            // Click também mostra tooltip (para mobile)
            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const indices = cardEl.dataset.cardIndices.split(',').map(Number);
                const firstIndex = indices[0];
                const card = player.cards[firstIndex];
                const status = cardEl.dataset.status;
                const quantity = indices.length;
                
                // Remover tooltips existentes
                this.removeCardTooltips();
                currentTooltip = this.showCardTooltip(e, card, status, indices, quantity);
            });
        });
        
        // Fechar tooltip ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.player-card') && !e.target.closest('.card-tooltip')) {
                this.removeCardTooltips();
            }
        }, { once: false });
    }
    
    // Mostrar tooltip expandido da carta
    showCardTooltip(event, card, status, indices, quantity) {
        // Remover tooltips existentes
        this.removeCardTooltips();
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        const deckColors = {
            'Verde': '#22c55e',
            'Amarelo': '#eab308',
            'Laranja': '#f97316',
            'Russo': '#ef4444',
            'Personagens': '#8b5cf6'
        };
        const color = deckColors[card.deck] || '#666';
        
        // Determinar texto de status
        let statusText = '';
        let statusIconLarge = '';
        
        if (status === 'ready') {
            statusText = '⚡ Pronta para usar';
            statusIconLarge = '⚡';
        } else if (status === 'mounted') {
            statusText = '✅ Montada';
            statusIconLarge = '✅';
        } else if (status === 'mounting') {
            const firstCard = currentPlayer.cards[indices[0]];
            const playerTalents = this.getPlayerTalents(currentPlayer);
            const totalRounds = this.calculateMountingRounds(firstCard, playerTalents);
            statusText = `🔧 Montando (${firstCard.mountingProgress}/${totalRounds})`;
            statusIconLarge = '🔧';
        } else {
            statusText = '📦 Não montada';
            statusIconLarge = '📦';
        }
        
        // Criar tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'card-tooltip';
        tooltip.style.borderColor = color;
        
        // Determinar botões de ação
        let actionsHtml = '';
        const firstIndex = indices[0];
        const isInLocation = this.isPlayerInLocation(currentPlayer);
        const mainActionUsed = this.currentTurnActions.mainActionUsed;
        
        if (status === 'ready' || status === 'mounted') {
            // Carta pronta ou montada - botão usar
            actionsHtml = `<button class="tooltip-btn btn-use" data-action="use" data-index="${firstIndex}">Usar</button>`;
        } else if (status === 'mounting') {
            // Em montagem - botão continuar
            const canContinue = isInLocation && !mainActionUsed;
            actionsHtml = `<button class="tooltip-btn btn-continue" data-action="continue" data-index="${firstIndex}" ${!canContinue ? 'disabled' : ''}>
                ${canContinue ? 'Continuar Montagem' : (mainActionUsed ? 'Ação já usada' : 'Vá a um local')}
            </button>`;
        } else if (status === 'unmounted') {
            // Não montada - botão montar
            const canMount = isInLocation && !mainActionUsed;
            actionsHtml = `<button class="tooltip-btn btn-mount" data-action="mount" data-index="${firstIndex}" ${!canMount ? 'disabled' : ''}>
                ${canMount ? 'Montar' : (mainActionUsed ? 'Ação já usada' : 'Vá a um local')}
            </button>`;
        }
        
        tooltip.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${statusIconLarge}</span>
                <div class="tooltip-title">
                    <div class="tooltip-name">${card.name}${quantity > 1 ? ` (x${quantity})` : ''}</div>
                    <div class="tooltip-type">${card.type}</div>
                </div>
            </div>
            <div class="tooltip-status ${status}">${statusText}</div>
            <div class="tooltip-effect">${card.effect || 'Sem efeito especial'}</div>
            ${actionsHtml ? `<div class="tooltip-actions">${actionsHtml}</div>` : ''}
        `;
        
        document.body.appendChild(tooltip);
        
        // Posicionar tooltip
        const rect = event.target.closest('.player-card').getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        let top = rect.top - tooltipRect.height - 10;
        
        // Ajustar se sair da tela
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 10) {
            top = rect.bottom + 10; // Mostrar abaixo se não couber acima
        }
        
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        
        // Event listeners dos botões
        tooltip.querySelectorAll('.tooltip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const cardIndex = parseInt(btn.dataset.index);
                
                this.removeCardTooltips();
                
                if (action === 'mount') {
                    this.startMounting(cardIndex);
                } else if (action === 'continue') {
                    this.advanceMounting(cardIndex);
                } else if (action === 'use') {
                    this.useCard(cardIndex);
                }
            });
        });
        
        // Permitir que o tooltip permaneça ao passar o mouse sobre ele
        tooltip.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (tooltip && !tooltip.matches(':hover')) {
                    tooltip.remove();
                }
            }, 100);
        });
        
        return tooltip;
    }
    
    // Remover todos os tooltips de carta
    removeCardTooltips() {
        document.querySelectorAll('.card-tooltip').forEach(t => t.remove());
    }
    
    // Usar uma carta (consumível ou arma)
    async useCard(cardIndex) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.cards[cardIndex]) return;
        
        const card = currentPlayer.cards[cardIndex];
        
        if (card.consumable) {
            // Usar e remover carta consumível
            this.showActionFeedback(`✨ Usou ${card.name}!`);
            this.addLogEntry(`✨ ${currentPlayer.name} usou ${card.name}`);
            
            // Remover carta
            const cardId = card.id;
            currentPlayer.cards.splice(cardIndex, 1);
            
            // Remover carta do Supabase
            if (window.supabaseManager?.isConnected()) {
                try {
                    await window.supabaseManager.removeCardFromPlayer(currentPlayer.id, cardId);
                } catch (e) {
                    console.error('Erro ao remover carta do Supabase:', e);
                }
            }
            
            this.updatePlayerCards();
            this.saveGameState();
        } else if (card.damage) {
            // Arma - mostrar que está equipada
            this.showActionFeedback(`⚔️ Equipou ${card.name} (Dano: ${card.damage})`);
            this.addLogEntry(`⚔️ ${currentPlayer.name} equipou ${card.name}`);
        }
    }

    
    
    selectTrackingDeck(deckName) {
        this.addLogEntry(`🃏 Escolheu o deck ${deckName}!`);
        
        // Marcar ação principal como usada
        this.currentTurnActions.mainActionUsed = true;
        this.updateActionButtons();
        
        // Fechar overlay
        this.closeTrackingOverlay();
        
        // TODO: Implementar lógica de comprar carta do deck
    }
    
    executeMainAction() {
        const select = document.getElementById('mainActionSelect');
        if (!select || select.value === '' || this.currentTurnActions.mainActionUsed) return;
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        const action = select.value;
        this.currentTurnActions.mainActionUsed = true;
        
        // Mostrar feedback ao jogador
        this.showActionFeedback(`Ação Principal: ${select.options[select.selectedIndex].text}`);
        this.addLogEntry(`⚔️ ${currentPlayer.name} executou: ${action}`);
        
        this.updateActionButtons();
        this.saveGameState();
    }
    
    executeBonusAction() {
        const select = document.getElementById('bonusActionSelect');
        if (!select || select.value === '') return;
        
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (!currentPlayer) return;
        
        const action = select.value;
        
        // Verificar se já usou esta ação bônus
        if (this.currentTurnActions.bonusActions.includes(action)) {
            this.showActionFeedback('Você já usou esta ação bônus!');
            return;
        }
        
        this.currentTurnActions.bonusActions.push(action);
        
        // Mostrar feedback ao jogador
        this.showActionFeedback(`Ação Bônus: ${select.options[select.selectedIndex].text}`);
        this.addLogEntry(`✨ ${currentPlayer.name} usou ação bônus: ${action}`);
        
        select.value = '';
        this.saveGameState();
    }
    
    async clearSavedGame() {
        if (confirm('Limpar jogo salvo? Isso removerá todos os jogadores e reiniciará o jogo.')) {
            // Limpar jogadores atuais no Supabase
            if (window.supabaseManager?.isConnected()) {
                try {
                    const players = await window.supabaseManager.getPlayersInRoom();
                    for (const player of players) {
                        await window.supabaseManager.removePlayerFromRoom(player.player_id);
                    }
                    await window.supabaseManager.updateRoomState({
                        current_player_index: 0,
                        current_turn_actions: null,
                        deck_quantities: null,
                        card_quantities: null,
                        status: 'waiting'
                    });
                } catch (e) {
                    console.error('Erro ao limpar estado no Supabase:', e);
                }
            }
            
            // Limpar jogadores locais
            this.players.forEach(p => {
                if (p.token) p.token.destroy();
            });
            this.players = [];
            
            // Resetar estado
            this.gameStarted = false;
            this.currentPlayerIndex = 0;
            this.currentTurnActions = {
                movementUsed: false,
                mainActionUsed: false,
                bonusActions: []
            };
            
            // Atualizar UI
            this.updateSetupPlayersList();
            if (this.ui.btnStartGame) {
                this.ui.btnStartGame.disabled = true;
            }
            
            this.addLogEntry('🗑️ Jogo salvo limpo!');
        }
    }
    
    showActionFeedback(message) {
        // Criar elemento de feedback temporário
        const feedback = document.createElement('div');
        feedback.className = 'action-feedback';
        feedback.textContent = message;
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: #4CAF50;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 1.2rem;
            font-weight: bold;
            z-index: 10000;
            animation: fadeInOut 2s ease-in-out;
        `;
        
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            feedback.remove();
        }, 2000);
    }
    
    // === ESTADO DO JOGO ===
    
    async resetGame() {
        if (this.players.length === 0) return;
        if (!confirm(window.i18n.get('ui.confirmReset') || 'Resetar o jogo?')) return;
        
        this.handleGameReset();
        
        // Limpar estado no Supabase
        if (window.supabaseManager?.isConnected()) {
            try {
                await window.supabaseManager.updateRoomState({
                    current_player_index: 0,
                    current_turn_actions: null,
                    status: 'waiting'
                });
            } catch (e) {
                console.error('Erro ao resetar estado no Supabase:', e);
            }
        }
        
        this.addLogEntry('🔄 Jogo resetado');
    }
    
    resetUI() {
        if (this.ui.playersBar) {
            this.ui.playersBar.innerHTML = '';
        }
        if (this.ui.currentPlayerDisplay) {
            this.ui.currentPlayerDisplay.textContent = '-';
            this.ui.currentPlayerDisplay.style.color = '#fff';
        }
        if (this.ui.movementPanel) {
            this.ui.movementPanel.style.display = 'none';
        }
        if (this.ui.addPlayerBtn) {
            this.ui.addPlayerBtn.disabled = true;
        }
        if (this.ui.openCharacterSelectBtn) {
            this.ui.openCharacterSelectBtn.innerHTML = window.i18n.get('ui.selectCharacter');
        }
        // Resetar botão de fim de turno
        const endTurnBtn = document.getElementById('btnEndTurn');
        if (endTurnBtn) {
            endTurnBtn.disabled = true;
        }
        // Mostrar setup novamente
        if (this.ui.setupArea) {
            this.ui.setupArea.classList.remove('hidden');
        }
        if (this.ui.topBar) {
            this.ui.topBar.style.display = 'none';
        }
        if (this.ui.bottomBar) {
            this.ui.bottomBar.style.display = 'none';
        }
    }
    
    async saveGameState() {
        try {
            // Salvar estado no Supabase (para multiplayer)
            if (window.supabaseManager?.isConnected()) {
                // Atualizar estado da sala
                await window.supabaseManager.updateCurrentTurn(
                    this.currentPlayerIndex,
                    this.currentTurnActions
                );
                
                // Atualizar quantidades dos decks
                await window.supabaseManager.updateDeckQuantities(
                    this.deckQuantities,
                    this.cardQuantities
                );
                
                // Atualizar cada jogador no banco
                for (const player of this.players) {
                    await window.supabaseManager.addPlayerToRoom({
                        odPlayerId: player.id,
                        name: player.name,
                        characterId: player.characterId,
                        color: player.color,
                        position: player.position,
                        state: player.state,
                        cards: player.cards || [],
                        turnOrder: this.players.indexOf(player)
                    });
                }
            }
        } catch (e) {
            console.error('Erro ao salvar estado:', e);
        }
    }
    
    async loadGameState() {
        // Carregar estado do Supabase (para multiplayer)
        if (!window.supabaseManager?.isConnected()) return;
        
        try {
            const room = window.supabaseManager.currentRoom;
            if (!room) return;
            
            // Carregar estado da sala
            this.currentPlayerIndex = room.current_player_index || 0;
            this.currentTurnActions = room.current_turn_actions || {
                movementUsed: false,
                mainActionUsed: false,
                bonusActions: []
            };
            this.gameStarted = room.status === 'playing';
            
            // Restaurar quantidades dos decks
            if (room.deck_quantities) {
                this.deckQuantities = room.deck_quantities;
                this.updateDecksDisplay();
            }
            
            // Restaurar quantidades das cartas individuais
            if (room.card_quantities) {
                this.cardQuantities = room.card_quantities;
            }
            
            // Carregar jogadores do banco
            const dbPlayers = await window.supabaseManager.getPlayersInRoom();
            
            // Recriar jogadores
            dbPlayers.forEach(dbPlayer => {
                // Converter formato do banco para formato do jogo
                const p = window.supabaseManager.dbPlayerToGamePlayer(dbPlayer);
                
                // Migrar posições antigas (números) para novas (pathXXX)
                let position = p.position;
                if (typeof position === 'number') {
                    position = 'path001'; // Resetar para posição inicial
                }
                // Validar se a posição existe
                if (position && !this.tileCenters[position]) {
                    console.warn(`Posição inválida ${position} para jogador ${p.name}, resetando para path001`);
                    position = 'path001';
                }
                
                const player = {
                    id: p.id,
                    name: p.name,
                    characterId: p.characterId,
                    color: p.color,
                    position: position,
                    state: p.state,
                    cards: p.cards || [],
                    token: null
                };
                this.players.push(player);
                this.createPlayerToken(player);
            });
            
            this.updatePlayerList();
            this.updateAllTokenPositions();
            
            if (this.gameStarted) {
                this.updateTurnIndicator();
                
                const currentPlayer = this.players[this.currentPlayerIndex];
                if (currentPlayer) {
                    this.showCharacterInfo(currentPlayer);
                    this.showActionPanel();
                    this.updatePlayerCards(); // Atualizar cartas ao carregar
                }
                
                // Esconder setup se jogo já começou
                if (this.ui.setupArea) {
                    this.ui.setupArea.classList.add('hidden');
                }
                if (this.ui.topBar) {
                    this.ui.topBar.style.display = 'flex';
                }
                if (this.ui.bottomBar) {
                    this.ui.bottomBar.style.display = 'flex';
                }
            } else {
                // Jogo não começou - mostrar setup
                if (this.ui.setupArea) {
                    this.ui.setupArea.classList.remove('hidden');
                }
                if (this.ui.topBar) {
                    this.ui.topBar.style.display = 'none';
                }
                if (this.ui.bottomBar) {
                    this.ui.bottomBar.style.display = 'none';
                }
                
                // Atualizar lista de setup se houver jogadores salvos
                if (this.players.length > 0) {
                    this.updateSetupPlayersList();
                    if (this.ui.btnStartGame) {
                        this.ui.btnStartGame.disabled = false;
                    }
                }
            }
            
            // Focar no jogador atual
            setTimeout(() => {
                if (this.players.length > 0 && this.gameStarted) {
                    this.focusOnPlayer(this.players[this.currentPlayerIndex]);
                }
            }, 500);
        } catch (e) {
            console.error('Erro ao carregar estado do Supabase:', e);
        }
    }
}

// Iniciar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.game = new MundoSombrioGame();
});

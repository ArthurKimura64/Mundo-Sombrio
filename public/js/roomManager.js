// Mundo Sombrio - Room/Lobby Manager
// Gerencia interface de salas e lobby

class RoomManager {
    constructor() {
        this.rooms = [];
        this.currentRoom = null;
        this.isHost = false;
        this.currentScreen = 'lobby'; // 'lobby', 'waiting', 'game'
    }

    init() {
        this.addLobbyStyles();
        this.setupEventListeners();
        this.loadRooms();
        this.updateConnectionStatus();
    }

    addLobbyStyles() {
        if (document.getElementById('lobbyStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'lobbyStyles';
        styles.textContent = `
            /* ========== LOBBY SCREEN ========== */
            .lobby-screen {
                position: fixed;
                inset: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                padding: 20px;
                overflow-y: auto;
            }

            .lobby-screen.hidden { display: none; }

            .lobby-background {
                position: fixed;
                inset: 0;
                background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%);
                z-index: -1;
            }

            .fog-layer {
                position: absolute;
                inset: 0;
                background: 
                    radial-gradient(ellipse at 20% 80%, rgba(233, 69, 96, 0.1) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(96, 69, 233, 0.1) 0%, transparent 50%);
                animation: fogMove 20s ease-in-out infinite;
            }

            @keyframes fogMove {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.1); }
            }

            .lobby-wrapper {
                max-width: 1000px;
                width: 100%;
            }

            /* Header */
            .lobby-header {
                text-align: center;
                margin-bottom: 40px;
            }

            .logo-container {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
            }

            .logo-icon {
                font-size: 3.5rem;
                animation: float 3s ease-in-out infinite;
            }

            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }

            .logo-text {
                font-size: 3rem;
                font-weight: 700;
                color: #e94560;
                text-shadow: 0 0 40px rgba(233, 69, 96, 0.6);
                margin: 0;
            }

            .tagline {
                color: #888;
                margin-top: 10px;
                font-size: 1.1rem;
            }

            /* Main Content */
            .lobby-main {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
            }

            @media (max-width: 768px) {
                .lobby-main {
                    grid-template-columns: 1fr;
                }
            }

            .lobby-panel {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            /* Panel Cards */
            .panel-card {
                background: rgba(26, 26, 46, 0.9);
                border: 1px solid rgba(233, 69, 96, 0.3);
                border-radius: 16px;
                overflow: hidden;
                backdrop-filter: blur(10px);
                transition: all 0.3s;
            }

            .panel-card:hover {
                border-color: rgba(233, 69, 96, 0.5);
                box-shadow: 0 10px 40px rgba(233, 69, 96, 0.15);
            }

            .panel-card.full-height {
                flex: 1;
                min-height: 400px;
            }

            .panel-card.compact .panel-body {
                padding: 15px 20px;
            }

            .panel-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(233, 69, 96, 0.1);
            }

            .panel-header.small {
                padding: 15px 20px;
            }

            .panel-header h2, .panel-header h3 {
                margin: 0;
                color: #fff;
                font-size: 1.2rem;
            }

            .panel-icon {
                font-size: 1.5rem;
            }

            .panel-body {
                padding: 20px;
            }

            .panel-body.horizontal {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }

            .panel-body.rooms-body {
                padding: 0;
                flex: 1;
                display: flex;
                flex-direction: column;
            }

            /* Forms */
            .form-group {
                margin-bottom: 15px;
            }

            .form-group label {
                display: block;
                color: #aaa;
                font-size: 0.85rem;
                margin-bottom: 6px;
            }

            .form-group input,
            .form-group select {
                width: 100%;
                padding: 12px 15px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                background: rgba(0, 0, 0, 0.3);
                color: #fff;
                font-size: 1rem;
                transition: all 0.3s;
            }

            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #e94560;
                box-shadow: 0 0 15px rgba(233, 69, 96, 0.3);
            }

            .form-group input::placeholder {
                color: #666;
            }

            .form-row {
                display: flex;
                gap: 15px;
            }

            .form-group.half {
                flex: 1;
            }

            .code-input {
                width: 100px !important;
                text-align: center;
                font-family: monospace;
                font-size: 1.2rem !important;
                letter-spacing: 3px;
                text-transform: uppercase;
            }

            /* Checkbox */
            .checkbox-wrapper {
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                color: #ccc;
                padding-top: 25px;
            }

            .checkbox-wrapper input[type="checkbox"] {
                width: 20px;
                height: 20px;
                accent-color: #e94560;
            }

            /* Divider */
            .divider {
                display: flex;
                align-items: center;
                gap: 15px;
                color: #555;
            }

            .divider::before,
            .divider::after {
                content: '';
                flex: 1;
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
            }

            /* Buttons */
            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 10px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            .btn-primary {
                background: linear-gradient(135deg, #e94560 0%, #c92a4a 100%);
                color: #fff;
            }

            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 20px rgba(233, 69, 96, 0.4);
            }

            .btn-secondary {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }

            .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: #e94560;
            }

            .btn-ghost {
                background: transparent;
                color: #888;
                padding: 8px 16px;
            }

            .btn-ghost:hover {
                color: #fff;
            }

            .btn-glow {
                width: 100%;
                padding: 15px;
                font-size: 1.1rem;
            }

            .btn-glow:hover {
                box-shadow: 0 0 30px rgba(233, 69, 96, 0.5);
            }

            .btn-icon {
                width: 40px;
                height: 40px;
                padding: 0;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s;
            }

            .btn-icon:hover {
                background: rgba(233, 69, 96, 0.2);
                border-color: #e94560;
            }

            .refresh-btn {
                margin-left: auto;
            }

            .refresh-btn:hover .refresh-icon {
                animation: spinOnce 0.5s ease;
            }

            @keyframes spinOnce {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            /* Rooms List */
            .rooms-list {
                flex: 1;
                overflow-y: auto;
                padding: 15px;
            }

            .room-card {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 12px;
                border: 1px solid transparent;
                margin-bottom: 10px;
                transition: all 0.3s;
                cursor: pointer;
            }

            .room-card:hover {
                border-color: #e94560;
                background: rgba(233, 69, 96, 0.1);
                transform: translateX(5px);
            }

            .room-card .room-info {
                flex: 1;
            }

            .room-card .room-name {
                font-weight: 600;
                color: #fff;
                font-size: 1.05rem;
            }

            .room-card .room-host {
                color: #888;
                font-size: 0.85rem;
                margin-top: 3px;
            }

            .room-card .room-players {
                color: #e94560;
                font-weight: 700;
                font-size: 1.1rem;
                padding: 5px 12px;
                background: rgba(233, 69, 96, 0.15);
                border-radius: 20px;
            }

            .rooms-loading, .no-rooms {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
                color: #666;
                text-align: center;
                height: 100%;
            }

            .mini-spinner {
                width: 30px;
                height: 30px;
                border: 3px solid rgba(233, 69, 96, 0.2);
                border-top-color: #e94560;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 15px;
            }

            .empty-icon {
                font-size: 3rem;
                margin-bottom: 15px;
                opacity: 0.5;
            }

            .no-rooms p {
                margin: 0;
                color: #888;
            }

            .no-rooms small {
                color: #555;
            }

            /* Footer */
            .lobby-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .connection-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85rem;
                color: #888;
            }

            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #888;
            }

            .status-dot.online {
                background: #4ade80;
                box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
            }

            .status-dot.offline {
                background: #f87171;
            }

            /* ========== WAITING ROOM ========== */
            .waiting-room {
                position: fixed;
                inset: 0;
                background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%);
                z-index: 1000;
                display: flex;
                flex-direction: column;
            }

            .waiting-room.hidden { display: none; }

            .waiting-wrapper {
                flex: 1;
                display: flex;
                flex-direction: column;
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
                width: 100%;
            }

            .waiting-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .back-btn {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .room-info h2 {
                margin: 0;
                color: #fff;
            }

            .room-code-display {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 5px;
            }

            .room-code-display span {
                color: #888;
                font-size: 0.9rem;
            }

            .room-code-display code {
                background: rgba(233, 69, 96, 0.2);
                color: #e94560;
                padding: 5px 15px;
                border-radius: 6px;
                font-size: 1.2rem;
                font-weight: 700;
                letter-spacing: 3px;
            }

            .copy-btn {
                font-size: 1rem;
            }

            .waiting-main {
                flex: 1;
                display: grid;
                grid-template-columns: 1fr 300px;
                gap: 20px;
                padding: 20px 0;
                overflow: hidden;
            }

            @media (max-width: 768px) {
                .waiting-main {
                    grid-template-columns: 1fr;
                }
            }

            /* Players Grid */
            .players-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
                align-content: start;
            }

            .player-slot {
                background: rgba(255, 255, 255, 0.05);
                border: 2px dashed rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                min-height: 120px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                transition: all 0.3s;
            }

            .player-slot.occupied {
                background: rgba(233, 69, 96, 0.1);
                border: 2px solid rgba(233, 69, 96, 0.4);
            }

            .player-slot.host {
                border-color: #f59e0b;
                background: rgba(245, 158, 11, 0.1);
            }

            .player-slot .player-avatar {
                font-size: 2.5rem;
                margin-bottom: 8px;
            }

            .player-slot .player-name {
                color: #fff;
                font-weight: 600;
            }

            .player-slot .player-role {
                font-size: 0.75rem;
                color: #f59e0b;
                margin-top: 3px;
            }

            .player-slot.empty {
                color: #555;
            }

            /* Chat */
            .waiting-chat {
                background: rgba(0, 0, 0, 0.3);
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .chat-messages {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .chat-system {
                color: #888;
                font-size: 0.85rem;
                text-align: center;
                padding: 5px;
            }

            .chat-message {
                background: rgba(255, 255, 255, 0.05);
                padding: 8px 12px;
                border-radius: 8px;
            }

            .chat-message .author {
                color: #e94560;
                font-weight: 600;
                font-size: 0.85rem;
            }

            .chat-message .text {
                color: #ddd;
                margin-top: 3px;
            }

            .chat-input-area {
                display: flex;
                gap: 10px;
                padding: 15px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .chat-input-area input {
                flex: 1;
                padding: 10px 15px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.3);
                color: #fff;
            }

            /* Waiting Footer */
            .waiting-footer {
                padding-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                text-align: center;
            }

            .host-controls .btn-large {
                padding: 18px 40px;
                font-size: 1.2rem;
            }

            /* Toast */
            .toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .toast {
                background: rgba(26, 26, 46, 0.95);
                border: 1px solid #e94560;
                border-radius: 10px;
                padding: 15px 20px;
                color: #fff;
                animation: slideIn 0.3s ease;
                box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
            }

            .toast.success { border-color: #4ade80; }
            .toast.error { border-color: #f87171; }

            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;

        document.head.appendChild(styles);
    }

    setupEventListeners() {
        // === LOBBY ===
        // Criar sala
        document.getElementById('btnCreateRoom')?.addEventListener('click', () => this.createRoom());

        // Entrar por código
        document.getElementById('btnJoinByCode')?.addEventListener('click', () => this.joinByCode());

        // Enter nas inputs
        document.getElementById('roomCodeInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinByCode();
        });

        document.getElementById('createRoomName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('createPlayerName')?.focus();
        });

        document.getElementById('createPlayerName')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });

        // Atualizar lista
        document.getElementById('btnRefreshRooms')?.addEventListener('click', () => {
            const btn = document.getElementById('btnRefreshRooms');
            btn?.classList.add('spinning');
            this.loadRooms().then(() => {
                setTimeout(() => btn?.classList.remove('spinning'), 500);
            });
        });

        // Modo offline
        document.getElementById('btnOfflineMode')?.addEventListener('click', () => this.startLocalMode());

        // Auto-uppercase no código
        document.getElementById('roomCodeInput')?.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });

        // === WAITING ROOM ===
        document.getElementById('btnLeaveLobby')?.addEventListener('click', () => this.leaveRoom());
        document.getElementById('btnCopyCode')?.addEventListener('click', () => this.copyRoomCode());
        document.getElementById('btnStartMatch')?.addEventListener('click', () => this.startMatch());
        document.getElementById('btnSendChat')?.addEventListener('click', () => this.sendChatMessage());
        
        document.getElementById('waitingChatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // === SUPABASE EVENTS ===
        window.supabaseManager.on('roomJoined', (data) => this.onRoomJoined(data));
        window.supabaseManager.on('roomLeft', () => this.onRoomLeft());
        window.supabaseManager.on('playerJoined', (data) => this.onPlayerJoined(data));
        window.supabaseManager.on('playerLeft', (data) => this.onPlayerLeft(data));
        window.supabaseManager.on('presenceSync', (players) => this.updatePlayersList(players));
        window.supabaseManager.on('chatMessage', (data) => this.onChatMessage(data));
        window.supabaseManager.on('gameStarted', () => this.onGameStarted());
    }

    // === ROOM MANAGEMENT ===

    async loadRooms() {
        const listElement = document.getElementById('roomsList');
        const noRoomsEl = document.getElementById('noRoomsMessage');
        if (!listElement) return;

        listElement.innerHTML = `
            <div class="rooms-loading">
                <div class="mini-spinner"></div>
                <span>Buscando salas...</span>
            </div>
        `;
        noRoomsEl?.classList.add('hidden');

        try {
            const rooms = await window.supabaseManager.listRooms();
            this.rooms = rooms;
            this.renderRoomsList(rooms);
        } catch (error) {
            console.error('Erro ao carregar salas:', error);
            listElement.innerHTML = '';
            if (noRoomsEl) {
                noRoomsEl.classList.remove('hidden');
                noRoomsEl.innerHTML = `
                    <span class="empty-icon">⚠️</span>
                    <p>Erro ao carregar salas</p>
                    <small>Tente novamente</small>
                `;
            }
        }
    }

    renderRoomsList(rooms) {
        const listElement = document.getElementById('roomsList');
        const noRoomsEl = document.getElementById('noRoomsMessage');
        if (!listElement) return;

        if (!rooms || rooms.length === 0) {
            listElement.innerHTML = '';
            noRoomsEl?.classList.remove('hidden');
            return;
        }

        noRoomsEl?.classList.add('hidden');
        listElement.innerHTML = rooms.map(room => `
            <div class="room-card" data-code="${room.code}">
                <div class="room-info">
                    <div class="room-name">${this.escapeHtml(room.name)}</div>
                    <div class="room-host">🎮 ${this.escapeHtml(room.host_name)}</div>
                </div>
                <div class="room-players">${room.current_players}/${room.max_players}</div>
                <button class="btn btn-primary btn-join-room" data-code="${room.code}">
                    Entrar
                </button>
            </div>
        `).join('');

        // Event listeners
        listElement.querySelectorAll('.btn-join-room').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.promptJoinRoom(btn.dataset.code);
            });
        });
    }

    async createRoom() {
        const roomName = document.getElementById('createRoomName')?.value.trim();
        const hostName = document.getElementById('createPlayerName')?.value.trim();
        const maxPlayers = parseInt(document.getElementById('maxPlayers')?.value || '6');
        const isPrivate = document.getElementById('isPrivateRoom')?.checked || false;

        if (!roomName) {
            this.showToast('Digite um nome para a sala', 'error');
            return;
        }

        if (!hostName) {
            this.showToast('Digite seu nome', 'error');
            return;
        }

        const btn = document.getElementById('btnCreateRoom');
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="mini-spinner" style="width:20px;height:20px;border-width:2px;"></span> Criando...';
            }

            const room = await window.supabaseManager.createRoom(roomName, hostName, maxPlayers, isPrivate);
            
            if (room) {
                this.isHost = true;
                this.currentRoom = room;
            }
        } catch (error) {
            this.showToast(error.message || 'Erro ao criar sala', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="btn-icon">🚀</span><span>Criar Sala</span>';
            }
        }
    }

    promptJoinRoom(code) {
        const existingName = document.getElementById('joinPlayerName')?.value.trim() ||
                           document.getElementById('createPlayerName')?.value.trim();
        
        const playerName = existingName || prompt('Digite seu nome:');
        
        if (playerName) {
            this.joinRoom(code, playerName);
        }
    }

    async joinByCode() {
        const code = document.getElementById('roomCodeInput')?.value.trim().toUpperCase();
        const playerName = document.getElementById('joinPlayerName')?.value.trim();

        if (!code) {
            this.showToast('Digite o código da sala', 'error');
            return;
        }

        if (!playerName) {
            this.showToast('Digite seu nome', 'error');
            return;
        }

        await this.joinRoom(code, playerName);
    }

    async joinRoom(code, playerName) {
        const btn = document.getElementById('btnJoinByCode');
        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Entrando...';
            }

            await window.supabaseManager.joinRoom(code, playerName);
            this.isHost = false;
        } catch (error) {
            this.showToast(error.message || 'Erro ao entrar na sala', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Entrar';
            }
        }
    }

    async leaveRoom() {
        try {
            await window.supabaseManager.leaveRoom();
        } catch (error) {
            console.error('Erro ao sair:', error);
        }
        this.showScreen('lobby');
        this.loadRooms();
    }

    startLocalMode() {
        this.isHost = true;
        window.supabaseManager.playerId = 'local_player';
        window.supabaseManager.playerName = 'Jogador Local';
        
        // Ir para tela do jogo e mostrar setup
        this.showScreen('game');
        
        if (window.game) {
            window.game.isMultiplayer = false;
            
            // Mostrar área de setup para adicionar jogadores
            const setupArea = document.getElementById('setupArea');
            if (setupArea) {
                setupArea.classList.remove('hidden');
            }
            
            // Resetar estado do jogo
            window.game.gameStarted = false;
            window.game.players = [];
            window.game.updateSetupPlayersList();
        }
    }

    async startMatch() {
        if (!this.isHost) return;
        
        try {
            await window.supabaseManager.startGame();
        } catch (error) {
            this.showToast('Erro ao iniciar partida', 'error');
        }
    }

    // === EVENT HANDLERS ===

    onRoomJoined(data) {
        this.currentRoom = data.room;
        this.showScreen('waiting');
        this.updateWaitingRoom();
    }

    onRoomLeft() {
        this.currentRoom = null;
        this.isHost = false;
    }

    onPlayerJoined(data) {
        this.addChatSystemMessage(`👤 ${data.players?.[0]?.playerName || 'Jogador'} entrou na sala`);
    }

    onPlayerLeft(data) {
        this.addChatSystemMessage(`👋 ${data.players?.[0]?.playerName || 'Jogador'} saiu da sala`);
    }

    onChatMessage(data) {
        this.addChatMessage(data.from, data.message);
    }

    onGameStarted() {
        this.showScreen('game');
    }

    // === UI METHODS ===

    showScreen(screen) {
        this.currentScreen = screen;
        
        document.getElementById('lobbyScreen')?.classList.toggle('hidden', screen !== 'lobby');
        document.getElementById('waitingRoom')?.classList.toggle('hidden', screen !== 'waiting');
        document.getElementById('gameScreen')?.classList.toggle('hidden', screen !== 'game');
    }

    updateWaitingRoom() {
        if (!this.currentRoom) return;

        // Update room info
        const nameEl = document.getElementById('waitingRoomName');
        const codeEl = document.getElementById('waitingRoomCode');
        
        if (nameEl) nameEl.textContent = this.currentRoom.name;
        if (codeEl) codeEl.textContent = this.currentRoom.code;

        // Show/hide host controls
        const hostControls = document.getElementById('hostControls');
        if (hostControls) {
            hostControls.style.display = this.isHost ? 'block' : 'none';
        }

        // Update start button
        const startBtn = document.getElementById('btnStartMatch');
        if (startBtn && this.isHost) {
            startBtn.disabled = (this.currentRoom.current_players || 0) < 1;
        }
    }

    updatePlayersList(players) {
        const container = document.getElementById('waitingPlayersList');
        if (!container || !this.currentRoom) return;

        const maxPlayers = this.currentRoom.max_players || 6;
        const slots = [];

        // Occupied slots
        players.forEach((p, i) => {
            const isHost = p.playerId === this.currentRoom.host_player_id;
            slots.push(`
                <div class="player-slot occupied ${isHost ? 'host' : ''}">
                    <div class="player-avatar">👤</div>
                    <div class="player-name">${this.escapeHtml(p.playerName || 'Jogador')}</div>
                    ${isHost ? '<div class="player-role">👑 Host</div>' : ''}
                </div>
            `);
        });

        // Empty slots
        for (let i = players.length; i < maxPlayers; i++) {
            slots.push(`
                <div class="player-slot empty">
                    <div class="player-avatar">👤</div>
                    <div class="player-name">Aguardando...</div>
                </div>
            `);
        }

        container.innerHTML = slots.join('');

        // Update start button
        const startBtn = document.getElementById('btnStartMatch');
        if (startBtn && this.isHost) {
            startBtn.disabled = players.length < 1;
        }
    }

    copyRoomCode() {
        const code = this.currentRoom?.code;
        if (!code) return;

        navigator.clipboard.writeText(code).then(() => {
            this.showToast('Código copiado!', 'success');
        }).catch(() => {
            this.showToast('Erro ao copiar', 'error');
        });
    }

    sendChatMessage() {
        const input = document.getElementById('waitingChatInput');
        const message = input?.value.trim();
        
        if (!message) return;
        
        window.supabaseManager.sendChatMessage(message);
        input.value = '';
    }

    addChatMessage(author, text) {
        const container = document.getElementById('waitingChatMessages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-message';
        msg.innerHTML = `
            <div class="author">${this.escapeHtml(author)}</div>
            <div class="text">${this.escapeHtml(text)}</div>
        `;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    addChatSystemMessage(text) {
        const container = document.getElementById('waitingChatMessages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-system';
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    updateConnectionStatus() {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;

        const isConnected = window.supabaseManager?.isConnected();
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');

        if (dot) {
            dot.classList.toggle('online', isConnected);
            dot.classList.toggle('offline', !isConnected);
        }
        if (text) {
            text.textContent = isConnected ? 'Conectado' : 'Offline';
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Instância global
window.roomManager = new RoomManager();

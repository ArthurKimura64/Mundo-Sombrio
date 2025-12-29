// Mundo Sombrio - Supabase Client Manager
// Gerencia conexão com Supabase e comunicação em tempo real
// Funciona diretamente do cliente (sem backend) - compatível com GitHub Pages

class SupabaseManager {
    constructor() {
        this.supabase = null;
        this.roomChannel = null;
        this.playersChannel = null;
        this.presenceChannel = null;
        this.playerId = null;
        this.playerName = null;
        this.currentRoom = null;
        this.eventHandlers = new Map();
        this.connected = false;
        this.isInitialized = false;
    }

    // Inicializar cliente Supabase
    async init(supabaseUrl, supabaseKey) {
        if (this.isInitialized) return true;
        
        try {
            if (!supabaseUrl || !supabaseKey) {
                console.warn('⚠️ Credenciais Supabase não configuradas');
                return false;
            }

            // Importar Supabase via CDN
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
            
            this.supabase = createClient(supabaseUrl, supabaseKey, {
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });

            this.playerId = this.getOrCreatePlayerId();
            this.isInitialized = true;
            this.connected = true;
            
            console.log('✅ Supabase inicializado');
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar Supabase:', error);
            return false;
        }
    }

    getOrCreatePlayerId() {
        let id = localStorage.getItem('mundoSombrio_playerId');
        if (!id) {
            id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('mundoSombrio_playerId', id);
        }
        return id;
    }

    // === GERENCIAMENTO DE SALAS ===

    async listRooms() {
        if (!this.supabase) return [];
        
        try {
            const { data: rooms, error } = await this.supabase
                .from('rooms')
                .select('*')
                .eq('is_private', false)
                .eq('status', 'waiting')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return rooms || [];
        } catch (error) {
            console.error('Erro ao listar salas:', error);
            return [];
        }
    }

    async createRoom(roomName, hostName, maxPlayers = 6, isPrivate = false) {
        if (!this.supabase) throw new Error('Supabase não inicializado');
        
        const roomCode = this.generateRoomCode();

        const { data: room, error } = await this.supabase
            .from('rooms')
            .insert({
                code: roomCode,
                name: roomName.substring(0, 30),
                host_name: hostName.substring(0, 20),
                host_player_id: this.playerId,
                max_players: Math.min(maxPlayers, 6),
                current_players: 1,
                is_private: isPrivate,
                status: 'waiting',
                current_player_index: 0,
                current_turn_actions: {
                    movementUsed: false,
                    mainActionUsed: false,
                    bonusActions: []
                },
                deck_quantities: {},
                card_quantities: {}
            })
            .select()
            .single();

        if (error) throw error;

        this.playerName = hostName;
        await this.joinRoomInternal(room);
        
        return room;
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async getRoom(code) {
        if (!this.supabase) return null;
        
        const { data: room, error } = await this.supabase
            .from('rooms')
            .select('*')
            .eq('code', code.toUpperCase())
            .single();

        if (error) return null;
        return room;
    }

    async joinRoom(code, playerName) {
        if (!this.supabase) throw new Error('Supabase não inicializado');
        
        this.playerName = playerName;
        const room = await this.getRoom(code);
        
        if (!room) throw new Error('Sala não encontrada');
        if (room.status !== 'waiting') throw new Error('Jogo já iniciado');
        if (room.current_players >= room.max_players) throw new Error('Sala cheia');

        // Incrementar contador de jogadores
        const { error: updateError } = await this.supabase
            .from('rooms')
            .update({ current_players: room.current_players + 1 })
            .eq('code', code.toUpperCase());

        if (updateError) throw updateError;

        await this.joinRoomInternal({ ...room, current_players: room.current_players + 1 });
        
        return { room: this.currentRoom, playerId: this.playerId };
    }

    async joinRoomInternal(room) {
        this.currentRoom = room;
        await this.subscribeToRoom(room.code);
        this.emit('roomJoined', { room });
    }

    async leaveRoom() {
        if (!this.currentRoom || !this.supabase) return;

        const code = this.currentRoom.code;
        
        // Remover jogador da tabela room_players
        await this.supabase
            .from('room_players')
            .delete()
            .eq('room_code', code)
            .eq('player_id', this.playerId);

        // Atualizar contagem
        const { data: remainingPlayers } = await this.supabase
            .from('room_players')
            .select('player_id')
            .eq('room_code', code);
        
        const newCount = remainingPlayers?.length || 0;

        // Se não houver mais jogadores, deletar a sala
        if (newCount === 0) {
            await this.supabase.from('rooms').delete().eq('code', code);
        } else {
            await this.supabase
                .from('rooms')
                .update({ current_players: newCount })
                .eq('code', code);
        }

        this.unsubscribeFromRoom();
        this.currentRoom = null;
        this.emit('roomLeft');
    }

    // === GERENCIAMENTO DE JOGADORES NO BANCO ===

    // Adicionar jogador à sala (com personagem escolhido)
    async addPlayerToRoom(playerData) {
        if (!this.currentRoom || !this.supabase) return null;

        const { data: player, error } = await this.supabase
            .from('room_players')
            .upsert({
                room_code: this.currentRoom.code,
                player_id: playerData.odPlayerId || this.playerId,
                player_name: playerData.name,
                character_id: playerData.characterId,
                color: playerData.color,
                position: playerData.position || 1,
                player_state: playerData.state || {},
                inventory: {
                    cards: playerData.cards || [],
                    items: [],
                    clues: []
                },
                turn_order: playerData.turnOrder || 0,
                is_online: true
            }, {
                onConflict: 'room_code,player_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Erro ao adicionar jogador:', error);
            throw error;
        }

        // Atualizar contagem de jogadores
        await this.updatePlayerCount();
        
        return player;
    }

    // Obter todos os jogadores da sala
    async getPlayersInRoom() {
        if (!this.currentRoom || !this.supabase) return [];

        const { data: players, error } = await this.supabase
            .from('room_players')
            .select('*')
            .eq('room_code', this.currentRoom.code)
            .order('turn_order', { ascending: true });

        if (error) {
            console.error('Erro ao buscar jogadores:', error);
            return [];
        }

        return players || [];
    }

    // Atualizar posição do jogador
    async updatePlayerPosition(playerId, position) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('room_players')
            .update({ position })
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId);

        if (error) console.error('Erro ao atualizar posição:', error);
    }

    // Atualizar estado do jogador (vida, sanidade, etc)
    async updatePlayerStateInDB(playerId, state) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('room_players')
            .update({ player_state: state })
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId);

        if (error) console.error('Erro ao atualizar estado:', error);
    }

    // Atualizar inventário do jogador
    async updatePlayerInventory(playerId, inventory) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('room_players')
            .update({ inventory })
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId);

        if (error) console.error('Erro ao atualizar inventário:', error);
    }

    // Adicionar carta ao inventário do jogador
    async addCardToPlayer(playerId, card) {
        if (!this.currentRoom || !this.supabase) return;

        // Buscar inventário atual
        const { data: player } = await this.supabase
            .from('room_players')
            .select('inventory')
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId)
            .single();

        if (!player) return;

        const inventory = player.inventory || { cards: [], items: [], clues: [] };
        inventory.cards = inventory.cards || [];
        inventory.cards.push(card);

        await this.updatePlayerInventory(playerId, inventory);
    }

    // Remover carta do inventário do jogador
    async removeCardFromPlayer(playerId, cardId) {
        if (!this.currentRoom || !this.supabase) return;

        const { data: player } = await this.supabase
            .from('room_players')
            .select('inventory')
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId)
            .single();

        if (!player) return;

        const inventory = player.inventory || { cards: [], items: [], clues: [] };
        inventory.cards = (inventory.cards || []).filter(c => c.id !== cardId);

        await this.updatePlayerInventory(playerId, inventory);
    }

    // Remover jogador da sala
    async removePlayerFromRoom(playerId) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('room_players')
            .delete()
            .eq('room_code', this.currentRoom.code)
            .eq('player_id', playerId);

        if (error) {
            console.error('Erro ao remover jogador:', error);
            throw error;
        }

        await this.updatePlayerCount();
    }

    // Atualizar contagem de jogadores na sala
    async updatePlayerCount() {
        if (!this.currentRoom || !this.supabase) return;

        const { data: players } = await this.supabase
            .from('room_players')
            .select('player_id')
            .eq('room_code', this.currentRoom.code);

        const count = players?.length || 0;

        await this.supabase
            .from('rooms')
            .update({ current_players: count })
            .eq('code', this.currentRoom.code);
    }

    // === ESTADO DA SALA (turno atual, decks, etc) ===

    async updateRoomState(updates) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('rooms')
            .update(updates)
            .eq('code', this.currentRoom.code);

        if (error) {
            console.error('Erro ao atualizar estado da sala:', error);
            throw error;
        }
    }

    async updateCurrentTurn(playerIndex, turnActions) {
        await this.updateRoomState({
            current_player_index: playerIndex,
            current_turn_actions: turnActions
        });
    }

    async updateDeckQuantities(deckQuantities, cardQuantities) {
        await this.updateRoomState({
            deck_quantities: deckQuantities,
            card_quantities: cardQuantities
        });
    }

    // === REALTIME SUBSCRIPTIONS ===

    async subscribeToRoom(roomCode) {
        if (!this.supabase) return;

        // Canal para atualizações da sala
        this.roomChannel = this.supabase
            .channel(`room-${roomCode}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'rooms',
                    filter: `code=eq.${roomCode}`
                },
                (payload) => {
                    console.log('📡 Atualização da sala:', payload);
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        this.currentRoom = payload.new;
                        this.emit('roomUpdated', payload.new);
                    } else if (payload.eventType === 'DELETE') {
                        this.emit('roomDeleted');
                    }
                }
            )
            .subscribe();

        // Canal para atualizações dos jogadores
        this.playersChannel = this.supabase
            .channel(`players-${roomCode}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'room_players',
                    filter: `room_code=eq.${roomCode}`
                },
                (payload) => {
                    console.log('📡 Atualização de jogador:', payload);
                    if (payload.eventType === 'INSERT') {
                        this.emit('playerAdded', this.dbPlayerToGamePlayer(payload.new));
                    } else if (payload.eventType === 'UPDATE') {
                        this.emit('playerUpdated', this.dbPlayerToGamePlayer(payload.new));
                    } else if (payload.eventType === 'DELETE') {
                        this.emit('playerRemoved', payload.old.player_id);
                    }
                }
            )
            .subscribe();

        // Canal de presença para broadcast de ações
        this.presenceChannel = this.supabase
            .channel(`presence-${roomCode}`, {
                config: { presence: { key: this.playerId } }
            })
            .on('presence', { event: 'sync' }, () => {
                const state = this.presenceChannel.presenceState();
                const players = Object.values(state).flat();
                this.emit('presenceSync', players);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                this.emit('playerJoined', { playerId: key, players: newPresences });
                this.addLogEntry(`👤 ${newPresences[0]?.playerName || 'Jogador'} entrou na sala`);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                this.emit('playerLeft', { playerId: key, players: leftPresences });
                this.addLogEntry(`👋 ${leftPresences[0]?.playerName || 'Jogador'} saiu da sala`);
            })
            .on('broadcast', { event: 'game_action' }, (payload) => {
                this.handleGameAction(payload.payload);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceChannel.track({
                        playerId: this.playerId,
                        playerName: this.playerName,
                        joinedAt: new Date().toISOString()
                    });
                    this.connected = true;
                    this.emit('connectionStatus', { connected: true });
                }
            });
    }

    // Converter formato do banco para formato do jogo
    dbPlayerToGamePlayer(dbPlayer) {
        return {
            id: dbPlayer.player_id,
            odPlayerId: dbPlayer.player_id,
            name: dbPlayer.player_name,
            characterId: dbPlayer.character_id,
            color: dbPlayer.color,
            position: dbPlayer.position,
            state: dbPlayer.player_state || {},
            cards: dbPlayer.inventory?.cards || [],
            inventory: dbPlayer.inventory || { cards: [], items: [], clues: [] },
            turnOrder: dbPlayer.turn_order
        };
    }

    unsubscribeFromRoom() {
        if (this.roomChannel) {
            this.supabase.removeChannel(this.roomChannel);
            this.roomChannel = null;
        }
        if (this.playersChannel) {
            this.supabase.removeChannel(this.playersChannel);
            this.playersChannel = null;
        }
        if (this.presenceChannel) {
            this.supabase.removeChannel(this.presenceChannel);
            this.presenceChannel = null;
        }
    }

    handleGameAction(action) {
        console.log('🎮 Ação recebida:', action);
        
        // Ignorar ações próprias
        if (action.senderId === this.playerId) return;
        
        switch (action.type) {
            case 'playerAdded':
                this.emit('playerAdded', action.data);
                break;
            case 'playerRemoved':
                this.emit('playerRemoved', action.data.playerId);
                break;
            case 'movementStarted':
                this.emit('movementStarted', action.data);
                break;
            case 'movementConfirmed':
                this.emit('movementConfirmed', action.data);
                break;
            case 'movementCancelled':
                this.emit('movementCancelled', action.data);
                break;
            case 'mainActionExecuted':
                this.emit('mainActionExecuted', action.data);
                break;
            case 'bonusActionExecuted':
                this.emit('bonusActionExecuted', action.data);
                break;
            case 'turnEnded':
                this.emit('turnEnded', action.data);
                break;
            case 'playerStateUpdated':
                this.emit('playerStateUpdated', action.data);
                break;
            case 'gameStarted':
                this.emit('gameStarted', action.data);
                break;
            case 'gameReset':
                this.emit('gameReset');
                break;
            case 'chatMessage':
                this.emit('chatMessage', action.data);
                break;
        }
    }

    // === AÇÕES DO JOGO ===

    async broadcastAction(type, data) {
        if (!this.presenceChannel) return;
        
        await this.presenceChannel.send({
            type: 'broadcast',
            event: 'game_action',
            payload: {
                type,
                data,
                senderId: this.playerId,
                timestamp: Date.now()
            }
        });
    }

    // Método legado - substituído por updateRoomState, updateCurrentTurn, etc.
    async updateGameState(gameState) {
        console.warn('updateGameState está deprecado. Use updateRoomState, updateCurrentTurn, updateDeckQuantities, etc.');
        // Para compatibilidade, extrair dados e salvar nos campos corretos
        if (!this.currentRoom || !this.supabase) return;

        const updates = {
            updated_at: new Date().toISOString()
        };

        if (gameState.currentPlayerIndex !== undefined) {
            updates.current_player_index = gameState.currentPlayerIndex;
        }
        if (gameState.turnActions !== undefined) {
            updates.current_turn_actions = gameState.turnActions;
        }
        if (gameState.deckQuantities !== undefined) {
            updates.deck_quantities = gameState.deckQuantities;
        }
        if (gameState.cardQuantities !== undefined) {
            updates.card_quantities = gameState.cardQuantities;
        }

        const { error } = await this.supabase
            .from('rooms')
            .update(updates)
            .eq('code', this.currentRoom.code);

        if (error) {
            console.error('Erro ao atualizar estado:', error);
            throw error;
        }
    }

    async updateRoomStatus(status) {
        if (!this.currentRoom || !this.supabase) return;

        const { error } = await this.supabase
            .from('rooms')
            .update({ 
                status,
                updated_at: new Date().toISOString()
            })
            .eq('code', this.currentRoom.code);

        if (error) throw error;
    }

    // Métodos de ação (chamados pelo game.js)
    async addPlayer(playerData) {
        await this.broadcastAction('playerAdded', playerData);
    }

    async removePlayer(playerId) {
        await this.broadcastAction('playerRemoved', { playerId });
    }

    async startGame() {
        await this.updateRoomStatus('playing');
        await this.broadcastAction('gameStarted', {});
    }

    async startMovement(data) {
        await this.broadcastAction('movementStarted', data);
    }

    async confirmMove(tileId, playerId) {
        await this.broadcastAction('movementConfirmed', { tileId, playerId });
    }

    async cancelMove(playerId) {
        await this.broadcastAction('movementCancelled', { playerId });
    }

    async executeMainAction(action, playerId) {
        await this.broadcastAction('mainActionExecuted', { action, playerId });
    }

    async executeBonusAction(action, playerId) {
        await this.broadcastAction('bonusActionExecuted', { action, playerId });
    }

    async endTurn(data) {
        await this.broadcastAction('turnEnded', data);
    }

    async updatePlayerState(targetPlayerId, state) {
        await this.broadcastAction('playerStateUpdated', { playerId: targetPlayerId, state });
    }

    async resetGame() {
        await this.updateRoomStatus('waiting');
        await this.broadcastAction('gameReset', {});
    }

    async sendChatMessage(message) {
        await this.broadcastAction('chatMessage', {
            from: this.playerName,
            message,
            timestamp: Date.now()
        });
    }

    // === SISTEMA DE EVENTOS ===

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
            if (index > -1) handlers.splice(index, 1);
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => handler(data));
        }
    }

    // Utilitários
    isMyTurn(currentPlayerId) {
        return this.playerId === currentPlayerId;
    }

    isConnected() {
        return this.connected && this.isInitialized;
    }

    getRoomCode() {
        return this.currentRoom?.code;
    }

    isHost() {
        return this.currentRoom?.host_player_id === this.playerId;
    }

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
}

// Instância global
window.supabaseManager = new SupabaseManager();

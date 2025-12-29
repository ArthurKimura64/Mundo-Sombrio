-- =====================================================
-- MUNDO SOMBRIO - Schema do Banco de Dados Supabase
-- =====================================================
-- Execute este script no SQL Editor do Supabase
-- (Dashboard > SQL Editor > New query)

-- Tabela de Salas
CREATE TABLE IF NOT EXISTS rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    name VARCHAR(30) NOT NULL,
    host_name VARCHAR(20) NOT NULL,
    host_player_id VARCHAR(50) NOT NULL,
    max_players INTEGER DEFAULT 6 CHECK (max_players >= 1 AND max_players <= 6),
    current_players INTEGER DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
    current_player_index INTEGER DEFAULT 0,
    current_turn_actions JSONB DEFAULT '{"movementUsed": false, "mainActionUsed": false, "bonusActions": []}'::jsonb,
    deck_quantities JSONB DEFAULT '{}'::jsonb,
    card_quantities JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Jogadores (dentro das salas)
CREATE TABLE IF NOT EXISTS room_players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code VARCHAR(6) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    player_id VARCHAR(50) NOT NULL,
    player_name VARCHAR(20) NOT NULL,
    character_id VARCHAR(50),
    color VARCHAR(20),
    position VARCHAR(20) DEFAULT 'path001',
    -- Estado do personagem (vida, sanidade, talentos, etc)
    player_state JSONB DEFAULT '{}'::jsonb,
    -- Inventário (cartas, itens, etc)
    inventory JSONB DEFAULT '{"cards": [], "items": [], "clues": []}'::jsonb,
    -- Ordem de turno
    turn_order INTEGER DEFAULT 0,
    is_online BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_code, player_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_is_private ON rooms(is_private);
CREATE INDEX IF NOT EXISTS idx_room_players_room_code ON room_players(room_code);
CREATE INDEX IF NOT EXISTS idx_room_players_player_id ON room_players(player_id);

-- Função para limpar salas antigas sem jogadores (mais de 24 horas)
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void AS $$
BEGIN
    DELETE FROM rooms 
    WHERE updated_at < NOW() - INTERVAL '24 hours'
    AND current_players = 0;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para atualizar updated_at
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_room_players_updated_at ON room_players;
CREATE TRIGGER update_room_players_updated_at
    BEFORE UPDATE ON room_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HABILITAR REALTIME
-- =====================================================

-- Habilitar Realtime para as tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;

-- Políticas para rooms
CREATE POLICY "Salas são visíveis" ON rooms
    FOR SELECT USING (TRUE);

CREATE POLICY "Qualquer um pode criar sala" ON rooms
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Qualquer um pode atualizar sala" ON rooms
    FOR UPDATE USING (TRUE);

CREATE POLICY "Qualquer um pode deletar sala" ON rooms
    FOR DELETE USING (TRUE);

-- Políticas para room_players
CREATE POLICY "Jogadores são visíveis" ON room_players
    FOR SELECT USING (TRUE);

CREATE POLICY "Qualquer um pode adicionar jogador" ON room_players
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Qualquer um pode atualizar jogador" ON room_players
    FOR UPDATE USING (TRUE);

CREATE POLICY "Qualquer um pode remover jogador" ON room_players
    FOR DELETE USING (TRUE);

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON TABLE rooms IS 'Salas de jogo do Mundo Sombrio';
COMMENT ON TABLE room_players IS 'Jogadores dentro de cada sala com inventário e estado';
COMMENT ON COLUMN room_players.player_state IS 'Estado do personagem: vida, sanidade, talentos, habilidades';
COMMENT ON COLUMN room_players.inventory IS 'Inventário: cartas, itens coletados, pistas';

-- Pronto! Agora configure as credenciais no arquivo public/js/config.js

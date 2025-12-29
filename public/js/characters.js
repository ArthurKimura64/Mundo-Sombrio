// Sistema de Personagens - Mundo Sombrio

class CharacterManager {
    constructor() {
        this.characters = [];
        this.loaded = false;
    }

    async init() {
        try {
            const response = await fetch('/data/characters.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.characters = data.characters || [];
            this.loaded = true;
            console.log(`Personagens carregados: ${this.characters.length}`);
        } catch (error) {
            console.error('Erro ao carregar personagens:', error);
            this.characters = [];
        }
    }

    // Obter todos os personagens
    getAll() {
        return this.characters;
    }

    // Obter personagem por ID
    getById(id) {
        return this.characters.find(c => c.id === id);
    }

    // Obter nome traduzido do personagem
    getName(character) {
        if (!character) return '';
        return window.i18n.get(character.nameKey);
    }

    // Obter descrição traduzida do personagem
    getDescription(character) {
        if (!character) return '';
        return window.i18n.get(character.descriptionKey);
    }

    // Obter nome traduzido de um talento
    getTalentName(talent) {
        if (!talent) return '';
        return window.i18n.get(talent.nameKey);
    }

    // Obter descrição traduzida de um talento
    getTalentDescription(talent) {
        if (!talent) return '';
        return window.i18n.get(talent.descriptionKey);
    }

    // Obter nome traduzido de uma habilidade
    getAbilityName(ability) {
        if (!ability) return '';
        return window.i18n.get(ability.nameKey);
    }

    // Obter descrição traduzida de uma habilidade
    getAbilityDescription(ability) {
        if (!ability) return '';
        return window.i18n.get(ability.descriptionKey);
    }

    // Obter valor de um talento no nível atual
    getTalentValue(character, talentId, level = 0) {
        const talent = character.talents.find(t => t.id === talentId);
        if (!talent || !talent.levels) return 0;
        const clampedLevel = Math.max(0, Math.min(level, talent.levels.length - 1));
        return talent.levels[clampedLevel];
    }

    // Obter nível máximo de um talento
    getMaxTalentLevel(character, talentId) {
        const talent = character.talents.find(t => t.id === talentId);
        if (!talent || !talent.levels) return 0;
        return talent.levels.length - 1;
    }

    // Criar estado inicial de um jogador baseado no personagem
    createPlayerState(character) {
        // Inicializar níveis de talentos (todos começam em 0)
        const talentLevels = {};
        character.talents.forEach(talent => {
            talentLevels[talent.id] = 0;
        });

        // Valores iniciais baseados nos talentos de nível 0
        const maxHealth = this.getTalentValue(character, 'max_health', 0);
        const movement = this.getTalentValue(character, 'movement', 0);

        return {
            characterId: character.id,
            currentHealth: maxHealth,
            maxHealth: maxHealth,
            movement: movement,
            talentLevels: talentLevels,
            effects: []
        };
    }

    // Melhorar um talento
    upgradeTalent(playerState, character, talentId) {
        const maxLevel = this.getMaxTalentLevel(character, talentId);
        const currentLevel = playerState.talentLevels[talentId] || 0;
        
        if (currentLevel >= maxLevel) {
            return false; // Já está no nível máximo
        }

        playerState.talentLevels[talentId] = currentLevel + 1;

        // Atualizar stats derivados se necessário
        if (talentId === 'max_health') {
            const newMaxHealth = this.getTalentValue(character, 'max_health', playerState.talentLevels[talentId]);
            const healthDiff = newMaxHealth - playerState.maxHealth;
            playerState.maxHealth = newMaxHealth;
            playerState.currentHealth += healthDiff; // Aumenta a vida atual também
        } else if (talentId === 'movement') {
            playerState.movement = this.getTalentValue(character, 'movement', playerState.talentLevels[talentId]);
        }

        return true;
    }

    // Obter valor atual de um talento do jogador
    getPlayerTalentValue(playerState, character, talentId) {
        const level = playerState.talentLevels[talentId] || 0;
        return this.getTalentValue(character, talentId, level);
    }

    // Modificar vida
    modifyHealth(playerState, amount) {
        playerState.currentHealth = Math.max(0, Math.min(
            playerState.maxHealth,
            playerState.currentHealth + amount
        ));
        return playerState.currentHealth;
    }

    // Verificar se personagem está vivo
    isAlive(playerState) {
        return playerState.currentHealth > 0;
    }

    // Obter porcentagem de vida
    getHealthPercentage(playerState) {
        return (playerState.currentHealth / playerState.maxHealth) * 100;
    }

    // Gerar HTML para seleção de personagem
    generateCharacterSelectHTML(usedCharacterIds = []) {
        return this.characters.map(char => {
            const isUsed = usedCharacterIds.includes(char.id);
            const name = this.getName(char);
            const description = this.getDescription(char);
            const maxHealth = this.getTalentValue(char, 'max_health', 0);
            const movement = this.getTalentValue(char, 'movement', 0);
            
            return `
                <div class="modal-character-card ${isUsed ? 'disabled' : ''}" 
                     data-character-id="${char.id}"
                     ${isUsed ? 'data-disabled="true"' : ''}>
                    <div class="modal-character-icon">${char.icon}</div>
                    <div class="modal-character-name">${name}</div>
                    <div class="modal-character-stats">
                        <span>❤️ ${maxHealth}</span>
                        <span>👣 ${movement}</span>
                    </div>
                    <div class="modal-character-description">${description}</div>
                </div>
            `;
        }).join('');
    }

    // Gerar HTML para informações do personagem
    generateCharacterInfoHTML(character, playerState) {
        if (!character) return '';

        const name = this.getName(character);
        const description = this.getDescription(character);

        let html = `
            <div class="character-info-header">
                <div class="character-info-icon">${character.icon}</div>
                <div>
                    <div class="character-info-name">${name}</div>
                    <div class="character-info-description">${description}</div>
                </div>
            </div>
            
            <div class="character-stats-display">
                <div class="stat-item">
                    <span class="stat-label">${window.i18n.get('ui.health')}</span>
                    <span class="stat-value">${playerState.currentHealth}/${playerState.maxHealth}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${window.i18n.get('ui.movementRange')}</span>
                    <span class="stat-value">${playerState.movement}</span>
                </div>
            </div>
        `;

        // Talentos (atributos que podem ser melhorados)
        if (character.talents.length > 0) {
            html += `<h4 style="margin: 12px 0 8px; color: var(--accent-secondary);">${window.i18n.get('ui.talents')}</h4>`;
            html += '<div class="talents-list">';
            
            character.talents.forEach(talent => {
                const talentName = this.getTalentName(talent);
                const talentDesc = this.getTalentDescription(talent);
                const currentLevel = playerState.talentLevels[talent.id] || 0;
                const maxLevel = talent.levels.length - 1;
                const currentValue = talent.levels[currentLevel];
                
                // Criar indicadores de nível
                let levelIndicators = '';
                for (let i = 0; i <= maxLevel; i++) {
                    const filled = i <= currentLevel ? 'filled' : '';
                    levelIndicators += `<span class="level-dot ${filled}" title="${window.i18n.get('ui.level')} ${i + 1}: ${talent.levels[i]}"></span>`;
                }
                
                html += `
                    <div class="talent-item" data-talent-id="${talent.id}">
                        <div class="talent-header">
                            <div class="talent-name">${talentName}</div>
                            <div class="talent-value">${currentValue}</div>
                        </div>
                        <div class="talent-description">${talentDesc}</div>
                        <div class="talent-levels">
                            ${levelIndicators}
                            <span class="talent-level-text">${window.i18n.get('ui.level')} ${currentLevel + 1}/${maxLevel + 1}</span>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }

        // Habilidades (ativas/passivas sem cooldown)
        if (character.abilities.length > 0) {
            html += `<h4 style="margin: 12px 0 8px; color: var(--accent-primary);">${window.i18n.get('ui.abilities')}</h4>`;
            html += '<div class="abilities-list">';
            
            character.abilities.forEach(ability => {
                const abilityName = this.getAbilityName(ability);
                const abilityDesc = this.getAbilityDescription(ability);
                const typeText = ability.type === 'passive' ? window.i18n.get('ui.passive') : window.i18n.get('ui.active');
                
                html += `
                    <div class="ability-item ${ability.type}">
                        <div class="ability-header">
                            <div class="ability-name">${abilityName}</div>
                            <div class="ability-type-badge">${typeText}</div>
                        </div>
                        <div class="ability-description">${abilityDesc}</div>
                    </div>
                `;
            });
            
            html += '</div>';
        }

        return html;
    }
}

// Instância global
window.characterManager = new CharacterManager();

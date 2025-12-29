// Sistema de Localização - Mundo Sombrio

class Localization {
    constructor() {
        this.currentLanguage = 'pt-BR';
        this.translations = {};
        this.loaded = false;
    }

    async init() {
        // Detectar idioma do navegador
        const browserLang = navigator.language || navigator.userLanguage;
        this.currentLanguage = browserLang.startsWith('pt') ? 'pt-BR' : 'en-US';
        
        // Verificar se há preferência salva
        const savedLang = localStorage.getItem('mundoSombrio_language');
        if (savedLang) {
            this.currentLanguage = savedLang;
        }

        await this.loadTranslations(this.currentLanguage);
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`/data/localization/${lang}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${lang} translations`);
            }
            this.translations = await response.json();
            this.loaded = true;
            console.log(`Traduções carregadas: ${lang}`);
        } catch (error) {
            console.error('Erro ao carregar traduções:', error);
            // Tentar fallback para pt-BR
            if (lang !== 'pt-BR') {
                await this.loadTranslations('pt-BR');
            }
        }
    }

    async setLanguage(lang) {
        this.currentLanguage = lang;
        localStorage.setItem('mundoSombrio_language', lang);
        await this.loadTranslations(lang);
        this.updateUI();
    }

    // Obter tradução por chave (ex: "ui.players")
    get(key, replacements = {}) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                console.warn(`Tradução não encontrada: ${key}`);
                return key;
            }
        }

        if (typeof value !== 'string') {
            return key;
        }

        // Substituir placeholders como {moves}
        let result = value;
        for (const [placeholder, replacement] of Object.entries(replacements)) {
            result = result.replace(`{${placeholder}}`, replacement);
        }

        return result;
    }

    // Atualizar todos os elementos da UI com data-i18n
    updateUI() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.get(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.get(key);
        });

        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.get(key);
        });
    }

    // Obter nome traduzido de um local do mapa
    getLocationName(locationId) {
        if (!locationId) return '';
        
        // Se for um path, não é um local
        if (locationId.startsWith('path')) {
            return locationId;
        }
        
        // Buscar tradução do local
        const translated = this.get(`locations.${locationId}`);
        
        // Se não encontrou, retornar o ID original
        if (translated === `locations.${locationId}`) {
            return locationId;
        }
        
        return translated;
    }

    // Verificar se um tileId é um local (não um path)
    isLocation(tileId) {
        return tileId && !tileId.startsWith('path');
    }
}

// Instância global
window.i18n = new Localization();

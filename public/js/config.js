// Mundo Sombrio - Configuração
// Centralize todas as configurações aqui

window.MUNDO_SOMBRIO_CONFIG = {
    // Supabase - Preencha com suas credenciais
    // Obtenha em: https://app.supabase.com > Settings > API
    SUPABASE_URL: 'https://tekrrjpqvzdsihhosizp.supabase.co', // Ex: 'https://xxxxx.supabase.co'
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3JyanBxdnpkc2loaG9zaXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODU1ODgsImV4cCI6MjA3OTA2MTU4OH0.fghzS4ROlM5Txb995eee3VLArrGdayKTsFHael2Uv6E', // Sua chave anon/public
    
    // Configurações do jogo
    MAX_PLAYERS: 6,
    DEFAULT_POSITION: 1,
    
    // Versão
    VERSION: '2.0.0'
};

// Verificar se as credenciais estão configuradas
if (!window.MUNDO_SOMBRIO_CONFIG.SUPABASE_URL || !window.MUNDO_SOMBRIO_CONFIG.SUPABASE_ANON_KEY) {
    console.warn(`
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  ATENÇÃO: Supabase não configurado!                      ║
╠══════════════════════════════════════════════════════════════╣
║  Para habilitar o multiplayer online:                        ║
║                                                              ║
║  1. Crie uma conta em https://supabase.com                   ║
║  2. Crie um novo projeto                                     ║
║  3. Vá em Settings > API                                     ║
║  4. Copie a URL e a chave anon                              ║
║  5. Cole em public/js/config.js                             ║
║                                                              ║
║  O jogo funcionará em modo local até ser configurado.        ║
╚══════════════════════════════════════════════════════════════╝
    `);
}

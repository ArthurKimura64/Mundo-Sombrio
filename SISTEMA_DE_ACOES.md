# Sistema de Ações por Rodada - Mundo Sombrio

## Visão Geral

O jogo agora implementa um sistema completo de ações por rodada, onde cada jogador tem diferentes tipos de ações disponíveis durante seu turno.

## Tipos de Ações

### 1. Ação de Movimento 🚶
- **Descrição**: Permite que o personagem se mova pelo mapa
- **Uso**: Uma vez por turno
- **Como usar**: 
  1. Clique no botão "🚶 Usar Movimento"
  2. Selecione uma casa destacada no mapa
  3. Confirme o movimento
- **Limitação**: A distância de movimento depende do atributo de movimento do personagem

### 2. Ação Principal ⚡
- **Descrição**: A ação mais importante do turno, usada para tarefas significativas
- **Uso**: Uma vez por turno
- **Opções disponíveis**:
  - ⚔️ **Atacar**: Realizar um ataque contra um inimigo
  - 🎯 **Usar Habilidade**: Ativar uma habilidade especial do personagem
  - 🤝 **Interagir**: Interagir com objetos ou NPCs
  - 🔍 **Procurar**: Procurar por itens ou pistas
  - ❤️ **Ajudar Aliado**: Prestar auxílio a outro jogador

### 3. Ação Bônus ⭐
- **Descrição**: Ações rápidas que podem ser realizadas sem gastar a ação principal ou de movimento
- **Uso**: Múltiplas vezes por turno (cada ação bônus específica pode ser usada apenas uma vez)
- **Opções disponíveis**:
  - 🧪 **Usar Poção**: Consumir uma poção do inventário
  - 🥷 **Esconder-se**: Tentar ficar oculto
  - 💨 **Corrida**: Movimento rápido adicional
  - 📢 **Gritar**: Alertar aliados ou intimidar inimigos

## Ordem de Execução

As ações podem ser executadas em qualquer ordem durante o turno. Por exemplo:
- Você pode usar a Ação Principal antes da Ação de Movimento
- Ações Bônus podem ser usadas a qualquer momento
- Você pode cancelar a Ação de Movimento e executar outra ação

## Interface

### Painel de Ações
O painel de ações aparece automaticamente quando é o turno de um jogador e mostra:
- Status de cada tipo de ação (disponível/usada)
- Botões e menus para executar ações
- Feedback visual quando uma ação é executada

### Feedback Visual
Quando uma ação é executada, uma mensagem aparece no centro da tela confirmando a ação realizada.

## Finalizar Turno

Clique no botão "Finalizar Turno" quando terminar todas as ações desejadas. Não é necessário usar todas as ações disponíveis.

## Implementação Técnica

### Estado das Ações
O jogo mantém um registro das ações usadas no turno atual:
```javascript
currentTurnActions: {
    movementUsed: false,
    mainActionUsed: false,
    bonusActions: []
}
```

### Extensibilidade

O sistema foi projetado para ser facilmente extensível. Para adicionar novas ações:

1. **Adicionar opção no HTML** ([index.html](index.html)):
   - Para Ação Principal: adicione um `<option>` em `#mainActionSelect`
   - Para Ação Bônus: adicione um `<option>` em `#bonusActionSelect`

2. **Implementar lógica da ação** ([js/game.js](public/js/game.js)):
   - Em `executeMainAction()` para ações principais
   - Em `executeBonusAction()` para ações bônus

3. **Exemplo de nova ação**:
```javascript
executeMainAction() {
    const action = document.getElementById('mainActionSelect').value;
    
    switch(action) {
        case 'attack':
            // Lógica de ataque
            break;
        case 'nova_acao':
            // Sua nova lógica aqui
            break;
    }
}
```

## Próximos Passos

Para completar o sistema, você pode adicionar:
- Lógica específica para cada ação (dano, cura, efeitos, etc.)
- Sistema de combate
- Sistema de inventário para ações que usam itens
- Animações visuais para cada tipo de ação
- Sons e efeitos especiais
- Validação de alcance para ações que afetam outros jogadores
- Sistema de recursos (mana, energia, etc.)

## Persistência

O estado das ações é salvo automaticamente no localStorage junto com o resto do estado do jogo, permitindo que você continue de onde parou mesmo após recarregar a página.

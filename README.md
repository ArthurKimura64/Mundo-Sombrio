# 🎮 Mundo Sombrio

Jogo de tabuleiro digital multiplayer com sistema de salas online.

## 🚀 Deploy

### Opção 1: Vercel (Recomendado)

1. Faça push do código para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. O Vercel detectará automaticamente que é um site estático

### Opção 2: GitHub Pages

1. Vá em **Settings > Pages** no seu repositório
2. Em "Source", selecione **Deploy from a branch**
3. Selecione a branch `main` e a pasta `/public`
4. Clique em Save

---

## 🔧 Configurar Supabase (Obrigatório para Multiplayer)

### 1. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **New Project**
3. Dê um nome ao projeto e escolha uma senha para o banco
4. Aguarde a criação (1-2 minutos)

### 2. Criar tabela no banco de dados

1. No dashboard do Supabase, vá em **SQL Editor**
2. Clique em **New query**
3. Cole o conteúdo do arquivo `supabase-schema.sql`
4. Clique em **Run** (ou Ctrl+Enter)

### 3. Habilitar Realtime

1. Vá em **Database > Replication**
2. Em "Realtime", clique em **0 tables**
3. Ative a tabela **rooms**

### 4. Copiar credenciais

1. Vá em **Settings > API**
2. Copie:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public** key (em Project API keys)

### 5. Configurar no projeto

Edite o arquivo `public/js/config.js`:

```javascript
window.MUNDO_SOMBRIO_CONFIG = {
    SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
    SUPABASE_ANON_KEY: 'sua-chave-anon-aqui',
    // ...
};
```

---

## 🎯 Funcionalidades

- ✅ **Sistema de salas** com códigos de 6 caracteres
- ✅ **Multiplayer em tempo real** via Supabase Realtime
- ✅ **Modo local** (funciona sem Supabase)
- ✅ **Sistema de turnos**
- ✅ **Movimentação no mapa**
- ✅ **Chat em tempo real**
- ✅ **100% client-side** (sem servidor backend)

---

## 🛠️ Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Rodar servidor de desenvolvimento
npm run dev

# Acessar
http://localhost:3000
```

---

## 📁 Estrutura do Projeto

```
├── public/                 # Frontend (deploy este diretório)
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── config.js       # ⚠️ Configure suas credenciais aqui
│   │   ├── supabaseManager.js
│   │   ├── roomManager.js
│   │   ├── game.js
│   │   └── ...
│   └── data/
├── supabase-schema.sql     # SQL para criar tabela no Supabase
├── vercel.json             # Config do Vercel
└── README.md
```

---

## 🔒 Segurança

- A chave `anon` do Supabase é segura para uso no frontend
- As políticas RLS (Row Level Security) protegem o banco
- Não exponha a chave `service_role` no frontend

---

## 📝 Licença

MIT

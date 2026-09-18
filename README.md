# 🚀 Obras MVP - Sistema de Gestão de Produção em Obras

Sistema completo para gestão de produção em obras de construção civil.

[![GitHub](https://img.shields.io/badge/GitHub-Repo-blue)](https://github.com/fiftyfiftyimob/obras-mvp)
[![Supabase](https://img.shields.io/badge/Supabase-DB-green)](https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg)

---

## ✅ Status dos Serviços

| Serviço | Status | Link |
|---------|--------|------|
| **GitHub** | ✅ Pronto | https://github.com/fiftyfiftyimob/obras-mvp |
| **Supabase** | ✅ Pronto | https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg |
| **Vercel** | ⚠️ Conectar manual | https://vercel.com/new |

---

## 🔗 COMO CONECTAR VERCEL AO GITHUB (Passo a Passo)

A Vercel precisa ser conectada manualmente ao repositÃ³rio GitHub. Siga estes passos:

### Passo 1: Acesse a Vercel

1. Vá¹¹ em: https://vercel.com/new
2. Ou: https://vercel.com/dashboard

### Passo 2: Importar Projeto GitHub

1. Clique em **"Add New..."** → **"Project"**
2. Na seção **"Import Git Repository"**, clique em **"GitHub"**
3. Se for a primeira vez, **autorize a Vercel** a acessar seu GitHub
4. Procure por **`fiftyfiftyimob/obras-mvp`** na lista
5. Clique em **"Import"**

### Passo 3: Configurar Root Directory

1. Em **"Root Directory"**, clique em **"Edit"**
2. Digite: `web`
3. Isso diz à Vercel que o Next.js está na pasta `/web`

### Passo 4: VariÃ¡veis de Ambiente

Adicione estas variÃ¡veis em **"Environment Variables"**:

```env
API_URL=http://localhost:3000
MAPBOX_TOKEN=
```

### Passo 5: Deploy

1. Clique em **"Deploy"**
2. Aguarde o build (leva ~2 minutos)
3. Pronto! Seu site estarÃ¡ em: `https://obras-mvp-web.vercel.app`

---

## 📦 Serviços Configurados

### 1. Banco de Dados - Supabase ✅

**Projeto:** `obras-mvp`

- **URL do Projeto:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg
- **Database Host:** `db.mulgoijgvmizboyxmxmg.supabase.co`
- **Pooler Host:** `aws-0-sa-east-1.pooler.supabase.com`
- **Porta:** `6543`
- **Database:** `postgres`
- **UsuÃ¡rio:** `postgres`

**🔑 COMO PEGAR A SENHA:**

1. Acesse: https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg/settings/database
2. Procure por **"Database password"**
3. Clique em **"Reset Database Password"**
4. **Copie a senha** que aparecer (só¹¹¹ aparece uma vez!)
5. Salve em algum lugar seguro

**Connection String (substitua [SUA_SENHA]):**

```
postgresql://postgres:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Tabelas Criadas:** ✅
- `usuarios`, `obras`, `frentes`, `servicos`, `equipes`, `colaboradores`
- `compromissos_semanais`, `tarefas`, `evolucoes_tarefa`
- `localizacoes_periodicas`, `rdos`, `rdos_itens`

**UsuÃ¡rio de Teste Criado:** ✅
- **Telefone:** `11999999999`
- **Senha:** `senha123`
- **Perfil:** Gestor

---

### 2. Código - GitHub ✅

**RepositÃ³rio:** https://github.com/fiftyfiftyimob/obras-mvp

```bash
git clone https://github.com/fiftyfiftyimob/obras-mvp.git
cd obras-mvp
```

**ConteÃºdo:**
- ✅ Backend (NestJS + Prisma)
- ✅ Schema do banco
- ✅ README com instruÃ§Ãµes

---

## 🛠️ Como Rodar Localmente

### Backend (NestJS)

```bash
# Clonar e entrar na pasta
git clone https://github.com/fiftyfiftyimob/obras-mvp.git
cd obras-mvp/backend

# Instalar dependÃªncias
npm install

# Criar arquivo .env
echo 'DATABASE_URL="postgresql://postgres:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"' > .env
echo 'JWT_SECRET="segredo123"' >> .env
echo 'PORT=3000' >> .env

# Editar .env e colocar sua senha real

# Gerar Prisma
npm run prisma:generate

# Iniciar backend
npm run start:dev
```

**Backend rodando em:** `http://localhost:3000`

---

### Testar API

**Login:**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"telefone":"11999999999","senha":"senha123"}'
```

**Resposta:**

```json
{
  "access_token": "eyJhbGc...",
  "usuario": {
    "id": 1,
    "nome": "Engenheiro Teste",
    "telefone": "11999999999",
    "perfil": "gestor"
  }
}
```

---

## 📁 Estrutura do Projeto

```
obras-mvp/
├─ backend/           # NestJS + Prisma
│  ├─ src/
│  │  ├─ auth/
│  │  ├─ usuarios/
│  │  ├─ obras/
│  │  └─ ...
│  ├─ prisma/
│  │  └─ schema.prisma
│  ├─ .env.example
│  └─ package.json
├─ mobile/            # Flutter (em desenvolvimento)
├─ web/               # Next.js (em desenvolvimento)
└─ README.md
```

---

## 🔗 Links Úteis

- **GitHub:** https://github.com/fiftyfiftyimob/obras-mvp
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg/settings/database
- **Vercel Deploy:** https://vercel.com/new
- **Vercel Dashboard:** https://vercel.com/dashboard

---

## ✅ Checklist

- [x] Criar repositÃ³rio GitHub
- [x] Subir cÃ³digo do backend
- [x] Criar projeto Supabase
- [x] Criar tabelas no banco
- [x] Criar usuÃ¡rio de teste
- [ ] Conectar Vercel ao GitHub (manual)
- [ ] Deploy do web na Vercel
- [ ] Completar mobile (Flutter)

---

**Desenvolvido por Leandro Antolini - 2026**

# 🚀 Obras MVP - Sistema de Gestão de Produção em Obras

Sistema completo para gestão de produção em obras de construção civil.

[![GitHub](https://img.shields.io/badge/GitHub-Repo-blue)](https://github.com/fiftyfiftyimob/obras-mvp)
[![Supabase](https://img.shields.io/badge/Supabase-DB-green)](https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg)

---

## 🎯 Funcionalidades

- ✅ Gestão de obras, frentes, equipes e colaboradores
- ✅ Distribuição diária de tarefas para pedreiros/ajudantes
- ✅ Apontamento de produção (início, pausa, conclusão, impedimento)
- ✅ Rastreamento GPS em tempo real
- ✅ RDO automático (Relatório Diário de Obra)
- ✅ 3 perfis: Gestor, Estagiário, Operário

---

## 📦 Serviços Configurados

### 1. Banco de Dados - Supabase

**Projeto criado:** `obras-mvp`

- **URL:** `https://mulgoijgvmizboyxmxmg.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg
- **API Key (anon):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdvaWpndm1pemJveXhteG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjU4OTcsImV4cCI6MjEwNTM0MTg5N30.34iP2zlSYxFtoy-pn4JD98xLF-fkWsXB_fcuoa5m3bo`

**Para pegar a senha do banco:**
1. Acesse o dashboard do Supabase
2. Vá em **Project Settings** → **Database**
3. Copie a senha de `postgres`

**Tabelas criadas:**
- `usuarios`, `obras`, `frentes`, `servicos`, `equipes`, `colaboradores`
- `compromissos_semanais`, `tarefas`, `evolucoes_tarefa`
- `localizacoes_periodicas`, `rdos`, `rdos_itens`

### 2. Código - GitHub

**Repositório:** https://github.com/fiftyfiftyimob/obras-mvp

```bash
git clone https://github.com/fiftyfiftyimob/obras-mvp.git
cd obras-mvp
```

### 3. Web (Next.js) - Vercel

**Projeto criado:** `obras-mvp` (ID: `prj_3p5YDzt1BsRwt2wkH18ZG6he1H2X`)

⚠️ **Atenção:** Você precisa vincular o repositório GitHub manualmente:

1. Acesse https://vercel.com/dashboard
2. Clique no projeto `obras-mvp`
3. Vá em **Git** → **Connect Git Repository**
4. Selecione `fiftyfiftyimob/obras-mvp`
5. Defina **Root Directory** como `web`
6. Clique em **Deploy**

---

## 🛠️ Como Rodar Localmente

### Backend (NestJS)

```bash
cd backend
npm install
```

Crie `.env`:

```env
DATABASE_URL="postgresql://postgres:[SUA_SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
JWT_SECRET="segredo123"
PORT=3000
```

```bash
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

### Mobile (Flutter)

```bash
cd mobile
flutter create .  # se não tiver projeto Flutter ainda
flutter pub get
flutter run
```

No arquivo `lib/api_service.dart`, mude:

```dart
static const String baseUrl = 'http://SEU_IP:3000';
```

### Web (Next.js)

```bash
cd web
npm install
npm run dev
```

Acesse: `http://localhost:3001`

---

## 🔑 Criar Usuário de Teste

No **SQL Editor** do Supabase:

```sql
-- Gere o hash em: https://bcrypt-generator.com/ (senha: senha123, rounds: 10)
INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil, ativo)
VALUES (
  'Engenheiro Teste',
  'teste@exemplo.com',
  '11999999999',
  '$2b$10$XQh...hash-aqui...',
  'gestor',
  true
);
```

**Login de teste:**
- Telefone: `11999999999`
- Senha: `senha123`

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
│  └─ package.json
├─ mobile/            # Flutter
│  └─ lib/
│     ├─ main.dart
│     ├─ services/
│     └─ screens/
├─ web/               # Next.js
│  └─ app/
│     ├─ page.tsx
│     ├─ login/
│     ├─ tarefas/
│     └─ ...
└─ README.md
```

---

## 📞 Links Úteis

- **GitHub:** https://github.com/fiftyfiftyimob/obras-mvp
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg
- **Vercel Dashboard:** https://vercel.com/dashboard

---

## 🚀 Próximos Passos

1. **Vincular GitHub na Vercel** (veja acima)
2. **Rodar backend localmente** para testes
3. **Instalar Flutter** e rodar o mobile
4. **Testar em obra piloto**

---

**Desenvolvido por Leandro Antolini - 2026**

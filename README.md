# 🚀 Obras MVP - Sistema de Gestão de Produção em Obras

Sistema completo para gestão de produção em obras de construção civil, com:

- ✅ **Backend** - NestJS + Prisma + PostgreSQL
- ✅ **Mobile** - Flutter (Android/iOS)
- ✅ **Web** - Next.js 14 + React

---

## 🎯 Funcionalidades

- **GestÃ£o de obras, frentes, equipes e colaboradores**
- **Distribuiçª£o diÃ¡ria de tarefas** para pedreiros/ajudantes
- **Apontamento de produçª£o** (inÃ¡cio, pausa, conclusÃ£o, impedimento)
- **Rastreamento GPS** em tempo real
- **RDO automÃ¡tico** (RelatÃ³rio DiÃ¡rio de Obra)
- **3 perfis**: Gestor, EstagiÃ¡rio, OperÃ¡rio

---

## 📦 Deploy AutomÃ¡tico

### 1. Backend + Banco

O banco jÃ¡ estÃ¡ criado no Supabase:

- **URL:** `https://mulgoijgvmizboyxmxmg.supabase.co`
- **API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdvaWpndm1pemJveXhteG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NjU4OTcsImV4cCI6MjEwNTM0MTg5N30.34iP2zlSYxFtoy-pn4JD98xLF-fkWsXB_fcuoa5m3bo`

Para rodar o backend localmente:

```bash
cd backend
npm install
```

Crie `.env` com:

```env
DATABASE_URL="postgresql://postgres:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
JWT_SECRET="segredo123"
PORT=3000
```

**Para pegar a senha do banco:**
1. Acesse https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg
2. VÃ¡ em **Project Settings** > **Database**
3. Copie a senha de `postgres`

Depois:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

### 2. Mobile (Flutter)

```bash
cd mobile
flutter pub get
flutter run
```

No arquivo `lib/api_service.dart`, mude o `baseUrl` para o IP do seu backend.

### 3. Web (Next.js)

```bash
cd web
npm install
npm run dev
```

Acesse: `http://localhost:3001`

---

## 📁 Estrutura

```
obras-mvp/
├─ backend/          # NestJS + Prisma
├─ mobile/           # Flutter
├─ web/              # Next.js
└─ README.md
```

---

## 🔑 Criar UsuÃ¡rio de Teste

No SQL Editor do Supabase:

```sql
INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil, ativo)
VALUES (
  'Engenheiro Teste',
  'teste@exemplo.com',
  '11999999999',
  '$2b$10$...', -- hash de 'senha123'
  'gestor',
  true
);
```

Para gerar o hash: https://bcrypt-generator.com/ (senha: `senha123`, rounds: 10)

---

## 📞 Links

- **GitHub:** https://github.com/fiftyfiftyimob/obras-mvp
- **Supabase:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg

---

## 🛠️ Desenvolvido por

Leandro Antolini - 2026

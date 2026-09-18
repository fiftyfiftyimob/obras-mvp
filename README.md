# 🚀 Obras MVP - Sistema de Gestão de Produção em Obras

Sistema completo para gestão de produção em obras de construção civil.

[![GitHub](https://img.shields.io/badge/GitHub-Repo-blue)](https://github.com/fiftyfiftyimob/obras-mvp)
[![Supabase](https://img.shields.io/badge/Supabase-DB-green)](https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg)

---

## 🎯 Funcionalidades

- ✅ Gestão de obras, frentes, equipes e colaboradores
- ✅ Distribuiçª£o diÃ¡ria de tarefas para pedreiros/ajudantes
- ✅ Apontamento de produçª£o (inÃ¡cio, pausa, conclusÃ£o, impedimento)
- ✅ Rastreamento GPS em tempo real
- ✅ RDO automÃ¡tico (RelatÃ³rio DiÃ¡rio de Obra)
- ✅ 3 perfis: Gestor, EstagiÃ¡rio, OperÃ¡rio

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

### 3. Web (Next.js) - Vercel ⚠️

**Projeto:** `obras-mvp` (ID: `prj_3p5YDzt1BsRwt2wkH18ZG6he1H2X`)

**Dashboard:** https://vercel.com/dashboard

⚠️ **PRECISA VINCULAR AO GITHUB:**

1. Acesse https://vercel.com/dashboard
2. Clique no projeto `obras-mvp`
3. VÃ¡ em **Git** → **Connect Git Repository**
4. Selecione `fiftyfiftyimob/obras-mvp`
5. Defina **Root Directory** como `web`
6. Clique em **Deploy**

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
# (use nano, vim, ou bloco de notas)

# Gerar Prisma
npm run prisma:generate

# Rodar migrations (opcional, jÃ¡ estÃ£o no banco)
npm run prisma:migrate

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

### Mobile (Flutter) - Em Desenvolvimento

```bash
cd mobile
flutter create .
flutter pub get
flutter run
```

No arquivo `lib/api_service.dart`, mude:

```dart
static const String baseUrl = 'http://SEU_IP:3000';
```

---

### Web (Next.js)

```bash
cd web
npm install
npm run dev
```

Acesse: `http://localhost:3001`

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
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mulgoijgvmizboyxmxmg
- **Vercel Dashboard:** https://vercel.com/dashboard

---

## 🚀 PrÃ³ximos Passos

1. ✅ Banco criado no Supabase
2. ✅ CÃ³digo no GitHub
3. ⚠️ Vincular Vercel ao GitHub (manual)
4. ⚠️ Completar mobile (Flutter)
5. ⚠️ Completar web (Next.js)

---

## 📞 Suporte

Se tiver dÃºvidas:
1. Abra uma issue no GitHub
2. Consulte a documentaÃ§Ã£o do Supabase
3. Veja os logs no dashboard da Vercel

---

**Desenvolvido por Leandro Antolini - 2026**

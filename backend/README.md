# Backend - API MVP Gestão de Obras

## Instalação

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

## Variáveis de Ambiente

Copie `.env.example` para `.env` e configure:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/obras_mvp?schema=public"
JWT_SECRET="sua_chave_secreta"
PORT=3000
```

## Rotas Principais

- `POST /auth/login` - Login
- `GET /obras` - Listar obras
- `GET /tarefas` - Listar tarefas
- `POST /evolucoes` - Registrar evolução
- `GET /localizacoes` - Localizações
- `POST /rdos/gerar` - Gerar RDO

Veja mais no código fonte.

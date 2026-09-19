# Obras — Gestão de produção

Aplicação web em Next.js + Supabase Auth/PostgreSQL/RLS, publicada automaticamente pela Vercel a partir de `main`. Diretório raiz da Vercel: `web`.

Produção: https://web-indol-rho-95.vercel.app

## Funcionalidades

- Cadastro por e-mail, login, sessão, saída e telas de recuperação de senha.
- Obras e frentes: cadastro, edição, arquivamento e restauração.
- Colaboradores, equipes e composição de equipes com datas de início/fim.
- Catálogo padrão de serviços (somente leitura) e catálogo privado por gestor.
- Compromissos semanais com metas e tarefas diárias atribuídas a equipe ou pessoa.
- Execução atômica: início, pausa, retomada, impedimento e conclusão; produção incremental e histórico imutável.
- Indicadores por serviço: metas, produção, horas previstas/reais, tarefas atrasadas e bloqueadas.
- RDO com clima, observação geral, itens executados e impressão.

## Desenvolvimento

Requer Node.js 22 ou superior.

```sh
cd web
npm ci
npm run dev
```

`npm run build` compila e verifica TypeScript. Copie `.env.example` para `.env.local` se precisar substituir o projeto. Os valores padrão de `web/lib/supabase.ts` são identificadores **públicos** deste projeto e garantem que o site funcione sem depender de variáveis ausentes na Vercel. Nunca incluir chaves secretas/service_role no frontend.

## Autenticação em produção

No Supabase Auth → URL Configuration, conferir:

- Site URL: `https://web-indol-rho-95.vercel.app`
- Redirect URLs: `https://web-indol-rho-95.vercel.app/obras` e `https://web-indol-rho-95.vercel.app/nova-senha`

Confirmação e recuperação dependem do envio de e-mail configurado no Supabase. O SMTP padrão tem restrições; configure SMTP próprio para cadastro público. Não desative confirmação para contornar erros de envio.

## Banco e segurança

`supabase/migrations` contém as migrações efetivamente aplicadas, incluindo o schema inicial e a migração anterior de Auth. Os timestamps correspondem ao histórico remoto. Não reaplicar scripts manualmente em produção.

- Todas as tabelas públicas têm RLS. `usuarios` legado e `localizacoes_periodicas` têm acesso de clientes revogado; ausência de políticas nessas duas tabelas é intencional.
- Os demais registros são isolados pelo proprietário da obra. Serviços padrão não possuem dono e são somente leitura; serviços privados pertencem ao gestor.
- Triggers impedem transferir registros, falsificar autoria e vincular registros de obras diferentes.
- Eventos são inseridos por uma função atômica com bloqueio de tarefa e verificação explícita do proprietário. O cliente não recebe permissão para editar status diretamente nem alterar eventos passados.
- Não há exclusão física pelo aplicativo; cadastros usam arquivamento.
- A obra antiga sem `dono_id` foi preservada e não foi atribuída a uma conta arbitrariamente.
- A unidade de serviços utilizados e o planejamento de tarefas iniciadas são protegidos contra alteração.

Teste de integração SQL (executar em conexão administrativa): `supabase/tests/isolation.sql`. Usa duas identidades temporárias, valida CRUD/isolamento/relações/execução/RDO e faz rollback. Não há credenciais reais no teste.

## Legado e limites

`backend/` é referência NestJS/Prisma. Seus módulos antigos de autenticação, usuários, obras e frentes foram retirados do AppModule; um deploy desse commit deixa apenas o health check. A aplicação web não utiliza Render. A disponibilidade e publicação do serviço Render precisam ser verificadas separadamente caso continue ativo.

`mobile/` contém apenas o protótipo Flutter antigo, ainda não migrado. Fotos, anexos, GPS, offline, Realtime e integrações ficam para etapas futuras. RDO é preenchido pelo gestor; não importa automaticamente os apontamentos. Indicadores de horas usam intervalos de execução da tarefa, não homem-hora.

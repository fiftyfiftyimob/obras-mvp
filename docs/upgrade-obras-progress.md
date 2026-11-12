# Progresso da integração BIM e almoxarifado

Este arquivo registra a sequência de 10 entregas do Obras MVP para permitir retomada sem depender do histórico do chat. Infraestrutura: GitHub, Supabase e Vercel. Não usar Render.

| Etapa | Entrega | Estado | Referência |
| --- | --- | --- | --- |
| 1 | Importar IFC, extrair e conferir revisões e quantitativos | Integrada | PR #48 |
| 2 | Vincular quantitativos BIM a serviços com unidade compatível | Integrada | PR #49 |
| 3 | Oferecer o total BIM ao planejamento semanal | Integrada | PR #50 |
| 4 | Catálogo, almoxarifados e solicitações de materiais por frente | Integrada | PR #51 |
| 5 | Estoque: saldo, reserva, entrega, devolução, transferência, contagem e estorno | Integrada | PR #52 |
| 6 | Cronograma mestre, pacotes da EAP e comparação de revisões BIM | Em validação | PR #53 |
| 7 | Fornecedores e mapa de cotações com custo entregue e prazo | Pendente | — |
| 8 | Pedidos e recebimentos parciais ligados ao estoque | Pendente | — |
| 9 | Previsão de falta e indicadores de custo e abastecimento no Dashboard, com exportação | Pendente | — |
| 10 | Homologação do piloto e conectores priorizados conforme as ferramentas reais da obra | Pendente | — |

## Critérios de retomada

- Após cada entrega, verificar migração Supabase, build Vercel, permissões e fluxo de operação; fazer merge somente após esses controles.
- A obra de teste é a obra 19, Residencial Horizonte — Teste Operacional. Os testes de banco devem usar transações revertidas ou registros identificados e removidos de forma segura.
- PR #52 integrou a etapa 5. Migrações aplicadas e deploy de produção READY. Testes transacionais cobriram saldo inicial, reserva, baixa parcial, devolução, transferência, contagem, estorno e idempotência. Um teste de conta sem acesso encontrou e corrigiu uma falha antes do merge.
- PR #53 contém a etapa 6. As migrações de pacotes, comparação de revisões, capacidade, decisões de replanejamento, rascunhos e propostas estão aplicadas. Testes transacionais cobriram publicação repetida, limite de quantitativo, acesso, comparação IFC, substituição preservando compromisso publicado, descarte de rascunho e edição de proposta. Conferir build do commit final e fazer merge.
- A validação visual autenticada das etapas 4 a 6 ainda precisa ser feita com uma sessão de teste. Não pedir senha no chat; orientar login seguro quando chegar a hora. Enquanto isso, prosseguir nas entregas que podem ser verificadas por código e banco.

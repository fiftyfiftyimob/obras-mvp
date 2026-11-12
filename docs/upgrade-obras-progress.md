# Progresso da integração BIM e almoxarifado

Este arquivo registra a sequência de 10 entregas do Obras MVP para permitir retomada sem depender do histórico do chat. Infraestrutura: GitHub, Supabase e Vercel. Não usar Render.

| Etapa | Entrega | Estado | Referência |
| --- | --- | --- | --- |
| 1 | Importar IFC, extrair e conferir revisões e quantitativos | Integrada | PR #48 |
| 2 | Vincular quantitativos BIM a serviços com unidade compatível | Integrada | PR #49 |
| 3 | Oferecer o total BIM ao planejamento semanal | Integrada | PR #50 |
| 4 | Catálogo, almoxarifados e solicitações de materiais por frente | Integrada | PR #51 |
| 5 | Estoque: saldo, reserva, entrega, devolução, transferência, contagem e estorno | Integrada | PR #52 |
| 6 | Cronograma mestre, pacotes da EAP e comparação de revisões BIM | Integrada | PR #53 |
| 7 | Fornecedores e mapa de cotações com custo entregue e prazo | Integrada | PR #54 |
| 8 | Pedidos e recebimentos parciais ligados ao estoque | Integrada | PR #55 |
| 9 | Previsão de falta e indicadores de custo e abastecimento no Dashboard, com exportação | Integrada | PR #56 |
| 10 | Homologação do piloto e conectores priorizados conforme as ferramentas reais da obra | Em validação | PR #57 |

## Critérios de retomada

- Após cada entrega, verificar migração Supabase, build Vercel, permissões e fluxo de operação; fazer merge somente após esses controles.
- A obra de teste é a obra 19, Residencial Horizonte — Teste Operacional. Os testes de banco devem usar transações revertidas ou registros identificados e removidos de forma segura.
- PR #52 integrou a etapa 5. Migrações aplicadas e deploy de produção READY. Testes transacionais cobriram saldo inicial, reserva, baixa parcial, devolução, transferência, contagem, estorno e idempotência. Um teste de conta sem acesso encontrou e corrigiu uma falha antes do merge.
- PR #53 integrou a etapa 6. As migrações de pacotes, comparação de revisões, capacidade, decisões de replanejamento, rascunhos e propostas estão aplicadas. Testes transacionais cobriram publicação repetida, limite de quantitativo, acesso, comparação IFC, substituição preservando compromisso publicado, descarte de rascunho e edição de proposta. Build e deploy de produção READY.
- A validação visual autenticada das etapas 4 a 6 ainda precisa ser feita com uma sessão de teste. Não pedir senha no chat; orientar login seguro quando chegar a hora. Enquanto isso, prosseguir nas entregas que podem ser verificadas por código e banco.

- O PR #54 integrou a etapa 7: fornecedores por obra, cotações por material/quantidade e propostas com custo entregue calculado no banco. Migrações aplicadas, testes transacionais de permissões e propostas passaram; deploy de produção verificado.

- O PR #55 integrou a etapa 8: pedido a partir da cotação escolhida, recebimentos parciais e estorno vinculados ao estoque. Migrações aplicadas e teste transacional do fluxo principal passou. Build READY e testes de excesso, idempotência, estorno e acesso sem vínculo passaram.

- A etapa 9 está no PR #56: projeção de faltas por material/almoxarifado e data, indicadores de custo e abastecimento, exportação Excel para Power BI. Validar cálculo e build antes do merge.

- O PR #56 integrou a etapa 9; build e deploy de produção READY. A etapa 10 está no PR #57 com teste integrado revertido, auditoria de segurança e relatório em `docs/homologacao-piloto-bim-suprimentos.md`. Faltam validação visual autenticada e nomes das ferramentas BIM/ERP para priorizar conector específico. Não marcar 10/10 antes desses itens.

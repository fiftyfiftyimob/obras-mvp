# Progresso da integração BIM e almoxarifado

Registro de retomada do Obras MVP. Infraestrutura: GitHub, Supabase e Vercel. Sem Render e sem cópia local do repositório.

## Base BIM e suprimentos

| Etapa | Entrega | Estado | Referência |
| --- | --- | --- | --- |
| 1 | Importação IFC, extração e quantitativos | Integrada | PR #48 |
| 2 | Vínculo BIM com serviços e unidades | Integrada | PR #49 |
| 3 | Total BIM no planejamento semanal | Integrada | PR #50 |
| 4 | Catálogo, almoxarifados e solicitações | Integrada | PR #51 |
| 5 | Estoque, reserva e movimentações auditáveis | Integrada | PR #52 |
| 6 | Cronograma, pacotes EAP e comparação de revisões | Integrada | PR #53 |
| 7 | Fornecedores e cotações | Integrada | PR #54 |
| 8 | Pedidos e recebimentos parciais | Integrada | PR #55 |
| 9 | Previsão de falta, custo, Dashboard e exportação | Integrada | PR #56 |
| 10 | Piloto integrado e correções de operação | Integrada | PRs #57–#60 |

O piloto autenticado e os resultados do fluxo de compras estão em `docs/homologacao-piloto-bim-suprimentos.md`. A etapa 10 encerra o fluxo aberto e seu piloto; a escolha de um conector proprietário foi retirada desse critério porque depende dos futuros clientes.

## Fechamento da versão aberta para produto

| Item | Entrega | Estado | Referência |
| --- | --- | --- | --- |
| 1/5 | Revisão IFC conferida por responsável e extração robusta | Integrado | PRs #61 e #62 |
| 2/5 | Composições de materiais por serviço e aprovação | Integrado | PR #63 |
| 3/5 | Catálogos e compras em CSV | Integrado | PR #64 |
| 4/5 | Contrato de conectores por cliente | Documentado | PR #65 |
| 5/5 | Homologação técnica, matriz de testes e limites comerciais | Documentado | `docs/homologacao-produto-aberto-v1.md` |

Critério desta versão: fluxos abertos IFC/CSV, controles humanos de revisão e compras, sem dependência de fabricante de software. O limite de upload de 200 MB ainda não foi homologado nessa escala. A configuração de Auth para cadastro público, modelos reais de um cliente e adaptadores proprietários pertencem à preparação do piloto comercial, conforme a homologação.

## Retomada

- Obra de teste: 19, Residencial Horizonte — Teste Operacional. Testes novos devem usar transações revertidas ou registros fictícios identificados.
- Código mais recente de produção: PR #64, deploy READY. PR #65 é documentação e não exigiu novo deploy.
- Migrações das revisões IFC, composições e CSV estão aplicadas; o projeto Supabase foi verificado como ACTIVE_HEALTHY.
- Para novo cliente, primeiro levantar o IFC, planilhas e sistemas em uso. Usar `docs/conectores-por-cliente.md` para decidir se precisa de adaptador específico.

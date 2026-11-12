# Homologação técnica do piloto BIM e suprimentos

Data: 2026-11-12. Obra de teste: Residencial Horizonte — Teste Operacional (ID 19). Infraestrutura: GitHub, Supabase e Vercel; sem Render e sem cópia local do repositório.

## Entregas integradas

- 1–3: importação IFC, quantitativos, vínculo com serviços e sugestão para o planejamento.
- 4–5: catálogo, solicitações, almoxarifados e estoque auditável.
- 6: pacotes EAP, capacidade, propostas semanais e comparação de revisões.
- 7–8: fornecedores, cotações, pedidos, recebimentos parciais e estorno.
- 9: projeção de falta, indicadores e exportação Excel para Power BI.

## Verificações realizadas

| Verificação | Resultado |
| --- | --- |
| Migrações Supabase das etapas 1–8 | Aplicadas |
| Builds e deploys de produção das etapas 6–9 | READY |
| Piloto transacional: quantitativo IFC → serviço → pacote → proposta semanal → compromisso | Passou; transação revertida |
| Piloto transacional: cotação → pedido → recebimento parcial → saldo físico | Passou; transação revertida |
| Publicação semanal, pedido e recebimento repetidos | Idempotência verificada |
| Quantidade de pedido excedida e estorno direto de recebimento pelo extrato | Bloqueados |
| Conta sem vínculo na obra | Não pôde escolher cotação, criar pedido, receber ou estornar |
| Projeção de falta | Cenários testados com demanda antes da entrega, pedido atrasado e entrega no mesmo dia |
| Auditoria de execução anônima das 15 rotinas elevadas BIM/compras | 0 executáveis após migração de segurança; 15 disponíveis a autenticados |

## Limites da homologação atual

- Não havia sessão autenticada aberta no navegador para percorrer visualmente os formulários e a exportação. A validação visual deve ser feita pelo titular entrando no aplicativo diretamente; nunca transmitir senha no chat.
- A obra 19 possui IFC de teste com quatro elementos, mas não há registros permanentes de material, cotação ou pedido. Os testes de banco foram revertidos para não misturar dados artificiais aos dados da obra.
- O custo recebido no Dashboard é estimado pela fração física do pedido; não é reconciliação com notas fiscais.
- A projeção usa solicitações aprovadas e pedidos com data futura. Não transforma automaticamente quantitativos IFC em lista de materiais; para isso é necessário definir composições de consumo por serviço e validar com o engenheiro.
- A auditoria Supabase ainda aponta funções SECURITY DEFINER acessíveis a usuários autenticados, que são necessárias para os fluxos RPC; elas validam papel da obra. Aponta também proteção contra senhas vazadas não habilitada no Auth e índices de desempenho potenciais. Esses pontos devem ser avaliados antes de uso com dados reais em escala.

## Conectores

1. **IFC de arquivo:** é o conector BIM universal já implementado; continuar usando até a ferramenta de autoria ser identificada.
2. **Exportação Excel para Power BI:** já disponível no Dashboard, com IDs de ligação e metodologia.
3. **Conector da ferramenta BIM de autoria:** escolher após confirmar produto, versão, formato IFC exportado, requisitos de revisão e disponibilidade de API. A importação automática deve preservar a revisão original e nunca substituir medições aprovadas sem conferência.
4. **Conector do ERP/compras:** escolher após identificar produto e API. Pedidos externos devem usar identificadores estáveis e reconciliação de recebimentos para evitar duplicações.

## Próximas ações para encerrar a etapa 10

- Percorrer com sessão autenticada os fluxos BIM, Materiais e Dashboard na obra 19, inclusive download da planilha.
- Confirmar software BIM e ERP/compras usados na operação e priorizar um conector concreto com credenciais próprias e escopo mínimo.
- Validar com o engenheiro uma composição de materiais por serviço antes de usar quantitativos IFC para compra automática.

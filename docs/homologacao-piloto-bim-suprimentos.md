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

## Piloto visual autenticado

- Sessão já autenticada de Leandro na obra 19; nenhuma senha ou código foi transmitido no chat.
- Projeto BIM mostrou revisão IFC4 concluída, quatro elementos e zero pendências, além dos formulários de pacote EAP.
- Na aba Materiais, foram cadastrados `Bloco cerâmico PILOTO`, `Almoxarifado PILOTO` e `Fornecedor Fictício PILOTO`.
- Cotação #12: 150 unidades, dois paletes de compra, proposta de R$ 1.050,00, escolhida no aplicativo.
- Pedido #6: 150 unidades; recebimento parcial de 80 unidades com documento `TESTE-PILOTO-SEM-NF`. O extrato confirmou entrada física de 80 unidades.
- Solicitação #4: 180 unidades aprovadas para 17/11/2026. O Dashboard apontou falta de 100 unidades nessa data, pois as 70 unidades restantes do pedido têm entrega prevista para 18/11/2026. Indicou R$ 1.050,00 contratados e R$ 560,00 recebidos estimados.
- A exportação de suprimentos para Power BI produziu `obras-suprimentos-19-2026-11-12.xlsx`.
- O teste encontrou estados desatualizados entre cotação/pedido e recebimento/estoque, além de botão de estorno no lugar errado. Corrigidos no PR #58.

## Limites da homologação atual

- A obra 19 possui IFC de teste com quatro elementos. O vínculo IFC → pacote EAP foi validado em transação revertida, mas ainda não há um pacote BIM permanente aprovado nesta obra.
- O piloto visual criou registros identificados como fictícios na obra de teste para demonstrar a cadeia de compras. Eles permanecem visíveis para conferência e não representam encomenda a fornecedor real.
- O custo recebido no Dashboard é estimado pela fração física do pedido; não é reconciliação com notas fiscais.
- A projeção usa solicitações aprovadas e pedidos com data futura. Não transforma automaticamente quantitativos IFC em lista de materiais; para isso é necessário definir composições de consumo por serviço e validar com o engenheiro.
- A auditoria Supabase ainda aponta funções SECURITY DEFINER acessíveis a usuários autenticados, que são necessárias para os fluxos RPC; elas validam papel da obra. Aponta também proteção contra senhas vazadas não habilitada no Auth e índices de desempenho potenciais. Esses pontos devem ser avaliados antes de uso com dados reais em escala.

## Conectores

1. **IFC de arquivo:** é o conector BIM universal já implementado; continuar usando até a ferramenta de autoria ser identificada.
2. **Exportação Excel para Power BI:** já disponível no Dashboard, com IDs de ligação e metodologia.
3. **Conector da ferramenta BIM de autoria:** escolher após confirmar produto, versão, formato IFC exportado, requisitos de revisão e disponibilidade de API. A importação automática deve preservar a revisão original e nunca substituir medições aprovadas sem conferência.
4. **Conector do ERP/compras:** escolher após identificar produto e API. Pedidos externos devem usar identificadores estáveis e reconciliação de recebimentos para evitar duplicações.

## Próximas ações para encerrar a etapa 10

- Confirmar software BIM e ERP/compras usados na operação e priorizar um conector concreto com credenciais próprias e escopo mínimo.
- Validar com o engenheiro uma composição de materiais por serviço antes de usar quantitativos IFC para compra automática.

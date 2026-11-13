# Homologação da versão aberta BIM e suprimentos

Data: 12/11/2026. Obra de teste: Residencial Horizonte — Teste Operacional (19). Esta versão atende operações que trocam arquivos IFC e CSV. Conectores proprietários dependem dos sistemas usados por cada cliente.

## Cinco entregas de fechamento

| Item | Entrega | Evidência | Estado |
| --- | --- | --- | --- |
| 1 | Conferência humana de revisões IFC e validação de quantitativos | PRs #61 e #62; migração aplicada; teste de permissão e pacote EAP revertido; GitHub Actions 43330810347 concluiu IFC2x3, IFC4 e IFC4x3 | Concluído |
| 2 | Composições de materiais por serviço, versionadas e aprovadas | PR #63; migração aplicada; testes transacionais de aprovação, substituição, acesso e imutabilidade; tela em produção | Concluído |
| 3 | Troca de catálogos e compras em CSV | PR #64; importação atômica, deduplicação e RLS testadas; exportação de pedido verificada no navegador; deploy de produção READY | Concluído |
| 4 | Contrato para conectores específicos por cliente | PR #65; mapeamentos, identificadores, idempotência, segurança e critérios de ativação documentados | Concluído como preparação; nenhum conector proprietário está ativo |
| 5 | Homologação técnica da versão aberta | Verificações abaixo e este registro | Concluído com limites de escala e lançamento público abaixo |

## Matriz de verificação

| Fluxo ou controle | Resultado |
| --- | --- |
| Upload e extração IFC de teste na obra 19 | Revisão IFC4 concluída, quatro elementos, zero pendências |
| Extrator com amostras públicas | IFC2x3, IFC4 e IFC4x3 passaram no CI; maior arquivo usado: 2.380.763 bytes |
| Revisão IFC antes de criar pacote EAP | Bloqueio antes da conferência e criação após a conferência; transação revertida |
| Isolamento de revisão por obra | Conta sem acesso não conseguiu conferir ou manipular revisão |
| Composição: rascunho, aprovação e nova versão | Uma versão vigente por obra/serviço; versão anterior arquivada; transações revertidas |
| Composição aprovada | Exclusão de itens/cabeçalho e alteração do estado bloqueadas; transação revertida |
| Catálogo CSV | Importação de 2 linhas, repetição sem duplicar, falha atômica em linha inválida e acesso negado sem vínculo; transações revertidas |
| Exportação CSV | Download real de pedidos na obra 19 com cabeçalhos de versão, IDs, datas e números legíveis por planilha |
| Produção | Último deploy de código do PR #64 em READY; telas Projeto BIM e Materiais conferidas em sessão autenticada |
| Banco | Projeto Supabase ACTIVE_HEALTHY; alertas de segurança e desempenho revisados |

Os testes de banco foram executados em transações revertidas. Não foram criados pedidos ou compras reais nesta homologação. O pedido fictício do piloto anterior permanece na obra 19, identificado como teste.

## Limites e decisões antes de vender para clientes

- O upload aceita até 200 MB por configuração, mas a homologação automatizada alcançou somente 2,38 MB. Testar modelos reais maiores, de várias disciplinas, e medir tempo e memória de extração no ambiente de produção antes de prometer operação nessa escala.
- O IFC é um meio de troca aberto, não uma garantia de quantitativos corretos. O engenheiro deve conferir unidades, origem e revisão antes de liberar pacotes; a nova trava de conferência apoia esse processo.
- Composição é estimativa configurada e aprovada por obra. A aplicação não emite compra automaticamente a partir do BIM; quantidades e desperdício precisam de validação profissional.
- CSV v1 troca dados, mas não sincroniza continuamente com ERP. O contrato de conectores está em `docs/conectores-por-cliente.md`. Selecionar e testar um adaptador somente quando houver software e cliente definidos.
- O custo recebido no Dashboard é estimado pela fração física do pedido; não há conciliação fiscal com nota.
- O auditor de segurança do Supabase apontou proteção contra senhas vazadas desativada. Segundo a documentação oficial, esse recurso exige plano Pro ou superior. Conferir o plano e ativá-lo em Auth antes de abrir cadastro público. Também conferir confirmação de e-mail, validade de links e SMTP próprio para uso comercial.
- O auditor apontou funções SECURITY DEFINER autenticadas e chaves estrangeiras sem índices potenciais. As novas rotinas foram testadas com conta sem acesso. Monitorar consultas reais e criar índices onde houver gargalo medido.

## Critério de piloto comercial

Aceitar um primeiro cliente apenas com escopo explícito: importação IFC revisada por engenheiro, compras/estoque no próprio sistema e importação/exportação CSV. Antes de receber dados reais, validar um IFC do cliente e uma planilha real, configurar Auth e e-mails de produção, e executar uma rodada de aceitação com engenheiro, encarregado e perfil de compras. Conectores de BIM/ERP entram como projeto separado, após o levantamento das APIs e permissões do cliente.

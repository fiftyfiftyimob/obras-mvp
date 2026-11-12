# Troca de dados de compras — CSV v1

A aba **Materiais → Troca de dados de compras** permite começar sem ERP. Os arquivos usam UTF-8 com BOM, colunas separadas por ponto e vírgula, cabeçalho obrigatório e datas ISO `AAAA-MM-DD`. Valores numéricos exportados usam ponto decimal, sem moeda. Planilhas com vírgula decimal são aceitas nos modelos de importação de materiais.

## Entrada

Baixe o modelo no aplicativo, preencha de 1 a 500 linhas e confira a prévia antes de importar. A operação é atômica: se uma linha falhar, nenhuma é salva. Nomes já presentes na mesma obra são ignorados; a importação não altera registros existentes.

| Catálogo | Colunas obrigatórias, nesta ordem |
| --- | --- |
| Materiais | `nome;especificacao;unidade_estoque;unidade_compra;quantidade_por_embalagem` |
| Fornecedores | `nome;documento;contato;telefone;email` |

Unidades de estoque aceitas: `un`, `m`, `m²`, `m³`, `kg`, `l`. A unidade de compra é livre (por exemplo, `palete`); a quantidade por embalagem converte uma unidade de compra na unidade de estoque. Um fornecedor com o mesmo documento ou nome na obra também é ignorado. Somente administrador, engenheiro ou supervisor importa catálogos.

## Saída

Os botões exportam quatro arquivos: `materiais`, `fornecedores`, `pedidos` e `recebimentos`. Cada linha contém `schema_version=1`, `obra_id` e os campos do registro. IDs internos relacionam pedido, fornecedor, material, almoxarifado e recebimento. Reimportar esses arquivos diretamente não é suportado; são formatos de intercâmbio para mapeamento com o ERP do cliente.

Pedidos externos e alterações de estoque devem continuar sendo confirmados no Obras. A exportação não envia pedido a fornecedores nem sincroniza automaticamente com ERP. Registros fictícios da obra de teste não representam compra real.

## Integração por cliente

Ao desenvolver um conector, mapear os IDs internos para IDs externos persistentes; usar `pedido.id` e `recebimento.id` como chaves de idempotência. Reconciliar estados e quantidades antes de criar nova operação para evitar pedido ou entrada de estoque duplicada. Credenciais externas devem ficar no servidor, com escopo mínimo por cliente.

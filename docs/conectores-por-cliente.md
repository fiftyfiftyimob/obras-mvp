# Conectores por cliente — contrato de integração

## Alcance da versão atual

O Obras opera sem software proprietário: importa IFC por revisão, exige conferência humana antes de criar pacotes BIM, administra materiais e compras internamente e troca CSV v1 com outros sistemas. **Nenhum ERP ou programa BIM está conectado automaticamente nesta versão.** Um conector só será anunciado como disponível depois de testado com a versão e a conta do cliente.

IFC é o formato de entrada independente de fabricante. As exportações dos diferentes programas podem omitir quantitativos, unidades ou identificadores. O sistema preserva o arquivo e as pendências; não transforma dados incompletos em compra automática.

## Contrato mínimo para um conector BIM

1. Identificar `obra_id`, fornecedor, produto e versão do software de autoria.
2. Receber arquivo IFC-SPF original e criar uma **nova** `bim_importacoes.id` e revisão; guardar nome, tamanho, origem, data e hash do arquivo quando o conector existir. Nunca sobrescrever arquivo ou revisão já conferida.
3. Deixar o extrator e o usuário verificarem esquema, GlobalId, unidades, quantitativos e pendências. Só engenheiro/administrador libera a revisão para planejamento.
4. A comparação entre revisões é informativa. Pacotes e medições aprovados permanecem na linha de base até uma decisão explícita de replanejamento.
5. Repetir a entrega do mesmo evento não pode criar segunda revisão: o conector deverá guardar a chave externa de versão e o hash do arquivo por obra.

## Contrato mínimo para um conector ERP/compras

| Direção | Origem no Obras | Chave estável | Regra |
| --- | --- | --- | --- |
| Saída de pedido | `pedidos_compra` | `obra_id` + `pedido.id` | Enviar somente após ativação explícita; não recriar pedido em retentativas. |
| Saída de cancelamento | `pedidos_compra` | mesma chave do pedido | Conciliar estado externo antes de confirmar cancelamento. |
| Entrada de recebimento | `recebimentos_compra` ou evento externo | `obra_id` + ID externo do recebimento | Evitar dupla entrada; conferir material, almoxarifado e quantidade antes de movimentar estoque. |
| Catálogos | `materiais`, `fornecedores_materiais` | ID interno + ID externo por obra | Mapear unidades e fornecedor sem misturar dados de clientes. |

A implementação deverá manter uma tabela de correspondência entre IDs internos e externos, com unicidade por `obra_id`, tipo de registro e sistema externo. Deve registrar tentativa, resultado, erro e próxima retentativa. A confirmação externa não substitui uma decisão humana de compra nem reconcilia automaticamente nota fiscal ou pagamento. O CSV v1 documentado em [troca-dados-compras-csv.md](troca-dados-compras-csv.md) serve como caminho inicial de interoperabilidade.

## Segurança e ativação

- Cada cliente autoriza sua própria integração. Credenciais e tokens ficam somente no servidor, em armazenamento de segredos com rotação; nunca no navegador, CSV, GitHub ou texto de suporte.
- Usar OAuth ou credencial com o menor escopo oferecido pelo fornecedor. Acesso de uma obra não autoriza ler ou alterar outra.
- A integração começa inativa, passa por testes em ambiente de homologação do cliente e só é ativada por administrador da obra.
- Validar assinatura de webhooks, limitar tamanho de payload, registrar auditoria sem gravar segredos e tratar erros sem repetir efeitos.
- Nunca usar a chave `service_role` como credencial entregue a um cliente ou parceiro.

## Dados necessários na implantação de cada cliente

- Produto BIM e versão; exemplo de IFC exportado, esquema declarado e regras de revisão.
- Produto ERP/compras e versão; documentação de API, ambiente de testes, formato de pedido e recebimento, regras de autenticação e limites.
- Responsável por conferir composições de materiais, unidades, perdas e aprovar compras.
- Matriz de campos, identificadores e estados entre os dois sistemas.

## Critério para declarar um conector disponível

Teste com dois clientes/obras isolados, arquivo ou pedido repetido, falha e retentativa, cancelamento, recebimento parcial e quantidades divergentes. Confirmar no aplicativo e no sistema externo que não houve revisão, pedido ou estoque duplicado. Publicar a versão e os limites de suporte do conector.

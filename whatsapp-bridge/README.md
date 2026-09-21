# Conector central do WhatsApp

Serviço único que mantém a conta de WhatsApp da empresa conectada, entrega as
tarefas enfileiradas no Supabase e registra respostas, produção, impedimentos e
fotos dos operários.

## Configuração

Use Node.js 22 ou superior e configure somente no ambiente do servidor:

```bash
cp .env.example .env
npm ci
npm start
```

- `SUPABASE_URL`: URL do projeto.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta usada apenas neste serviço.
- `WHATSAPP_SESSION_PATH`: diretório temporário usado pelo navegador.
- `OUTBOX_INTERVAL_MS`: intervalo de consulta da fila de saída.
- `CONTROL_INTERVAL_MS`: intervalo de leitura dos comandos conectar/desconectar.
- `PORT`: porta HTTP fornecida pelo Render.

A sessão compactada fica no bucket privado `whatsapp-sessao`. Assim, reinícios e
o disco temporário do Render não obrigam um novo pareamento. O endpoint HTTP
retorna apenas o estado básico do processo e serve como health check.

## Fluxo

1. O gestor abre **WhatsApp** no site e solicita a conexão.
2. O QR Code aparece no próprio site.
3. O gestor ativa o WhatsApp do operário usando o telefone do cadastro.
4. Cada tarefa só entra na fila quando o gestor clica em **Enviar pelo WhatsApp**.
5. O operário responde usando o menu numérico, sem conta no sistema e sem código
   de ativação.

Este conector usa automação não oficial do WhatsApp Web. Mudanças ou bloqueios
do WhatsApp podem interromper o funcionamento e exigir novo pareamento.

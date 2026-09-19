# Conector WhatsApp do operário

Conector local e não oficial entre WhatsApp Web e o Supabase do Obras MVP. Ele mantém a sessão no computador, processa mensagens individuais e entrega a fila acumulada quando volta a ficar online.

## Preparação

1. Instale Node.js 20 ou superior e Google Chrome/Chromium.
2. Copie `.env.example` para `.env`.
3. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A chave de servidor deve existir somente neste computador.
4. Execute `npm install` e depois `npm start`.
5. Escaneie o QR Code com um número de WhatsApp exclusivo para o projeto.

O diretório `.wwebjs_auth` guarda a sessão local. Não copie, não compartilhe e não versione esse diretório.

## Operação

No painel, abra a obra, entre em **Pessoas** e gere o acesso do colaborador. O conector enviará um código com validade de 24 horas. Depois da ativação, o operário pode listar tarefas, iniciar, registrar produção, pausar, retomar, informar impedimento, solicitar conclusão e enviar uma foto para a tarefa ativa.

Para encerrar, use `Ctrl+C`. Ao iniciar novamente, a sessão persistida costuma dispensar um novo QR Code e a fila pendente volta a ser enviada.

## Aviso

`whatsapp-web.js` automatiza o WhatsApp Web e não é uma API oficial. Há risco de desconexão ou bloqueio do número. Use um número dedicado, conversas individuais, baixo volume e nada de disparos em massa. A evolução recomendada é migrar para a API oficial ou para o aplicativo Flutter quando o piloto validar o fluxo.

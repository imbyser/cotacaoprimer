# Prazo e fechamento do recebimento

## Regra para o usuário

- O prazo padrão é de 24 horas.
- É possível escolher de 1 a 720 horas antes de abrir ou reabrir o recebimento.
- A contagem começa quando o responsável toca em **Enviar no WhatsApp** ou **Compartilhar** pela primeira vez.
- Enquanto a cotação está aberta, o prazo fica travado para evitar mudança acidental.
- **Fechar recebimento** bloqueia novos envios e atualizações dos fornecedores.
- **Reabrir** começa uma nova contagem com o prazo escolhido.
- Fechar, expirar ou reabrir não apaga produtos, fornecedores, preços nem pedidos já recebidos.

## Compatibilidade com cotações existentes

Os campos são opcionais e não existe migração em massa. Uma cotação antiga que ainda não possui os campos abaixo continua aceitando respostas, preservando os links que clientes já enviaram. Ao compartilhar novamente, o novo prazo passa a ser registrado.

Campos adicionados ao documento de `cotacoes`:

- `prazoRecebimentoHoras`
- `recebimentoIniciadoEm`
- `recebimentoExpiraEm`
- `recebimentoFechadoEm`

## Proteções do fluxo

O fornecedor é bloqueado ao abrir um link fechado ou expirado. O estado também é consultado novamente dentro da transação de envio, impedindo que uma aba deixada aberta grave preços depois do encerramento normal.

## Restauração

O estado anterior está marcado na branch `backup/antes-fechamento-cotacao-20260911` e na tag `backup-antes-fechamento-cotacao-20260911`. O pacote Git completo e o backup somente de leitura do Firestore ficam fora do repositório, em `backups/cotacao-prime/2026-09-11-before-quote-closing/`.

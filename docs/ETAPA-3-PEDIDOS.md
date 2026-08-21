# Etapa 3 — pedidos por fornecedor

## Diagnóstico

A tela ficava dividida porque `.carrinho-bar` era fixa, ocupava até 52–56% da altura da janela e o `body` reservava 380–420 px no fim da página. Com vários vencedores, o usuário precisava rolar duas áreas diferentes.

O agrupamento e os totais já estavam corretos em `assets/quote-core.js`. Nenhuma mudança de banco de dados era necessária.

## Decisão aplicada

- As etapas 1 e 2 mantêm o rodapé e as posições existentes.
- Somente a etapa 3 adiciona a classe `etapa-pedido` ao `body` e transforma o rodapé em conteúdo normal da página.
- Cada fornecedor vencedor aparece fechado com nome, quantidade de produtos, unidades e total.
- Ao abrir, aparecem itens, embalagem, quantidade, preço, subtotal e o mesmo envio pelo WhatsApp.
- Apenas um fornecedor permanece aberto por vez.
- A partir de oito fornecedores, aparece a busca por nome.

## Módulos

- `assets/order-panel.js`: modelo, busca, cartões, abertura/fechamento e eventos do painel.
- `assets/order-panel.css`: toda a aparência responsiva da etapa 3.
- `assets/quote-core.js`: matemática em centavos e agrupamento, sem mudança de responsabilidade.
- `index.html`: coleta os itens e conecta o painel ao envio já existente.

## Segurança e compatibilidade

O módulo não acessa Firebase, Mercado Pago ou cadastro de clientes. Ele recebe o resumo já calculado e apenas monta a interface. O envio continua usando `enviarWhatsappVencedor`, com a mesma mensagem e os mesmos totais.

## Valores dos planos

O checkout cria preferências dinâmicas no Mercado Pago; não usa links fixos. Os valores cobrados ficam no backend e são conferidos novamente quando o pagamento é aprovado:

- Mensal: R$ 149,00.
- Trimestral: R$ 327,00, equivalente a R$ 109,00 por mês.
- Anual: R$ 1.068,00, equivalente a R$ 89,00 por mês.

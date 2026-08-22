# Cotação Prime

Sistema de cotação para mercadinhos e pequenos comércios. A loja monta uma lista, envia o link aos fornecedores, compara o menor preço de cada item e separa o pedido por fornecedor.

## Páginas

- `index.html`: entrada e sistema existente, com as etapas Lista, Preços e Pedido.
- `vendas.html`: apresentação, planos e início do pagamento.
- `admin.html`: administração protegida de contas, planos, acessos e senhas.
- `api/checkout.js`: criação da preferência e confirmação de pagamento do Mercado Pago.
- `api/admin-users.js`: operações administrativas executadas somente no servidor.

## Desenvolvimento local

```text
npm install
npm run check
npm test
```

Para inspecionar apenas as páginas estáticas, use um servidor HTTP local. Não teste com telefones, cotações ou contas reais.

## Variáveis da Vercel

O checkout exige:

- `MP_ACCESS_TOKEN`
- `FIREBASE_SERVICE_ACCOUNT`
- `CHECKOUT_DATA_SECRET`
- `MP_WEBHOOK_SECRET` (recomendado; ativa o Webhook assinado)
- `PUBLIC_SITE_URL` (opcional; útil quando houver domínio próprio)
- `ADMIN_WHATSAPP` (WhatsApp da única conta autorizada a administrar)
- `ADMIN_SESSION_SECRET` (segredo aleatório de pelo menos 32 caracteres para assinar a sessão)

Enquanto `MP_WEBHOOK_SECRET` não estiver cadastrado, novas preferências usam temporariamente o IPN oficial e a API autenticada do Mercado Pago. A ativação só ocorre depois de conferir pagamento aprovado, referência interna, plano, moeda e valor. O Webhook assinado deve substituir esse modo de compatibilidade assim que a chave for copiada do painel do Mercado Pago.

Nunca colocar valores dessas variáveis no Git.

## Administração

A administração fica em `/admin.html`. O login usa a conta indicada em `ADMIN_WHATSAPP` e abre uma sessão `HttpOnly`, sem guardar a senha no JavaScript. O painel não exibe senhas existentes e não oferece exclusão de clientes ou cotações; ele permite criar contas, editar nome, WhatsApp, plano e situação, além de redefinir a senha.

## Regra de segurança

O visual não exige migração de banco. Antes de qualquer publicação em produção:

1. criar e verificar backup somente de leitura do Firestore;
2. testar em prévia com dados fictícios;
3. validar webhook com credenciais de teste;
4. receber aprovação visual;
5. manter o deployment anterior pronto para rollback.

Consulte `docs/REDESIGN-SEGURO.md` e `docs/AUDITORIA-E-ENTREGA-LOCAL.md` antes de alterar autenticação, regras do Firebase ou schema.

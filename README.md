# Cotação Prime

Sistema de cotação para mercadinhos e pequenos comércios. A loja monta uma lista, envia o link aos fornecedores, compara o menor preço de cada item e separa o pedido por fornecedor.

## Páginas

- `index.html`: entrada e sistema existente, com as etapas Lista, Preços e Pedido.
- `vendas.html`: apresentação, planos e início do pagamento.
- `api/checkout.js`: criação da preferência e webhook do Mercado Pago.

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
- `MP_WEBHOOK_SECRET`
- `FIREBASE_SERVICE_ACCOUNT`
- `CHECKOUT_DATA_SECRET`
- `PUBLIC_SITE_URL` (opcional; útil quando houver domínio próprio)

Nunca colocar valores dessas variáveis no Git.

## Regra de segurança

O visual não exige migração de banco. Antes de qualquer publicação em produção:

1. criar e verificar backup somente de leitura do Firestore;
2. testar em prévia com dados fictícios;
3. validar webhook com credenciais de teste;
4. receber aprovação visual;
5. manter o deployment anterior pronto para rollback.

Consulte `docs/REDESIGN-SEGURO.md` e `docs/AUDITORIA-E-ENTREGA-LOCAL.md` antes de alterar autenticação, regras do Firebase ou schema.

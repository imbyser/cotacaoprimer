# Cotação Prime — auditoria e entrega local

Data: 20 de agosto de 2026

Branch de trabalho: `redesign/cotacao-prime-preservado`

## Estado dos dados

- Nenhum documento do Firebase foi criado, atualizado ou excluído durante este trabalho.
- Nenhum cliente, assinatura, cotação, preço, pedido ou etapa em andamento foi usado nos testes.
- A exportação do banco ainda não foi feita: a credencial antiga do repositório privado não tem mais permissão, e o segredo válido da Vercel não pode ser extraído pela CLI.
- Um exportador local estritamente de leitura está pronto em `scripts/export-firestore-readonly.js`. Ele recusa sobrescrever arquivos e não contém operação de escrita no Firebase, mas ainda não foi executado.
- O backup completo do código anterior ao redesign foi criado e verificado em:
  `/home/lcientes sites/backups/cotacao-prime/2026-08-20-before-redesign/`.
- O bundle Git verificado aponta para o commit anterior `44a74834273c282ad2a41c08b0b8245b8cf0da0c`.

## Infraestrutura encontrada

- GitHub: `imbyser/cotacaoprimer`, branch de produção `main`.
- Vercel: projeto `imbyser1/cotacaoprimer`, ligado ao mesmo repositório e à branch `main`.
- Endereço atual da Vercel: `https://cotacaoprimer.vercel.app`.
- Firebase: projeto `supercotacao-6a43c`, usado pelo sistema atual.
- O banco deve continuar no Firebase nesta etapa. Migrar os clientes agora para Neon, Supabase ou outro banco aumentaria o risco sem resolver primeiro a autenticação.

## Problemas críticos encontrados

| Problema | Risco para clientes | Situação nesta branch |
| --- | --- | --- |
| Senhas consultadas diretamente no Firestore e guardadas no `localStorage` | Exposição de acesso caso as regras estejam abertas ou o navegador seja comprometido | Mapeado; exige migração gradual de autenticação antes de mudar regras |
| Credencial administrativa em repositório privado antigo | Uma credencial vazada pode dar acesso administrativo | Não foi rotacionada para não quebrar sistemas desconhecidos; rotação deve ocorrer após mapear dependências |
| Página aceitava o preço enviado pelo navegador | Alguém poderia tentar pagar um valor alterado | Corrigido: valores agora existem somente no servidor |
| Webhook aceitava notificações sem assinatura | Ativação fraudulenta de assinatura | Corrigido no código com validação oficial `x-signature`; falta cadastrar o segredo na Vercel |
| Iniciar pagamento mudava cliente existente para `PENDENTE` | Um cliente ativo poderia perder o acesso antes de pagar | Corrigido: cliente existente só é alterado depois de pagamento aprovado |
| Voltar para uma cotação salva disparava novo salvamento | A simples abertura podia regravar data e conteúdo | Corrigido: renderização não agenda gravação |
| Ofertas usavam leitura e escrita separadas | Dois fornecedores ao mesmo tempo podiam apagar a resposta um do outro | Corrigido com transação atômica |
| Códigos aleatórios de seis dígitos | Colisão poderia misturar cotações | Novas cotações usam identificador automático; links antigos continuam válidos |
| Conteúdo do banco era inserido com `innerHTML` | Texto malicioso poderia executar código no navegador | Corrigido com criação segura de elementos e `textContent` |
| Links de pagamento voltavam para GitHub Pages | Usuário podia cair em outro endereço/versão | Corrigido para usar o mesmo domínio da requisição |
| Layout estourava em celulares estreitos | Campos e ações ficavam difíceis de usar | Corrigido e testado em 320, 375, 390 e 430 px |

## O que foi construído

- Nova identidade “Cotação Prime”, com logo vetorial e favicon.
- Landing page completa em `vendas.html`, com promessa direta, demonstração realista, planos visíveis, funcionamento, dúvidas e chamada final.
- Redesign controlado do sistema em `index.html`, preservando ordem e posição de entrada, barras, três etapas, lista e ação inferior.
- Textos simplificados para pessoas com pouca familiaridade digital.
- Controles maiores, foco visível, rótulos acessíveis e correções de responsividade.
- Checkout com catálogo de preços no servidor, dados temporários protegidos, retorno para o domínio correto, validação do pagamento e idempotência.
- Renovações agora conferem a senha atual e não trocam nome ou senha de um cliente existente.
- Cabeçalhos básicos de segurança na Vercel.
- Dependências atualizadas e travadas em `package-lock.json`.

## Testes realizados sem banco

- Sintaxe de `api/checkout.js` e `assets/landing.js`.
- Testes locais de validação do checkout, origem e métodos HTTP.
- Fluxo visual de escolha de plano, preenchimento e erro seguro com a API interceptada.
- Login e etapas 1, 2 e 3 com dados fictícios criados somente no DOM.
- Verificação de largura em 320, 375, 390, 430 e 1440 px: nenhum overflow horizontal encontrado.
- Rotas do Firestore foram bloqueadas durante a inspeção visual do sistema.
- Controles e campos visíveis foram verificados em 390 px: nenhum ficou abaixo de 44 px e nenhum campo ficou sem rótulo acessível.

Comandos locais aprovados:

```text
npm run check
npm test
```

O comando de backup, quando a credencial segura estiver disponível, será:

```text
npm run backup:firestore -- /caminho/seguro/backup.json
```

## Pendências que bloqueiam produção

1. Fazer e verificar um backup somente de leitura do Firestore de produção.
2. Obter no painel do Mercado Pago a chave secreta do webhook e cadastrar `MP_WEBHOOK_SECRET` na Vercel.
3. Cadastrar `CHECKOUT_DATA_SECRET` na Vercel.
4. Testar pagamento com credenciais e comprador de teste; não usar cobrança real.
5. Auditar as regras atuais do Firestore e preparar autenticação compatível com clientes antigos.
6. Publicar primeiro uma prévia privada, sem promover para produção.
7. Receber aprovação visual e funcional do cliente.
8. Só então integrar à `main`, com rollback pronto.

## Rollback

- Código: restaurar o bundle ou a cópia de trabalho no diretório de backup.
- Deploy: promover novamente o último deployment de produção conhecido na Vercel.
- Banco: o redesign não exige migração; portanto o rollback visual não deve reescrever documentos.
- Regras do Firebase: não alterar até existir cópia, teste no Emulator e plano separado de retorno.

## Dependências

O `npm audit` ainda aponta seis avisos moderados em dependências transitivas do Firebase Admin, inclusive usando a versão atual instalada. Não foi aplicado `npm audit fix --force`, pois a sugestão envolve troca incompatível de versão e poderia causar regressão. Não há aviso alto ou crítico no conjunto instalado desta branch.

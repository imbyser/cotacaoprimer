# Cotação Prime — auditoria e entrega local

Data inicial: 20 de agosto de 2026

Última revisão: 21 de agosto de 2026

Branches de trabalho: `redesign/cotacao-prime-preservado`, `fix/fluxo-fornecedor-calculos` e `feat/dashboard-listas-voz`

## Estado dos dados

- Nenhum documento do Firebase foi criado, atualizado ou excluído durante este trabalho.
- Nenhum cliente, assinatura, cotação, preço, pedido ou etapa em andamento foi usado nos testes.
- Uma exportação estritamente de leitura foi concluída antes do dashboard e da lista por voz: 123 documentos, SHA-256 `50b98b9cee1501ad515fcd7970e4a6549abadba10668b20659a390e315c6772f`.
- O exportador em `scripts/export-firestore-readonly.js` recusa sobrescrever arquivos e não contém operação de escrita no Firebase.
- O backup completo do código anterior ao redesign foi criado e verificado em:
  `/home/lcientes sites/backups/cotacao-prime/2026-08-20-before-redesign/`.
- O bundle Git verificado aponta para o commit anterior `44a74834273c282ad2a41c08b0b8245b8cf0da0c`.
- Um segundo ponto de retorno, anterior ao dashboard e à voz, está documentado em `docs/DASHBOARD-LISTAS-E-VOZ.md` e aponta para `156ab169f5fcb9b8b8d901f1abb58db425fb9f14`.

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
| Webhook aceitava notificações sem conferir referência e valor | Ativação fraudulenta de assinatura | Corrigido: Webhook assinado quando a chave existir; até lá, IPN temporário consulta o pagamento pela API autenticada e confere referência, plano, moeda e valor |
| Iniciar pagamento mudava cliente existente para `PENDENTE` | Um cliente ativo poderia perder o acesso antes de pagar | Corrigido: cliente existente só é alterado depois de pagamento aprovado |
| Voltar para uma cotação salva disparava novo salvamento | A simples abertura podia regravar data e conteúdo | Corrigido: renderização não agenda gravação |
| Ofertas usavam leitura e escrita separadas | Dois fornecedores ao mesmo tempo podiam apagar a resposta um do outro | Corrigido com transação atômica |
| Códigos aleatórios de seis dígitos | Colisão poderia misturar cotações | Novas cotações usam identificador automático; links antigos continuam válidos |
| Conteúdo do banco era inserido com `innerHTML` | Texto malicioso poderia executar código no navegador | Corrigido com criação segura de elementos e `textContent` |
| Links de pagamento voltavam para GitHub Pages | Usuário podia cair em outro endereço/versão | Corrigido para usar o mesmo domínio da requisição |
| Layout estourava em celulares estreitos | Campos e ações ficavam difíceis de usar | Corrigido e testado em 320, 375, 390 e 430 px |
| Link do fornecedor mostrava navegação das três etapas | Fornecedor podia se confundir e sair da tarefa de preços | Corrigido: fornecedor fica bloqueado em uma tela exclusiva de preços |
| Atualizações em tempo real reconstruíam a lista enquanto o fornecedor digitava | Campos podiam mudar e parecer travados | Corrigido: fornecedor faz uma leitura inicial e a tela não é reconstruída durante o preenchimento |
| Fornecedor recebia o menor preço já enviado dentro dos campos | Uma resposta podia ser confundida com preço próprio | Corrigido: preços do fornecedor sempre começam vazios e respostas concorrentes não são exibidas |
| Cálculos usavam ponto flutuante e ofertas por nome do produto | Centavos e produtos repetidos podiam gerar resultado confuso | Corrigido: cálculo inteiro em centavos, ID de produto e compatibilidade com ofertas antigas |

## O que foi construído

- Nova identidade “Cotação Prime”, com logo vetorial e favicon.
- Landing page completa em `vendas.html`, com promessa direta, demonstração realista, planos visíveis, funcionamento, dúvidas e chamada final.
- Redesign controlado do sistema em `index.html`, preservando ordem e posição de entrada, barras, três etapas, lista e ação inferior.
- Textos simplificados para pessoas com pouca familiaridade digital.
- Controles maiores, foco visível, rótulos acessíveis e correções de responsividade.
- Checkout com catálogo de preços no servidor, dados temporários protegidos, retorno para o domínio correto, validação do pagamento e idempotência.
- Renovações agora conferem a senha atual e não trocam nome ou senha de um cliente existente.
- Fornecedor precisa informar nome e sobrenome; preço inválido é recusado com exemplo brasileiro.
- O bloco “Adicionar rápido” foi removido da área do administrador por solicitação do responsável; “Adicionar outro produto” permanece.
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
- Fluxo fornecedor validado em 320, 390 e 430 px sem acesso visual às etapas, dados do cliente, pagamento ou pedido.
- Divisão de pedido validada com dois fornecedores e quantidades diferentes: R$ 77,00 no cenário automatizado.
- Testes unitários cobrem moeda brasileira, centavos, compatibilidade legada e produtos com nomes repetidos.

Comandos locais aprovados:

```text
npm run check
npm test
```

O comando de backup, quando a credencial segura estiver disponível, será:

```text
npm run backup:firestore -- /caminho/seguro/backup.json
```

## Pendências operacionais

1. Obter no painel do Mercado Pago a chave secreta do webhook e cadastrar `MP_WEBHOOK_SECRET` na Vercel; até lá o sistema usa IPN temporário com consulta autenticada do pagamento.
2. `CHECKOUT_DATA_SECRET` foi cadastrada como variável sensível em Production e Preview em 21/08/2026.
3. Testar pagamento com usuário comprador de teste; não usar cobrança real.
4. Auditar as regras atuais do Firestore e preparar autenticação compatível com clientes antigos.

## Rollback

- Código: restaurar o bundle ou a cópia de trabalho no diretório de backup.
- Deploy: promover novamente o último deployment de produção conhecido na Vercel.
- Banco: o redesign não exige migração; portanto o rollback visual não deve reescrever documentos.
- Regras do Firebase: não alterar até existir cópia, teste no Emulator e plano separado de retorno.

## Dependências

O `npm audit` ainda aponta seis avisos moderados em dependências transitivas do Firebase Admin, inclusive usando a versão atual instalada. Não foi aplicado `npm audit fix --force`, pois a sugestão envolve troca incompatível de versão e poderia causar regressão. Não há aviso alto ou crítico no conjunto instalado desta branch.

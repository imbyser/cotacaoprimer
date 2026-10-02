# Administração de usuários

## Escopo

- URL: `/admin.html`.
- Acesso exclusivo ao WhatsApp configurado em `ADMIN_WHATSAPP`.
- Sessão assinada no servidor por `ADMIN_SESSION_SECRET`, em cookie `HttpOnly`, `SameSite=Strict` e `Secure` na Vercel.
- A senha administrativa é enviada somente no login e não fica salva no navegador.
- Se a credencial técnica do Firebase estiver sem a função IAM necessária, o servidor usa automaticamente a mesma compatibilidade REST já adotada pelo checkout; a sessão administrativa continua obrigatória e nenhuma senha é devolvida ao navegador.

## Operações disponíveis

- Listar contas sem devolver o campo `senha`.
- Unir na mesma visão as contas cadastradas e os números encontrados em `cotacoes.userId`.
- Identificar como “Só no histórico” um número que possui listas, mas ainda não possui conta; o botão “Criar acesso” apenas cria a conta e mantém as listas existentes no mesmo número.
- Informar separadamente quantas listas legadas não possuem `userId`, sem atribuí-las automaticamente a ninguém.
- Mostrar plano, situação de acesso, quantidade de listas e última atividade.
- Criar conta com nome, WhatsApp, plano, situação e senha inicial.
- Editar nome, WhatsApp, plano e situação.
- Redefinir senha sem revelar a senha anterior.

## Proteções de dados

- Não existe ação de exclusão.
- Alterar nome, plano, acesso ou senha não toca nas cotações.
- Se o WhatsApp for alterado explicitamente, somente o vínculo `userId` das listas é atualizado na mesma transação da conta, para o cliente continuar vendo todo o progresso no novo número. Produtos, preços, ofertas e quantidades permanecem intactos.
- Campos antigos desconhecidos são preservados porque as atualizações são parciais.
- Nome ou plano ausentes em uma conta legada continuam ausentes até uma alteração explícita do administrador.
- Bloquear uma conta exige confirmação no navegador e usa o mesmo estado `SUSPENSA` já entendido pelo login atual.
- A edição desativa o campo escondido de senha inicial, evitando que o preenchimento automático do navegador impeça salvar a suspensão.
- O app acompanha a situação da conta no Firebase durante a sessão. Ao receber suspensão, remoção da conta ou alteração das credenciais, fecha o painel e solicita nova entrada. Um rascunho pendente é preservado localmente para quando o acesso for liberado.
- O próprio WhatsApp administrador e seu acesso ficam protegidos contra alteração acidental no painel; a troca exige atualização consciente de `ADMIN_WHATSAPP` na Vercel.

## Correção de suspensão — 02/10/2026

Reprodução no Chromium com contas e Firebase simulados: uma senha preenchida no campo escondido impedia o formulário de enviar a alteração. Após a correção, o formulário enviou `SUSPENSA`. A suspensão de uma sessão já aberta também foi validada, incluindo preservação do rascunho e ausência de novas gravações após o bloqueio.

Os testes não alteraram usuários reais. Foram aprovados os oito arquivos de testes automatizados e a verificação de sintaxe dos scripts.

Backup anterior: branch local `backup/antes-suspensao-admin-20261002` e arquivos privados em `/home/lcientes sites/backups/cotacao-prime/2026-10-02-before-admin-suspension/`. O backup de leitura do Firestore contém 101 documentos.

Neste servidor, a credencial GitHub consultada está ligada a `hartmake12`, sem permissão de push em `imbyser/cotacaoprimer`; a credencial Vercel salva retorna `Not authorized`. Essas conexões precisam ser restauradas para publicar a correção no projeto existente.

## Retorno

- Código anterior: branch `backup/antes-admin-20260822` e tag `backup-antes-admin-20260822`.
- Banco anterior: backup somente de leitura em `/home/lcientes sites/backups-privados/cotacao-prime/cotacao-prime-before-admin-20260822.json`, com permissão `600` e SHA-256 `849037b603d21947aa3e2ce78dbfcbaa885d860d6cb3f533a7672cee7e86ccda`.
- Antes da união com o histórico: branch/tag `backup/antes-admin-historico-20260822` e backup somente de leitura `cotacao-prime-before-admin-history-merge-20260822.json`, com 128 documentos e SHA-256 `90d343d2d0db5390c45a9d1f162cd35bc3004587203d87b0b9d721d6cbcd8aa7`.

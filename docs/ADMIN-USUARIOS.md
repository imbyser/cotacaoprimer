# Administração de usuários

## Escopo

- URL: `/admin.html`.
- Acesso exclusivo ao WhatsApp configurado em `ADMIN_WHATSAPP`.
- Sessão assinada no servidor por `ADMIN_SESSION_SECRET`, em cookie `HttpOnly`, `SameSite=Strict` e `Secure` na Vercel.
- A senha administrativa é enviada somente no login e não fica salva no navegador.
- Se a credencial técnica do Firebase estiver sem a função IAM necessária, o servidor usa automaticamente a mesma compatibilidade REST já adotada pelo checkout; a sessão administrativa continua obrigatória e nenhuma senha é devolvida ao navegador.

## Operações disponíveis

- Listar contas sem devolver o campo `senha`.
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
- O próprio WhatsApp administrador e seu acesso ficam protegidos contra alteração acidental no painel; a troca exige atualização consciente de `ADMIN_WHATSAPP` na Vercel.

## Retorno

- Código anterior: branch `backup/antes-admin-20260822` e tag `backup-antes-admin-20260822`.
- Banco anterior: backup somente de leitura em `/home/lcientes sites/backups-privados/cotacao-prime/cotacao-prime-before-admin-20260822.json`, com permissão `600` e SHA-256 `849037b603d21947aa3e2ce78dbfcbaa885d860d6cb3f533a7672cee7e86ccda`.

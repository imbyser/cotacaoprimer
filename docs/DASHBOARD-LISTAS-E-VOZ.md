# Cotação Prime — dashboard, listas e voz

Data: 21 de agosto de 2026

Branch de implementação: `feat/dashboard-listas-voz`

## Escopo

- A entrada autenticada agora abre uma página inicial simples, sem entrar automaticamente no editor.
- O administrador encontra ações grandes para criar lista, ver listas e criar lista falando.
- Dentro da etapa Lista, “Adicionar produtos falando” acrescenta itens a uma lista nova ou já salva sem apagar o conteúdo existente.
- “Minhas listas” mostra primeiro as cotações atualizadas mais recentemente.
- A ação “Criar nova lista” existe no topo e fixa na parte inferior da tela de listas.
- Ao abrir uma cotação, as três etapas conhecidas continuam na mesma ordem: Lista, Preços e Pedido.
- O fornecedor que recebe `?c=...&e=2` continua isolado na página de preenchimento de preços, mesmo quando existe uma conta administrativa salva no navegador.
- A lista por voz transcreve e organiza os itens, permite corrigir nomes e embalagens reconhecidos e só cria a lista depois da confirmação do usuário.

## Segurança dos dados

- Não houve migração de schema, alteração de regras ou escrita de manutenção no Firebase.
- A API de voz consulta somente telefone, senha e situação da assinatura para autorizar o recurso.
- A API de voz não possui operação de criação, atualização ou exclusão no Firestore.
- O áudio é enviado à Groq somente depois da ação explícita do usuário e não é salvo pelo projeto.
- Resultados da IA passam por limites, limpeza e remoção de duplicados.
- Um item reconhecido incorretamente não é salvo automaticamente: a lista precisa ser confirmada.
- Rascunhos digitados continuam no navegador e são enviados ao Firestore pelo autosave já existente; ao sair do editor, o sistema tenta concluir o salvamento antes de trocar de tela.

## Backup anterior à mudança

Referência Git congelada:

- branch: `backup/antes-dashboard-voz-20260821`
- tag: `backup-antes-dashboard-voz-20260821`
- commit: `156ab169f5fcb9b8b8d901f1abb58db425fb9f14`

Backup privado local:

`/home/lcientes sites/backups/cotacao-prime/2026-08-21-before-dashboard-voice/`

Arquivos verificados:

- `firestore.json`: 123 documentos; SHA-256 `50b98b9cee1501ad515fcd7970e4a6549abadba10668b20659a390e315c6772f`
- `cotacaoprimer.bundle`: histórico Git completo; SHA-256 `d66b4188ae8923a0c1ddee89ba02db0d100073cd693876852f848219119b8819`

O diretório está com permissão privada e o bundle foi validado pelo Git.

## Reversão

O código pode ser restaurado a partir da tag ou branch de backup, sem tocar no banco. Como esta entrega não migra documentos, a reversão visual não exige importação do `firestore.json`.

Se uma restauração de dados algum dia for realmente necessária, ela deve ser feita separadamente, documento por documento e somente após comparação. Não importar o arquivo inteiro por rotina, porque isso poderia voltar o progresso feito por clientes depois do backup.

## Validações

- Testes unitários e de sintaxe do projeto.
- Dashboard, listas, modal de voz e acesso do fornecedor em 320, 390, 430 e 1440 px.
- Tela com 20 listas para verificar ordenação, rolagem e botões de nova lista.
- Leitura real, sem escrita, para validar 54 listas, abertura de cotação e etapas 2 e 3.
- Ciclo real da Groq com áudio sintético, autenticação ativa e retorno de cinco produtos, sem salvar uma cotação.
- Compatibilidade de gravação validada para MP4/AAC do Safari no iPhone, inclusive quando o navegador acrescenta parâmetros de codec ao tipo do arquivo.
- Na primeira utilização, os dados da loja continuam abertos. Depois do primeiro envio, a etapa Lista usa um resumo compacto com “Editar dados” e mantém o botão principal no mesmo lugar.
- O link e os pedidos por WhatsApp são bloqueados até o preenchimento do nome da loja e de um número válido com DDD.
- No Safari móvel, “Minhas listas” e “Início” trocam de tela imediatamente. Alterações pendentes são guardadas primeiro no aparelho e sincronizadas em segundo plano.

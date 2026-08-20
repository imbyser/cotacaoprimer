# Cotação Prime — contrato de redesign seguro

## Regra principal

O redesign não pode alterar dados, estado ou progresso de clientes existentes. Durante a criação e a validação visual:

- não escrever no Firestore de produção;
- não alterar regras do Firebase;
- não migrar documentos;
- não usar contas, cotações ou telefones reais em testes;
- não publicar na branch `main`;
- não promover deploy de prévia para produção;
- testar com dados fictícios e chamadas de escrita bloqueadas.

## Invariantes do produto

Estas posições e relações são familiares aos usuários e ficam preservadas:

1. A entrada do sistema continua em `index.html`.
2. A página de planos e cadastro continua em `vendas.html`.
3. As etapas continuam na mesma ordem: `1. Lista`, `2. Preços`, `3. Pedido`.
4. A barra de etapas continua logo abaixo do cabeçalho.
5. A orientação da etapa continua antes da lista.
6. Os atalhos e itens continuam no corpo central.
7. Dados da loja, pagamento e ação principal continuam na barra inferior.
8. O link público do fornecedor continua usando `?c=...&e=2`.
9. Cotações e assinantes existentes continuam legíveis sem conversão de schema.
10. Nomes das ações usam palavras comuns e descrevem exatamente o que acontece.

## Público e linguagem

O produto é para donos e funcionários de mercadinhos e pequenos comércios, inclusive pessoas com pouca familiaridade digital.

Regras de linguagem:

- uma ideia por frase;
- verbos concretos: montar, enviar, preencher, comparar, escolher, pedir;
- evitar dashboard, workflow, checkout, onboarding, automação e inteligência;
- não depender de ícones para explicar uma ação;
- botões com pelo menos 44 px;
- mensagens de erro devem dizer o problema e como corrigir;
- nenhuma ação destrutiva sem confirmação clara.

## Evidência encontrada → decisão tomada

| Evidência real | Decisão |
| --- | --- |
| O fluxo atual tem três etapas fixas | Preservar ordem, posição e nomes base das etapas |
| O produto começa com arroz e feijão e usa “Nome da Loja” | Falar diretamente com mercadinhos e pequenos comércios |
| A cotação é enviada e o pedido volta pelo WhatsApp | Usar percurso de uma lista como metáfora visual |
| Azul escuro e verde já identificam sistema e ação | Manter as cores como patrimônio, com contraste corrigido |
| Usuários já usam barra inferior fixa | Preservar a barra e corrigir apenas overflow e alvos de toque |
| Fornecedores abrem um link sem conta | Explicar isso como principal redução de esforço |
| O sistema compara por item e divide o pedido | Demonstrar visualmente a marcação do menor preço |
| A página atual começa com promessa e planos | Manter planos logo após a abertura, acrescentando contexto sem esconder preços |

## Contrato de identidade

### Metáfora central

Uma lista de compras que percorre fornecedores, recebe preços e volta marcada com a melhor escolha.

### Significado

O sistema organiza uma tarefa que hoje costuma ficar espalhada entre papel, mensagens e contas de cabeça. A identidade deve transmitir ordem, facilidade e decisão — sem parecer software complicado.

### Consequências visuais

- papel claro e azul-carbono como materiais de lista e cópia;
- linha contínua conectando etapas, preços e ações;
- verde marca-texto reservado para melhor preço e ação principal;
- números tratados como etiquetas legíveis, nunca como decoração;
- cantos firmes e recortes de papel, evitando excesso de cartões genéricos;
- tipografia robusta nas promessas e altamente legível nos controles;
- movimento curto de traço e marcação, com alternativa para movimento reduzido.

### Assinatura recorrente

Uma linha azul percorre a interface e termina em uma marca verde de conferência. No logo, essa linha cruza três ofertas e seleciona uma.

### Progressão emocional

1. Chegada: “entendi para que serve”.
2. Reconhecimento: “é o problema que tenho no WhatsApp”.
3. Segurança: “consigo usar sem treinamento”.
4. Conversão: “sei o preço e o próximo passo”.

### Substituições proibidas

- estética genérica de SaaS com degradê e vidro;
- palavras técnicas;
- muitos cards iguais;
- emojis como logo;
- alterar o mapa da interface para deixá-la “mais moderna”;
- esconder preço ou condição de cobrança;
- inventar clientes, depoimentos, economia ou resultados.

## Arquitetura de dados recomendada

### Agora

Manter o Cloud Firestore. Ele é independente da hospedagem da Vercel e já contém os clientes. A primeira melhoria deve ser proteger o acesso, não migrar o banco.

### Compatibilidade futura

1. Fazer exportação verificada do Firestore.
2. Criar APIs na Vercel que leiam o schema atual.
3. Aceitar documentos antigos e novos durante a transição.
4. Migrar autenticação de forma gradual, sem invalidar contas existentes.
5. Testar regras no Firebase Emulator.
6. Trocar regras de produção somente em uma janela controlada.
7. Manter rollback do código e das regras.

Nenhum documento de cliente será reescrito apenas para atender ao redesign visual.

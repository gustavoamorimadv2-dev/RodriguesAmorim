# Gerar andamento pelo DataJud

Cloud Function de 2ª geração, publicada pelo Firebase no projeto Google Cloud `rodrigues-amr`, região `us-central1`. O botão em `andamento.html` usa o login Firebase atual e chama `gerarAndamentoDatajud`.

O servidor valida o número CNJ e seu dígito verificador, identifica o tribunal de origem na variável `tribunal` pelos campos J e TR e consulta somente o endpoint oficial correspondente. Isso identifica a origem: recursos podem tramitar em tribunal superior mantendo a numeração original. Não há inferência de tribunal atual pelo número.

Compara as datas dos movimentos em todos os registros/graus retornados e devolve o movimento mais recente. Não interpreta o significado jurídico e não afirma que uma movimentação é nova em relação ao último envio. Respostas incompletas, processo ausente e ausência de movimentos geram mensagens de erro sem preencher andamento fictício. Cadastros com vários números permitem escolher um processo.

A mensagem fica no editor para revisão. O fluxo existente de salvar e enviar permanece responsável pelo envio e atualização da fila. A consulta não envia WhatsApp e não altera o cadastro.

## Publicar

Requer Firebase CLI autenticado, acesso ao projeto e faturamento habilitado.

1. `npm ci --prefix datajud-functions`
2. `npm test --prefix datajud-functions`
3. Consulte a chave pública vigente em https://datajud-wiki.cnj.jus.br/api-publica/acesso e armazene com `firebase functions:secrets:set DATAJUD_API_KEY --project rodrigues-amr`. Não coloque a chave no HTML.
4. `firebase deploy --only functions:datajud --project rodrigues-amr --non-interactive`
5. Publique `andamento.html` no GitHub Pages. Para o site Firebase existente: `node deployment/prepare-hosting.cjs` e `firebase deploy --only hosting --project rodrigues-amr --non-interactive`.

Para atualizar a chave após rotação pelo CNJ, repita os passos 3 e 4. Nenhuma chave privada de conta de serviço é necessária. A função tem limite de três instâncias, sem instâncias mínimas. Somente usuários autenticados no projeto podem consultar. CORS permite as origens HTTPS do CRM e GitHub Pages; CORS não substitui autenticação.

## Fontes

- https://datajud-wiki.cnj.jus.br/api-publica/acesso
- https://datajud-wiki.cnj.jus.br/api-publica/endpoints
- https://www.cnj.jus.br/programas-e-acoes/numeracao-unica/perguntas-frequentes/

Os metadados disponíveis podem ter defasagem em relação ao tribunal. Não encontrar um processo na API pública não prova que ele não existe ou que está sem movimentações.

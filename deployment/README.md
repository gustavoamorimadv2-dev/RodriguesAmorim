# Implantação no Google Cloud

Esta implantação foi autorizada para o projeto Firebase `rodrigues-amr` (263843276361). Não cria nem usa chaves privadas baixadas de contas de serviço. Usa a sessão autenticada do Firebase CLI para provisionar; os serviços usam identidades próprias após a publicação.

## Recursos e permissões

- Cloud Run `ra-whatsapp`: 1 CPU, 2 GiB, CPU contínua, mínimo e máximo de uma instância; endpoint HTTPS público, com autenticação na aplicação.
- Cloud Function `lembrarParcelasWhatsApp`, codebase `whatsapp-billing`: agendamento a cada cinco minutos durante 9h–18h em Brasília. Firebase cria o job correspondente no Cloud Scheduler.
- Buckets privados `rodrigues-amr-whatsapp-session-private` e `rodrigues-amr-whatsapp-build-source`, com prevenção de acesso público. Os fontes temporários expiram em sete dias.
- Banco Firestore separado `whatsapp-automation`, com regras que negam acesso a clientes. As regras do banco padrão do CRM não são alteradas.
- Artifact Registry `whatsapp`, em `us-central1`.
- Conta `ra-whatsapp-runtime`: `roles/datastore.user` e `roles/firebaseauth.viewer` no projeto; `roles/storage.objectAdmin` somente no bucket de sessão.
- Conta `ra-whatsapp-build`: `roles/logging.logWriter` e `roles/artifactregistry.writer` no projeto; `roles/storage.objectViewer` somente no bucket de fontes.
- Conta `ra-whatsapp-scheduler`: identidade da Cloud Function para o ID token validado pelo serviço. As permissões de infraestrutura das plataformas são gerenciadas pelos agentes do Google Cloud/Firebase.

O provisionamento preserva as vinculações IAM existentes e acrescenta apenas as necessárias. A conta runtime acessa Firestore por IAM para ler clientes e manter os registros privados. O endpoint público não dá acesso anônimo às operações; `/health` é o único recurso sem autenticação.

## Publicação

Requer Firebase CLI autenticado, permissão de administração no projeto, faturamento ativo e Node.js 22.12+. Os scripts usam o cliente autenticado do Firebase CLI instalado globalmente; `FIREBASE_TOOLS_ROOT` permite indicar outra instalação. Esse cliente é interno ao Firebase CLI e deve ser revalidado ao atualizar a ferramenta.

1. `npm ci --prefix whatsapp-service` e `npm ci --prefix functions`.
2. `npm test --prefix whatsapp-service`.
3. `node deployment/provision.cjs --apply`. Cria APIs, identidades, buckets, banco e registro. Resolve os UIDs do administrador conectado ao Firebase CLI e de `gustavoamorimadv2@gmail.com`, quando esses usuários já existem no Firebase Auth. Não cria novos usuários.
4. `firebase deploy --only firestore:whatsapp-automation --project rodrigues-amr --non-interactive`.
5. `node deployment/publish.cjs --apply`. Envia os fontes ao bucket privado, executa Cloud Build com teste do Chromium, publica o Cloud Run, configura o endpoint protegido e grava a URL no frontend e no arquivo local de parâmetros da função. Para uma nova imagem, acrescente `--rebuild`.
6. `firebase deploy --only functions:whatsapp-billing --project rodrigues-amr --non-interactive`. Não publica outras funções nem regras do banco padrão.
7. Publique os arquivos web pelo GitHub Pages do repositório, incluindo `assets/whatsapp-config.js` com a URL gerada.

`deployment/runtime.json` e `functions/.env.rodrigues-amr` são arquivos locais ignorados pelo Git. O código usa a região `us-central1`, próxima ao banco existente em `nam5`; o horário comercial segue Brasília independentemente da região de hospedagem.

## Verificação e operação

Verifique `/health` (200), `/api/whatsapp` sem token (401), `/internal/billing` sem token (401), negação de CORS para origem desconhecida, regras do banco privado e status ativo da função/job. O teste de navegador do build não conecta WhatsApp nem envia mensagens. Após a publicação, a leitura do QR e a ativação ficam para o administrador.

Para pausar envios, desative a opção no painel. Para cessar custos contínuos, desative o job e reduza a instância mínima do Cloud Run para zero ou exclua os recursos; apenas desativar os lembretes não desliga a infraestrutura.

## Endereço seguro do CRM

A configuração do domínio original no GitHub Pages apresenta certificado incompatível em HTTPS. A integração não libera origens HTTP. O CRM também é publicado no site Firebase Hosting existente `rodrigues-amr`, com HTTPS válido, e o botão na versão HTTP encaminha para a versão segura. O usuário precisa entrar no CRM nessa origem antes de conectar o telefone. DNS e certificado do domínio original não foram alterados.

Para atualizar o frontend seguro: `node deployment/prepare-hosting.cjs`, seguido de `firebase deploy --only hosting --project rodrigues-amr --non-interactive`. A pasta gerada contém somente páginas HTML e assets públicos, sem fontes do backend, arquivos de ambiente ou configurações de implantação.

## Verificações de produção

`node deployment/verify.cjs --run-scheduler` confere endpoints, bloqueio de HTTP, CORS do Firebase Hosting, função e job ativos; só aciona o teste se os lembretes estiverem desativados. O teste completo Scheduler → Cloud Function → serviço retornou HTTP 200 sem envio de mensagens.

`node deployment/verify-qr.cjs` roda a imagem em um contêiner isolado e comprova que whatsapp-web.js gera um QR real. O código é descartado, não aparece em logs e nenhum telefone é pareado. Esse teste passou na imagem publicada. A leitura do QR pelo administrador e a restauração de uma sessão efetivamente pareada precisam da participação do usuário.

A política do repositório `gcf-artifacts`, criado nesta implantação, remove imagens de função com mais de sete dias.

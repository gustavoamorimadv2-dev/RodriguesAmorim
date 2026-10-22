# Broker Finance — painel administrativo

Painel HTML para revisar cadastros e as duas fotos do RG, aprovar ou rejeitar usuários, cadastrar precatórios com PDF e publicar créditos após auditoria. Interface em branco, preto e cinza.

## Executar

No macOS, execute `Abrir-Painel.command`. Alternativamente, dentro desta pasta execute `python3 -m http.server 8765 --bind 127.0.0.1` e abra http://localhost:8765. Não abra o HTML diretamente pelo Finder, pois o painel carrega módulos e configuração por HTTP.

Entre com a conta administrativa previamente configurada no Firebase. Use “Esqueci minha senha” para definir ou recuperar sua senha. A conta precisa da permissão `admin: true` no token; conhecer a URL ou ter uma conta comum não concede acesso.

## Firebase e documentos

O painel utiliza o projeto `broker-17a8a`, o mesmo do aplicativo iOS. `firebase-config.json` contém a configuração pública do cliente Firebase; não contém senha nem chave de conta de serviço. RGs e PDFs ficam no Storage privado e são consultados com autenticação. Não adicione documentos pessoais ou credenciais ao repositório.

As regras do Firestore e Storage são gerenciadas no projeto Broker Finance. A inclusão desta pasta não substitui as regras nem a configuração Firebase do CRM RodriguesAmorim.

## Hospedagem

Publique esta pasta como conteúdo estático, preservando seus arquivos e caminhos relativos. Para outro domínio, configure a origem HTTPS exata no CORS do bucket do Broker Finance antes de testar a visualização dos RGs e PDFs; autorize o domínio no Firebase Authentication quando necessário. A configuração local existente permite localhost:8765 e 127.0.0.1:8765.

Este acréscimo ao repositório não publica o painel automaticamente. O Firebase Hosting deste repositório usa `.hosting-public`: uma publicação futura precisa incluir esta pasta nessa preparação. Não copie RGs, relatórios de usuários ou credenciais para a pasta pública.

## Validação

A integração do cadastro foi verificada no Firebase com arquivos fictícios: criação do usuário, upload das duas imagens, envio para aprovação, bloqueio de autoaprovação e bloqueio de leitura anônima. Os registros temporários foram removidos. O teste completo da interface iOS no simulador permanece pendente.

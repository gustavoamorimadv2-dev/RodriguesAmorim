# WhatsApp e lembretes de cobrança

A página `clientes.html` oferece conexão por QR code e ativação dos lembretes. A solução usa uma sessão compartilhada do escritório. Cada administrador autorizado gerencia a mesma conexão.

## Arquitetura Google Cloud

- Cloud Run `ra-whatsapp`, em `us-central1`: Node.js 22, Chromium e whatsapp-web.js. Uma instância mínima e máxima, CPU sempre alocada, 2 GiB de memória. Há custos contínuos.
- Cloud Function `lembrarParcelasWhatsApp`: a cada cinco minutos, de 9h a 17h55, todos os dias, em `America/Sao_Paulo`, chama a rotina por um ID token Google da conta de serviço autorizada.
- Bucket privado de sessão: `RemoteAuth` salva a sessão depois da estabilização inicial e a cada minuto. O painel só permite ativar os lembretes depois do primeiro backup. A sessão é restaurada do bucket após reinícios; o disco efêmero do Cloud Run é somente área de trabalho.
- Firestore padrão: lê clientes e honorários já existentes.
- Firestore `whatsapp-automation`: configurações, coordenação de sessão e registros de envio. Regras negam todo acesso por SDK cliente; somente serviços autorizados por IAM usam o banco.
- Um lease renovado a cada dez segundos impede duas revisões do Cloud Run de abrirem a mesma sessão. Se o processo falhar, o lease expira em até noventa segundos.

A URL HTTPS aceita tráfego público porque o navegador usa Firebase Auth; as operações verificam o token e uma lista de UIDs autorizados. A rota de cobrança aceita somente o ID token Google da conta de serviço agendadora, com público e e-mail esperados. QR codes e respostas não são armazenados em cache nem registrados em logs.

## Uso

1. Entre na versão HTTPS do CRM (`https://rodrigues-amr.web.app/login.html`) com um administrador autorizado.
2. Abra **Clientes → Conectar WhatsApp → Conectar**.
3. No telefone: **WhatsApp → Aparelhos conectados → Conectar um aparelho**. Escaneie o QR exibido na página.
4. Aguarde a confirmação de que a sessão foi salva (o primeiro backup leva cerca de um minuto).
5. Ative **lembretes automáticos três dias antes do vencimento**.

A automação começa desativada. Abrir o painel ou escanear o QR não ativa os lembretes. Desmarcar a opção interrompe novos envios. Não foram enviados lembretes reais durante a implantação. A conexão do telefone depende da leitura do QR pelo usuário.

## Seleção e registro dos lembretes

O serviço considera todas as parcelas com `id_parcela`, vencimento em três dias corridos e status diferente de `Pago`. Usa os campos existentes `honorarios`, `id_parcela`, `vencimento`, `status`, `valor`, `parcela`, `nome` e `numeros`. Reconsulta o pagamento imediatamente antes do envio. Não há envio retroativo se o serviço ficar indisponível durante todo o dia do lembrete.

O telefone deve conter um único número brasileiro com DDD. Listas, ramais e números inválidos não recebem envio. O texto contém nome, parcela, valor e vencimento. Não inclui boleto ou link: o cadastro atual de honorários não guarda um link por parcela.

A coleção `whatsapp_envios` registra cliente + parcela + vencimento: `reserved`, depois `sent`, `cancelled`, `invalid_phone`, `not_registered`, `failed` ou `uncertain`. Reservas e resultados ambíguos não são reenviados automaticamente: um operador deve conferir a conversa antes de remover um registro para nova tentativa. Não existe transação atômica entre pagamento, Firestore e WhatsApp; há uma pequena janela entre a última consulta de pagamento e o envio.

## Manutenção

Consulte `../deployment/README.md` para reproduzir a implantação e configurar permissões. A URL pública fica em `../assets/whatsapp-config.js`; UIDs e identidades são configurados nas variáveis de ambiente do Cloud Run. Não use contas de serviço em arquivos JSON no ambiente de produção: os serviços usam suas próprias identidades.

O WhatsApp pode revogar a sessão; nesse caso o administrador precisa reconectar pelo painel. whatsapp-web.js utiliza WhatsApp Web e não garante compatibilidade contínua nem ausência de bloqueio pelo WhatsApp. A dependência Puppeteer foi fixada em 25.14.0 por override para corrigir alertas da versão transitiva anterior. O build executa uma verificação real de abertura do Chromium nessa versão antes de publicar a imagem.

Para testes: `npm test`. Valida datas em Brasília, telefones, seleção, pagamento durante processamento, deduplicação, falha ambígua, desativação, coordenação de instâncias e armazenamento da sessão. Rode `npm audit` antes de atualizar dependências. Faça alterações de biblioteca inicialmente com um número de teste.

Referências: https://wwebjs.dev/guide/creating-your-bot/authentication.html e https://firebase.google.com/docs/functions/schedule-functions.

## Recuperação da conexão

A restauração cria a pasta de destino antes de baixar o ZIP, pois o diretório temporário não existe em uma instância nova do Cloud Run. Cada upload periódico confirma que a sessão foi persistida, mesmo quando a biblioteca não emite `remote_session_saved` por já existir um backup anterior.

O início da conexão tem prazo de 90 segundos. Falhas e desconexões encerram o navegador anterior antes de permitir outra tentativa, e eventos atrasados de uma tentativa antiga não alteram a nova. Na página de clientes, **Gerar novo QR** permite novo pareamento após confirmação. O backup anterior não é apagado por uma tentativa nova que falha; só é substituído quando a nova sessão é efetivamente salva.

O painel informa separadamente se o WhatsApp está conectado e se os lembretes estão ativados. Conectar o telefone não ativa os envios automaticamente.

A biblioteca foi atualizada para whatsapp-web.js 1.34.8, que aguarda o carregamento do estado do WhatsApp Web antes de acessar o Socket. O serviço não reutiliza cópias locais do HTML do WhatsApp Web. O build valida um QR real com RemoteAuth e armazenamento descartável antes de publicar a imagem, sem parear telefone nem enviar mensagens. As correções compatíveis de dependências foram aplicadas; permanecem alertas moderados de glob/minimatch na cadeia de arquivamento, cuja atualização automática exigiria versões principais incompatíveis da estratégia RemoteAuth.

A página atual de login já apresenta o QR em `data-ref` antes de carregar `WAWebSocketModel`. O adaptador monitora esse QR oficial e suas rotações; a autenticação e o estado conectado continuam dependendo dos eventos reais da biblioteca após o pareamento, sem simular sucesso. O monitor é cancelado quando o navegador fecha. O identificador do navegador usa a versão do Chromium instalado, em vez do Chrome 101 fixo da biblioteca. Nenhum HTML de terceiros é carregado para contornar a incompatibilidade.

# WhatsApp e lembretes de cobrança

Serviço Node.js persistente para a página `clientes.html`. Uma sessão compartilhada do escritório; usuários autorizados gerenciam essa mesma sessão. Não cria uma sessão por funcionário e não dispara a mesma parcela por vários números.

## Preparação

1. Hospede esta pasta em um servidor com Node.js 22+, Chrome/Chromium e disco persistente. Execute apenas **uma instância** do serviço. GitHub Pages hospeda a página, mas não executa este serviço. Configure um supervisor para reiniciá-lo automaticamente.
2. Execute `npm ci` (ou `npm install` se ainda não houver lockfile). O Puppeteer baixa um navegador; em Linux também são necessárias as bibliotecas de sistema do Chrome. Não execute o navegador como root nem desative o sandbox.
3. Copie `.env.example` para `.env`. Configure uma conta de serviço do projeto Firebase `rodrigues-amr` em `GOOGLE_APPLICATION_CREDENTIALS`; mantenha a chave fora do repositório e da pasta pública. Dê acesso às coleções `clientes`, `whatsapp_config` e `whatsapp_envios`. O Admin SDK ignora regras do Firestore: o serviço restringe as rotas a uma lista explícita de UIDs do Firebase Auth.
4. Configure `WHATSAPP_ALLOWED_UIDS` com os UIDs de quem pode gerenciar a conexão e `CRM_ORIGINS` com as origens exatas da página, separadas por vírgula. Publique o serviço atrás de HTTPS. Não exponha a pasta de autenticação, `.env` ou credenciais.
5. Configure `SESSION_PATH` em um volume persistente, acessível apenas ao usuário do serviço. Proteja seus backups: esses arquivos permitem restaurar a sessão do WhatsApp. A cache `.wwebjs_cache` também precisa de permissão de escrita.
6. Preencha `WHATSAPP_API_URL` em `assets/whatsapp-config.js` com a URL HTTPS do serviço e publique os arquivos web.
7. Execute `npm start`. Entre no CRM com um UID autorizado, clique em **Conectar WhatsApp**, depois **Conectar**, escaneie o QR e ative os lembretes. A automação começa desativada. Nenhuma mensagem é enviada só por abrir o QR.

## Comportamento

A cada minuto, entre 9h e 18h em America/Sao_Paulo, consulta `clientes[].honorarios` e considera todas as parcelas não pagas com vencimento em três dias corridos. Usa `id_parcela`, `vencimento`, `status`, `valor`, `parcela`, `nome` e `numeros`, campos existentes no CRM. Revalida a parcela antes de enviar. Não há envio retroativo se o servidor ficar indisponível durante todo o dia do lembrete.

Telefones precisam ter um único número brasileiro com DDD. Listas, ramais e números inválidos são registrados para correção. O texto contém nome, parcela, valor e vencimento. Não inclui boleto/link, porque os honorários atuais não guardam um link por parcela.

A sessão usa whatsapp-web.js e LocalAuth. É restaurada após reinício com o mesmo disco. WhatsApp pode revogá-la; nesse caso é preciso abrir o painel e reconectar. Esta biblioteca utiliza WhatsApp Web, sem garantia de compatibilidade ou de ausência de bloqueios pelo WhatsApp.

`whatsapp_envios` registra uma reserva por cliente + parcela + vencimento, depois `sent`, `cancelled`, `invalid_phone`, `not_registered`, `failed` ou `uncertain`. Reservas e resultados ambíguos **não são reenviados automaticamente**, pois não existe transação atômica entre WhatsApp e Firestore. Um operador deve conferir a conversa antes de remover um registro para nova tentativa. Há uma pequena janela entre a última consulta de pagamento e o envio, assim como em qualquer integração entre esses dois sistemas.

O serviço guarda `enabled` e `connectedOnce` em `whatsapp_config/office`. Restrinja essas duas coleções nas regras de cliente do Firestore; apenas o servidor deve gravá-las. Não altere regras globais sem preservar as permissões atuais do CRM.

## Validação

Execute `npm test`. Os testes cobrem datas em Brasília, telefones, seleção de parcelas, pagamento durante o processamento, sessão desconectada, deduplicação e falha de envio ambígua. Antes de ativar em produção, valide QR e restauração com um telefone de teste e um projeto Firestore separado. Não foram realizados envios reais na implementação.

Documentação: https://wwebjs.dev/guide/creating-your-bot/authentication.html e https://firebase.google.com/docs/auth/admin/verify-id-tokens.

### Pendência para produção

A instalação verificada nesta alteração ainda apresenta **9 alertas de severidade alta** na cadeia Puppeteer de whatsapp-web.js. O Firebase Admin foi atualizado para 14.5.0, eliminando os alertas anteriores dessa dependência. Não foi aplicado downgrade automático nem substituição incompatível do navegador. Antes de produção, resolver/revisar os alertas com uma versão compatível e repetir o teste real de QR, envio e restauração. Esta proposta permanece em rascunho até essas validações e a configuração da hospedagem.

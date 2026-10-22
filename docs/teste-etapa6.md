# Etapa 6 — roteiro de teste e configuração

Branch: `rastreamento-motorista`. Chegada local implementada; push real aguarda
projeto Expo/EAS e Firebase/FCM. A etapa 7 não foi iniciada.

## Preparar

Atualize a branch sem sobrescrever seu trabalho e siga a preparação de
[teste-etapa5.md](teste-etapa5.md). No backend:

```bash
npm ci
npm run db:migrate
npm run dev
```

A migration 028 acrescenta dispositivos, eventos e tentativas; não altera colunas
dos pedidos/entregas. O SQLite do aparelho migra automaticamente para versão 2,
preservando conclusões pendentes. O backend continua funcionando com o worker push
desligado; eventos ficam gravados para inspeção.

No mobile:

```bash
npm ci
npx expo run:android --device
```

É uma instalação nativa nova, com `expo-notifications` e permissões. Não basta
atualizar apenas o JavaScript. Use Node 24 para a suíte SQLite de desenvolvimento.

## Testar chegada local — dispensa Expo Push/FCM

1. Entre como COURIER, inicie online uma entrega atribuída e ative GPS na Conta ou
   nos detalhes. O destino precisa ter coordenadas corretas.
2. Em Conta → Notificações, escolha **Ativar alertas de chegada** e aceite a permissão.
3. Aproxime-se com segurança do destino. São necessárias duas coletas válidas,
   separadas por pelo menos 5s, com precisão até 40m e distância + precisão até 100m.
4. Confira o aviso **“Você chegou ao destino. O pedido foi entregue?”**.
5. Toque: abre os detalhes. O pedido não pode ser concluído automaticamente; use a
   confirmação existente apenas se realmente entregou.
6. Permaneça na área, saia/volte e reinicie o app: não deve emitir continuamente o
   mesmo aviso após o primeiro agendamento confirmado.
7. Repita com a internet desligada. O aviso local deve continuar possível; concluir
   usa a fila offline e só atualiza o cliente oficialmente após sincronização.
8. Com duas entregas, conclua uma offline antes de chegar: ela não deve gerar aviso;
   a outra permanece elegível. Ao terminar a última, GPS desliga.
9. Negue/revogue permissão de notificação: navegação, GPS e conclusão continuam
   disponíveis. Desative os alertas e confira limpeza das notificações locais.
10. Saia da conta e entre em outra: avisos antigos não podem abrir dados da anterior.

O aviso é auxiliar: GPS, permissão, bateria e execução em segundo plano dependem do
sistema. Registro de agendamento não comprova que o sistema exibiu a notificação.

## Habilitar push real — configuração ainda necessária

Estas etapas precisam ser feitas pelo responsável pelo projeto, usando as contas
da equipe. Não criamos projeto, identificador ou credenciais automaticamente.

1. Vincular o aplicativo ao projeto Expo/EAS correto e configurar seu `extra.eas.projectId`.
2. Definir `expo.android.package` com o identificador Android da equipe e registrar
   esse mesmo aplicativo no Firebase.
3. Configurar `expo.android.googleServicesFile` para o arquivo local do Firebase.
   `mobile/google-services.json` está ignorado pelo Git.
4. Configurar as credenciais FCM v1 do aplicativo no serviço Expo/EAS. Chave privada
   de conta de serviço deve ficar fora do repositório, em armazenamento seguro.
   Para iOS, também é necessário configurar o aplicativo e credenciais APNs.
5. Caso o serviço Expo Push exija autenticação, definir `EXPO_ACCESS_TOKEN` no ambiente
   seguro do backend. Não é access token de usuário; não colocar em variável pública.
6. Só após essa preparação, habilitar `EXPO_PUSH_ENABLED=true` e reiniciar o backend.
7. Recompilar/instalar o app no aparelho; abrir Conta → Notificações → **Ativar avisos
   de pedidos**. Conferir “dispositivo registrado”. Isso confirma o registro na API,
   não o recebimento de uma mensagem no telefone.

Referências oficiais:

- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/push-notifications/fcm-credentials/
- https://docs.expo.dev/push-notifications/sending-notifications/

Teste com o celular aberto, minimizado e bloqueado:

| Ação | Destinatário/resultado |
|---|---|
| Atribuir entrega | Motoboy recebe nova atribuição |
| Trocar motoboy | Anterior recebe retirada; novo recebe atribuição |
| Cancelar entrega atribuída | Motoboy recebe cancelamento |
| Iniciar entrega READY | Cliente recebe “saiu para entrega” |
| Repetir a mesma atribuição/início | Sem novo evento de negócio |
| Sair offline e entrar em outra conta | Revogação persistida; toque antigo não abre dados da anterior |
| Token recusado pelo provedor | Versão do dispositivo desativada após ticket/recibo de erro |

Push pode atrasar, falhar ou chegar duplicado. Aviso já em trânsito pode aparecer
depois de logout offline, mas tem conteúdo genérico e exige sessão autorizada no
toque. O app sempre consulta o estado oficial; não opera com base no texto do push.

## Verificações automatizadas

```bash
cd backend
npm run typecheck
npm run build
npm test
npm exec -- vitest run tests/integration/deliveries.integration.test.ts
cd ../mobile
npm run typecheck
npm test
npx expo export --platform android --max-workers 2
```

Integração recria somente `marmitaria_test`. O transporte Expo usa respostas simuladas
nesses testes; a ponte nativa de notificações também é simulada, com SQLite real.
Não interpretar esses resultados como push entregue ou GPS validado no aparelho.

# Revisão da etapa 5 — rastreamento

Branch: `rastreamento-motorista`. Versão para teste; etapas 6 e 7 não iniciadas.
Sem notificações de chegada/atribuição/cancelamento. O aviso persistente Android
é o aviso do serviço de localização, não a implementação de push da etapa 6.

## Preparar o projeto

```bash
git switch rastreamento-motorista
git pull --ff-only
cd backend
npm ci
npm run db:migrate
npm run dev
```

Apenas a nova migration `027_delivery_last_locations.sql` é acrescentada nesta etapa.
Ela cria uma linha de última posição por entrega, sem histórico. Não reaplique o
SQL experimental antigo `026_deliveries_tracking.sql` preservado em um stash.

Em outro terminal:

```bash
cd mobile
npm ci
# Configure EXPO_PUBLIC_API_URL no .env para uma API acessível pelo aparelho.
npx expo run:android --device
# Ou, em macOS com Xcode e aparelho iOS configurado:
# npx expo run:ios --device
```

O build precisa incluir os novos módulos e permissões nativas. Expo Go não serve
como evidência de background/tela bloqueada. `localhost` no telefone aponta para
o próprio telefone; use a API da VM com HTTPS ou endereço acessível na rede de
desenvolvimento. Proxy da API deve permitir `/socket.io/`, polling e upgrade WebSocket.
Não adicione tokens reais aos comandos/documentos do repositório.

## Conferir a entrega

1. Com duas contas em aparelhos/sessões separados, entre como COURIER e CUSTOMER.
   Pela API/telas OWNER existentes, confirme e atribua ao motoboy um pedido DELIVERY.
2. Leve o pedido até READY. No motoboy, abra os detalhes e inicie online.
3. No cartão **Compartilhamento de localização**, escolha **Ativar com app aberto**.
   Aceite a permissão e mantenha o GPS ligado. Confira estado ativo.
4. Abra o pedido do cliente. Confira atualização automática de horário/precisão e
   **Ver última posição no mapa**. O mapa interno do cliente permanece para integração
   pelo responsável; o hook REST/Socket.IO está em `useDeliveryTracking.ts`.
5. Caminhe com segurança mais de 15m; confira nova posição após uma coleta válida.
   Não use esse app como navegação. Posições com precisão acima de 100m são ignoradas.
6. No motoboy, permita também segundo plano. Confira o diálogo de explicação, a
   permissão específica e, no Android, o aviso persistente do serviço.
7. Minimize e depois bloqueie a tela por alguns minutos. Registre os horários no
   cliente, sistema/modelo do telefone e condições de bateria. Marque esse resultado
   apenas após observação real; o teste automatizado usa ponte nativa simulada.
8. Desligue a rede do motoboy. Depois de 2min, a posição deve ser identificada como
   sem atualização recente. Retome a rede: novas coletas retomam os envios, sem
   reprodução de uma trilha antiga.
9. Inicie outra entrega do mesmo motoboy. Conclua uma offline: ela deve deixar de
   receber novos envios locais; a outra permanece ativa. Conclua a última e confira
   que o coletor desliga. No cliente, o encerramento oficial depende da sincronização.
10. Teste negar/revogar permissão, desligar GPS, sair da conta e entrar em outra.
    Não pode haver compartilhamento usando a conta seguinte.
11. Confira acesso alheio: outro CUSTOMER/COURIER não pode ler posição ou assinar
    o canal. Uma entrega concluída retorna posição nula e recusa novos envios.

O GPS não finaliza pedidos automaticamente. Parâmetros de frequência, precisão e
bateria devem ser ajustados pelos resultados reais da etapa 7.

## Verificação automatizada

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

Os testes de integração recriam **somente `marmitaria_test`** e usam MySQL/HTTP e
Socket.IO reais. Os testes nativos simulam permissões, lote de posições e ciclo de
vida; não substituem aparelhos. A exportação Android valida JavaScript/Hermes e
rotas, não é um APK nem comprova funcionamento do sistema operacional.

# Integração do acompanhamento da entrega — cliente e proprietária

Guia para quem vai construir o mapa ou painel que consome o rastreamento do módulo
Motoboy. Contratos conferidos na branch `rastreamento-motorista` em 22/10/2026.
Este documento orienta a integração; não acrescenta uma tela ou muda o banco.

## Escopo e estado atual

A especificação fornecida pelo usuário,
`Especificacao_Modulo_Motoboy_Rastreamento_Di_Casa.pdf`, descreve a posição inicial
por REST e atualizações por Socket.IO na seção 4, página 4. Na seção 7, página 7,
distribui as interfaces: Ricardo, autenticação e roles; Lucas, atribuição de entregas;
Willian, mapa do cliente; Yuri, integração e testes do módulo Motoboy.

| Parte | Situação nesta branch |
|---|---|
| Coleta GPS e envio pelo motoboy | Implementados; dependem de permissão e ativação pelo usuário |
| Consulta da última posição e atualizações Socket.IO | Implementadas, com autorização por entrega |
| Pedido do cliente | Já possui painel com horário, precisão e link para mapa externo |
| Mapa integrado na tela do cliente | A integrar pelo responsável pelo módulo Cliente |
| Pedido da proprietária | Exibe os dados/status do pedido; ainda não monta painel de localização |
| Consulta de localização pela proprietária | Backend já autoriza `OWNER`; pode consumir os mesmos contratos |
| Dashboard de todos os motoboys, histórico de trajeto, ETA e navegação | Não implementados por estes contratos |

A especificação prevê o mapa do cliente. Um mapa no painel administrativo não está
explicitamente atribuído ao módulo Yuri nesse documento. A integração visual na
Proprietária deve ser combinada com o responsável pelo módulo.

## Fluxo e identificadores

1. A tela abre um pedido e obtém seu `orderId` completo.
2. Consulta `GET /deliveries/order/:orderId` para descobrir o `id` da entrega.
3. Usa esse **deliveryId** em `GET /deliveries/:deliveryId/location` e na assinatura
   Socket.IO `delivery:subscribe`.
4. Atualiza o marcador com os snapshots recebidos e informa a idade da posição.
5. Trata mudança de sessão, desconexão, erro de permissão e fim do rastreamento.

`orderId` e `deliveryId` são UUIDs diferentes. O prefixo mostrado em “Pedido #...”
serve apenas para exibição; não pode ser enviado no lugar do UUID completo.
Pedidos `PICKUP` não geram Delivery. O rastreamento fica ativo somente com
Delivery `IN_PROGRESS` e Order `OUT_FOR_DELIVERY`.

O envio do GPS pelo motoboy usa **POST HTTP**. O Socket.IO distribui os snapshots
a quem acompanha a entrega; o consumidor do mapa não deve enviar posições.

## Autenticação e acesso

REST exige `Authorization: Bearer <accessToken>`. Socket.IO recebe o mesmo access
token em `auth: { token: accessToken }`. Não colocar o token na URL.

| Perfil autenticado | Leitura permitida |
|---|---|
| `CUSTOMER` | Somente entrega do próprio pedido |
| `COURIER` | Somente entrega atribuída à própria conta |
| `OWNER` | Entregas consultadas pela proprietária |

Conta ativa, perfil e vínculo são verificados no servidor. O Socket.IO revalida
também antes das emissões e a cada 5 segundos, mesmo sem novos envios GPS. Não
contornar essa autorização acessando MySQL diretamente ou usando token de outro
perfil. Um cliente ou motoboy sem vínculo recebe 404 para não revelar a entrega.

No app existente, usar `api()` de `mobile/src/services/api.ts`: ele envia o token
e trata sua renovação. O token do socket não se renova sozinho; após renovar a
sessão, atualizar `socket.auth`, reconectar e assinar novamente. Nunca compartilhar
tokens no Git, em logs ou capturas de tela.

## REST: descobrir a entrega e carregar a posição

Os caminhos são relativos à base da API, sem prefixo `/api`:

| Método e rota | Retorno relevante |
|---|---|
| `GET /deliveries/order/:orderId` | Objeto Delivery; seu `id` é o deliveryId |
| `GET /deliveries/:deliveryId` | Dados, endereço, `status` da entrega e `orderStatus` |
| `GET /deliveries/:deliveryId/location` | Snapshot `TrackingView` abaixo |

Exemplo usando a infraestrutura autenticada do app; ajustar o caminho do import
à pasta do componente:

```ts
import { api } from './src/services/api';
import type { TrackingView } from './src/features/tracking/policy';

async function loadTracking(orderId: string): Promise<TrackingView> {
  const delivery = await api<{ id: string }>(
    `/deliveries/order/${encodeURIComponent(orderId)}`,
  );
  return api<TrackingView>(`/deliveries/${delivery.id}/location`);
}
```

Resposta de exemplo; IDs, coordenadas e horários são ilustrativos:

```json
{
  "deliveryId": "36050a3b-7272-4b14-b908-aa4315230181",
  "active": true,
  "position": {
    "deliveryId": "36050a3b-7272-4b14-b908-aa4315230181",
    "sampleId": "53851560-e3bd-4443-97e0-fc31b49d4257",
    "latitude": -23.088,
    "longitude": -47.216,
    "accuracy": 12,
    "capturedAt": "2026-10-22T14:30:00.000Z",
    "receivedAt": "2026-10-22T14:30:01.000Z"
  },
  "stale": false
}
```

| Campo | Significado e uso |
|---|---|
| `active` | Estados oficiais permitem rastrear essa entrega; não comprova que o GPS está ligado |
| `position` | Última posição disponível, ou `null`; nunca tratar ausência como coordenadas zero |
| `latitude`, `longitude` | Graus decimais; adaptar à ordem de coordenadas exigida pelo mapa escolhido |
| `accuracy` | Precisão estimada em metros, não distância ao destino |
| `capturedAt` | Instante UTC da coleta GPS; usar para ordenar e mostrar a idade da posição |
| `receivedAt` | Instante UTC de recebimento pelo servidor; não substitui o instante de coleta |
| `sampleId` | Identificador da amostra; mensagens repetidas não significam deslocamento |
| `stale` | Sem posição ou coleta com mais de 2 minutos na consulta ao servidor |

`active: true` com `position: null` significa aguardar uma primeira coleta válida.
`active: false` ocorre antes do início e após conclusão/cancelamento; a posição
retorna `null`, mesmo se existir uma linha antiga no banco. Consultar os estados
da entrega/pedido para distinguir “ainda não iniciou” de “encerrado”.

REST retorna erros com `{ "error": "mensagem" }`. Tratar 401 com o fluxo de sessão,
403/404 limpando a posição sem manter dados de acesso revogado, e falhas de rede
com indicação de posição antiga e tentativa de recuperação.

## Socket.IO: assinatura e atualizações

Conectar ao **mesmo host e porta da API** com `socket.io-client`. O caminho padrão
é `/socket.io/`; não conectar diretamente a uma URL `/deliveries/...` nem usar
um cliente WebSocket puro. Instâncias atrás de proxy precisam aceitar polling e
upgrade WebSocket nesse caminho.

| Evento | Direção | Payload |
|---|---|---|
| `delivery:subscribe` | Consumidor → servidor | String UUID de deliveryId, mais callback de confirmação |
| Confirmação da assinatura | Servidor → callback | `{ ok: true, data: TrackingView }` ou `{ ok: false, status, message }` |
| `delivery:location` | Servidor → consumidor | `TrackingView`, mesma estrutura do GET |
| `tracking:error` | Servidor → consumidor | `{ deliveryId, status, message }` |
| `delivery:unsubscribe` | Consumidor → servidor | Sem payload; remove assinatura atual |

Cada conexão acompanha **uma entrega por vez**. Assinar outra substitui a anterior.
Não existe evento público para entrar livremente numa sala nem evento global com
todas as posições. O servidor emite snapshots também nas revalidações periódicas;
o consumidor deve tolerar repetições.

Sequência mínima de assinatura, para ilustrar o contrato. `applySnapshot` e
`handleError` são callbacks da tela, responsáveis pelas regras da próxima seção:

```ts
import { io } from 'socket.io-client';
import type { TrackingView } from './src/features/tracking/policy';

type TrackingError = { status?: number; message: string; deliveryId?: string };
type SubscriptionReply =
  | { ok: true; data: TrackingView }
  | { ok: false; status: number; message: string };

function subscribeToDelivery(
  apiUrl: string,
  deliveryId: string,
  accessToken: string,
  applySnapshot: (view: TrackingView) => void,
  handleError: (error: TrackingError) => void,
) {
  const socket = io(apiUrl, {
    auth: { token: accessToken },
    autoConnect: false,
    reconnection: true,
  });
  // Reconectar perde a assinatura; repetir em cada evento connect.
  socket.on('connect', () => {
    socket.timeout(10_000).emit('delivery:subscribe', deliveryId,
      (error: Error | null, reply?: SubscriptionReply) => {
        if (error || !reply) {
          handleError({ message: 'Sem confirmação da assinatura.' });
        } else if (!reply.ok) {
          handleError(reply);
        } else {
          applySnapshot(reply.data);
        }
      });
  });
  socket.on('delivery:location', applySnapshot);
  socket.on('tracking:error', handleError);
  socket.on('connect_error', () => handleError({ message: 'Falha ao conectar ao rastreamento.' }));
  socket.on('disconnect', () => handleError({ message: 'Rastreamento desconectado.' }));
  socket.connect();

  // Chamar ao sair da tela, trocar pedido ou encerrar/trocar a sessão.
  return () => {
    socket.removeAllListeners();
    socket.emit('delivery:unsubscribe');
    socket.disconnect();
  };
}
```

Esse exemplo mostra somente o transporte. Ainda exige REST inicial/recuperação,
renovação do token, proteção contra troca de sessão e tratamento visual de posição
antiga. Para o React Native existente, o hook abaixo já reúne esses comportamentos.

## Reutilizar o hook existente no aplicativo

Arquivo: `mobile/src/features/tracking/useDeliveryTracking.ts`.

```tsx
// Chamadas dentro de um componente montado para um único pedido em entrega.
const { view, connected, message, now } = useDeliveryTracking(orderId);
const position = view?.position;
const outdated = !!view?.stale || !freshPosition(position ?? null, now);
```

Importar `freshPosition` de `mobile/src/features/tracking/policy.ts`. A cada render,
usar `position.latitude` e `position.longitude` para atualizar o marcador da
biblioteca de mapas escolhida. O hook não exige uma biblioteca específica.
Não iniciar outra coleta GPS no cliente ou na proprietária: eles apenas consomem
a posição enviada pelo motoboy.

O hook recebe **orderId**, resolve deliveryId, faz REST inicial, assina o socket e
consulta recuperação a cada 15 segundos com a tela em foco e o app ativo. Pausa
ao perder o foco/ir ao segundo plano e recupera ao retornar. Usa o `AuthContext`
e a sessão da conta atual; seu contrato também atende `OWNER`.

Na tela do cliente, a referência pronta está em
`mobile/src/features/tracking/CustomerTrackingCard.tsx`, montada por
`mobile/app/(app)/customer/order/[id].tsx` somente em pedido `DELIVERY` com status
`OUT_FOR_DELIVERY`. Reutilizar esse padrão na Proprietária, em
`mobile/app/(app)/owner/order/[id].tsx`, se esse painel for incluído no seu escopo.
O hook trata snapshot inativo como fim do acompanhamento naquela montagem:
montar o painel quando o pedido sair para entrega, em vez de montá-lo antes do início.

O cartão atual abre a última posição no Google Maps externo. Esse link representa
uma coordenada; o acompanhamento contínuo continua na tela conectada ao backend.

## Regras para a interface do acompanhamento

- Separar status do pedido, conexão do socket e validade da posição. Socket
  conectado não garante GPS recente; `active` também não garante uma coleta.
- Com entrega ativa sem posição, mostrar “Aguardando localização do motoboy”.
- Mostrar horário da coleta e precisão. Atualizar a idade mesmo sem novos eventos;
  após 2 minutos, sinalizar “Localização sem atualização recente”. Usar `now` e
  `freshPosition` do hook, além de `stale`, para não congelar a indicação de frescor.
- Ao perder a rede, sinalizar desconexão. Se mantiver o último marcador permitido,
  identificá-lo como posição antiga. Na recuperação, consultar REST e reassinar.
- Usar `mergeTracking` de `policy.ts` para que um GET atrasado não substitua uma
  coleta mais nova. Filtrar respostas da entrega e sessão atuais.
- Ao receber estado inativo, remover o marcador e encerrar a assinatura. Em
  401/403/404 ou troca de conta, limpar dados da sessão anterior; não continuar
  mostrando uma localização cujo acesso foi revogado.
- O evento de localização não transporta todos os status/dados do pedido. Continuar
  consultando `/orders/:orderId` para CUSTOMER ou `/owner/orders/:orderId` para
  OWNER, conforme o módulo, para atualizar a linha do tempo e os detalhes.
- A referência de mapa pode mostrar destino e motoboy como pontos diferentes.
  Não deduzir rota, tempo estimado ou percentual percorrido só pelas coordenadas.

## Persistência e limites operacionais

A migration existente `027_delivery_last_locations.sql` mantém uma linha por
entrega em `delivery_last_locations`. Ela é atualizada a cada posição aceita;
não há histórico de trajeto a consultar. Não é necessária outra tabela para
consumir a localização atual. A leitura deve continuar via backend autenticado.

O motoboy solicita coletas com intervalo de 10 segundos e deslocamento de 15 m;
o sistema operacional pode alterar a frequência. Amostras com mais de 2 minutos,
mais de 30 segundos no futuro, precisão acima de 100 m ou marcadas como simuladas
no aparelho são descartadas pelo fluxo. O servidor também valida coordenadas,
precisão e horário e limita novas escritas muito próximas. Isso não garante
detecção de fraude GPS. Repetições e posições fora de ordem não fazem o marcador
voltar no tempo.

Durante falta de rede, não se acumula uma trilha para reproduzir como localização
ao vivo. A conclusão offline interrompe o envio local daquela entrega; até a
sincronização, o servidor pode continuar indicando entrega ativa com posição
antiga. Depois da conclusão oficial, retorna `active: false, position: null`.

O Socket.IO atual funciona numa instância do backend. Distribuir a API em várias
instâncias exigirá coordenar salas e eventos; isso não está configurado aqui.

## Roteiro de integração e teste

1. Preparar o APK/API conforme [apk-android.md](apk-android.md) e a entrega conforme
   [teste-apk-motoboy.md](teste-apk-motoboy.md).
2. Usar duas sessões simultâneas: COURIER no Android e CUSTOMER ou OWNER no
   consumidor. Trocar de conta no mesmo aplicativo interrompe o GPS do motoboy.
3. Iniciar a entrega, ativar o compartilhamento e aceitar GPS preciso. No consumidor,
   conferir o deliveryId e a resposta REST antes de integrar o mapa.
4. Confirmar chegada de `delivery:location`, horário, precisão e atualização do
   marcador após deslocamento. Não confundir resposta nula com erro de transporte.
5. Interromper a rede; verificar indicação de posição antiga, reconexão e nova
   assinatura. Testar recuperação REST também quando o socket estiver indisponível.
6. Concluir/cancelar e conferir remoção do marcador. Testar outro CUSTOMER/COURIER:
   acesso não autorizado deve falhar no REST e no socket.
7. Testar expiração de token, troca de conta/pedido e saída da tela, verificando
   limpeza de listeners e ausência de coordenadas da sessão anterior.
8. Registrar GPS em primeiro plano, segundo plano e tela bloqueada separadamente
   na [matriz de dispositivos](validacao-dispositivos.md).

Na sessão atual, o usuário confirmou instalação, login do motoboy e visualização
do pedido pela proprietária. Isso ainda não comprova recepção GPS ou funcionamento
do mapa. O destino do seed é fictício em Indaiatuba; o teste de chegada precisa
de outro destino próximo ao aparelho. A API local só fica acessível ao telefone
enquanto ambos estiverem na rede correta e o backend estiver ligado.

## Arquivos de referência

| Arquivo | Papel |
|---|---|
| `backend/src/modules/deliveries/deliveries.routes.ts` | Rotas REST de resolução da entrega e localização |
| `backend/src/modules/tracking/tracking.schemas.ts` | Tipos e validação da posição |
| `backend/src/modules/tracking/tracking.repository.ts` | Autorização, estados, frescor e última posição |
| `backend/src/modules/tracking/tracking.socket.ts` | Autenticação, assinatura e eventos Socket.IO |
| `mobile/src/features/tracking/nativeTracking.ts` | Coleta e envio pelo motoboy |
| `mobile/src/features/tracking/policy.ts` | Contratos, validação de amostras e mesclagem de snapshots |
| `mobile/src/features/tracking/useDeliveryTracking.ts` | Consumo no app, sessão e recuperação |
| `mobile/src/features/tracking/CustomerTrackingCard.tsx` | Painel existente do cliente |
| `backend/tests/integration/deliveries.integration.test.ts` | Testes HTTP/Socket.IO e acesso por perfil |

Ver também [modulo-motoboy.md](modulo-motoboy.md), seção “Etapa 5”, para o contrato
de envio GPS e os detalhes internos do módulo.

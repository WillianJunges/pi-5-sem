# Proposta da etapa 6 — chegada e notificações

Status: escopo aprovado e implementado; recebimento real de push aguarda configuração
Expo/FCM e validação em aparelho. Veja o contrato em `modulo-motoboy.md` e o roteiro
em `teste-etapa6.md`.
Branch de trabalho: `rastreamento-motorista`. A etapa 5 permanece disponível para
teste; GPS, tela bloqueada e recebimento push ainda precisam de aparelho real.

## Resultado esperado

1. Durante uma entrega em andamento, usar as coletas GPS já existentes para detectar
   proximidade do destino. Raio inicial de 100m, exigindo posição recente, boa
   precisão e confirmação por mais de uma coleta; parâmetros sujeitos a ensaio.
2. Oferecer notificação local "Você chegou ao destino. O pedido foi entregue?".
   Tocar abre os detalhes e a confirmação existente. Nunca concluir pela distância
   nem pelo simples toque no aviso. A conclusão pode usar a fila offline vigente.
3. Notificar o motoboy sobre nova atribuição, retirada de atribuição na troca de
   responsável e cancelamento de entrega atribuída. Notificar o cliente quando o
   pedido sair para entrega, conforme a especificação anexada.
4. Ao abrir um aviso, validar a sessão e consultar a entrega antes de oferecer ações.
   Não colocar endereço, telefone ou coordenadas no conteúdo push.
5. Separar autorização de notificações e GPS. Negar notificações não impede as ações
   da entrega. Solicitar permissão explicitamente e fornecer opção de desativar push.

## Mudanças propostas no MySQL

Migration nova `028_delivery_notifications.sql`, sem reescrever migrations aplicadas.

| Estrutura | Dados e propósito |
|---|---|
| `push_devices` | Instalação, conta associada, token Expo, plataforma, estado ativo e datas; tokens únicos, sem senhas/refresh tokens |
| `delivery_notification_events` | Evento de negócio, entrega, destinatário, tipo, horário e identificador único; fila durável dos avisos |
| `push_notification_attempts` | Evento/dispositivo, estado, tentativas, próxima tentativa, reserva de envio, ticket/recibo e erro resumido; UNIQUE por evento/dispositivo |

Triggers adicionais em `deliveries` registrarão eventos apenas nas transições
efetivas de atribuição, troca, início e cancelamento, dentro da mesma transação.
Isso abrange o cancelamento coordenado por trigger de pedidos, sem depender de uma
chamada HTTP específica. Não será gerado push para entregas históricas da migration.
Falha/rollback da transição também desfaz o evento. Reenvio idempotente não cria
novo evento. Chaves estrangeiras e índices apoiarão integridade e processamento.

O worker enviará somente eventos confirmados e destinatários/dispositivos ainda
elegíveis, evitando avisos obsoletos depois de troca de conta, reatribuição ou
cancelamento. Reservas e retentativas persistidas permitirão recuperar interrupções.
Tokens rejeitados pelo provedor serão desativados; tickets e recibos serão tratados.
Push é sujeito a atraso, perda ou duplicação no transporte; a aplicação eliminará
duplicações reconhecíveis por identificador, sem prometer entrega exatamente uma vez.

## Mudanças locais e no aplicativo

- Acrescentar `expo-notifications`, canais Android e configuração nativa necessária.
- Registrar/desativar o dispositivo em endpoints autenticados; reconciliar token e
  conta no login, logout e troca de usuário. Logout offline enfileira a desvinculação
  e bloqueia a abertura de dados da conta anterior. Avisos genéricos já em trânsito
  podem aparecer no sistema; tocar sempre revalidará a sessão. O backend revalidará
  a associação conhecida no envio, sem prometer revogação remota enquanto offline.
- Guardar no SQLite os controles de proximidade por usuário/entrega: alerta já
  emitido, última coleta válida e prazo para evitar repetição após reiniciar. Migração
  local incremental, preservando cache e fila de conclusões existentes.
- Usar a tarefa GPS existente para a detecção local, inclusive sem internet. Encerrar
  detecção após conclusão local/servidor e manter separadas entregas simultâneas.
- Revalidar sessão e entrega no toque do aviso. Aviso de outra conta não abre dados.
- Incluir comentários de manutenção e roteiro de revisão manual.

## Dependências externas e validação

O repositório ainda não define `android.package`, EAS `projectId` ou credenciais push.
A entrega real ao Android via Expo Push exige projeto Expo/EAS e FCM v1 configurados
para o aplicativo. Reutilizar configuração existente do usuário se disponível; não
inventar identificadores, usar contas pessoais nem inserir chaves no repositório.
Se faltarem essas configurações, preparar a integração e testes com transporte
simulado, e documentar precisamente o que impede o recebimento real.

Testes previstos: proximidade/precisão e repetição; várias entregas; retomada após
reinício; conclusão offline; permissão recusada; navegação por aviso e troca de
conta; transação/rollback/idempotência dos eventos; retentativa, reserva, recibos e
token inválido no worker. Executar typechecks, testes relevantes, build backend e
exportação Android. Não apresentar mocks como push entregue em aparelho.

Ao concluir a etapa autorizada: atualizar documentação, commit e push na branch.
Parar antes da etapa 7; testes físicos permanecem pendentes até haver aparelho.

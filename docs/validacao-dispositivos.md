# Registro de validação em dispositivos — etapa 7

Estado inicial: **nenhum ensaio físico executado**. Este arquivo é a matriz de
execução e registro, não uma evidência de aprovação.

Base preparada: `a192541`, branch `rastreamento-motorista`.
Roteiros de instalação e operação: [etapa 5](teste-etapa5.md) e
[etapa 6](teste-etapa6.md). Validar sempre o commit realmente instalado, inclusive
depois de correções.

## Identificar a instalação

Preencher no início de cada sessão:

- Data e horário com fuso:
- Responsável pelo ensaio:
- Fabricante/modelo: pendente; versão Android informada pelo usuário: 16
- Commit instalado e tipo de build: instalação pendente; APK ainda não gerado
- Local de execução da API e commit do backend:
- Conexão: Wi-Fi/dados móveis/USB; condições de bateria:
- Permissões de GPS, segundo plano e notificações:
- Sessão de cliente usada para acompanhar: segundo aparelho ou emulador:
- Expo/EAS e FCM configurados para este aplicativo: sim/não:

Não incluir senhas, tokens, chaves, telefone ou endereço pessoal no registro.
Usar contas e pedidos criados para teste. Evidências devem identificar o caso,
horários e resultado, sem expor dados privados.

## Matriz

Estados permitidos: NÃO EXECUTADO, PASSOU, FALHOU e BLOQUEADO. Falha precisa de
passos para reproduzir. Bloqueio precisa do requisito ausente. Não substituir
resultado observado pelo comportamento esperado abaixo.

| Caso | Procedimento | Resultado esperado | Estado inicial |
|---|---|---|---|
| D01 — acesso e navegação | Entrar como COURIER; abrir abas, detalhes e conta; tentar acesso de outro perfil | Somente dados/ações permitidos para a conta | NÃO EXECUTADO |
| D02 — endereço | Copiar e colar o endereço em outro aplicativo | Texto completo coincide com o snapshot da entrega | NÃO EXECUTADO |
| D03 — estados online | Atribuir; tentar iniciar antes de READY; iniciar após READY e concluir | Recusa antecipada; Order e Delivery coerentes após ações válidas | NÃO EXECUTADO |
| D04 — GPS com app aberto | Com entrega iniciada e GPS ativo, caminhar por 5min; acompanhar no cliente | Posições recentes chegam; registrar horários e intervalos observados | NÃO EXECUTADO |
| D05 — segundo plano | Permitir background, minimizar por 5min e continuar deslocamento | Registrar continuidade/interrupção das coletas e comportamento do aviso Android | NÃO EXECUTADO |
| D06 — tela bloqueada | Bloquear por 5min durante deslocamento; acompanhar pelo cliente | Registrar continuidade, intervalos e limitações do aparelho | NÃO EXECUTADO |
| D07 — rede intermitente | Desligar rede, aguardar mais de 2min e reconectar | Cliente indica posição antiga; novas coletas retomam sem reproduzir trajeto antigo | NÃO EXECUTADO |
| D08 — conclusão offline | Sem rede, concluir; fechar/reabrir; reconectar | Mesma pendência persiste e sincroniza; GPS da entrega para; estados oficiais coerentes | NÃO EXECUTADO |
| D09 — duas entregas | Iniciar duas; concluir uma offline, depois a outra | Primeira deixa de compartilhar; segunda continua; última conclusão desliga coletor | NÃO EXECUTADO |
| D10 — chegada | Ativar alerta local; entrar na área com precisão adequada; permanecer/sair/voltar | Pergunta local, sem repetição contínua e sem conclusão automática | NÃO EXECUTADO |
| D11 — permissões e GPS | Negar/revogar notificação, revogar GPS e desligar localização; restaurar | Mensagem adequada e recuperação; negar aviso não bloqueia ações logísticas | NÃO EXECUTADO |
| D12 — sessão | Sair com pendências, entrar em outra conta e tocar em aviso antigo | Sem acesso a dados da anterior; pendências preservadas para a conta responsável | NÃO EXECUTADO |
| D13 — push real | Com Expo/FCM configurado, atribuir/trocar/cancelar/iniciar; testar aberto/minimizado/bloqueado | Aviso no destinatário correto; toque consulta estado oficial antes de abrir | BLOQUEADO — falta configurar Expo/EAS e FCM |
| D14 — encerramento pelo SO | Encerrar app/ativar economia de bateria e reabrir | Registrar limite real; retomada consistente, sem prometer coleta com processo encerrado | NÃO EXECUTADO |

## Registrar cada execução

Copiar este bloco para cada caso executado:

```text
Caso:
Data/hora/fuso:
Aparelho e commit:
Condições e permissões:
Passos realizados:
Resultado observado:
Estado: PASSOU / FALHOU / BLOQUEADO
Evidência sem dados privados:
Defeito e passos mínimos para reproduzir, se houver:
Correção/commit, se houver:
Resultado do reteste:
```

## Limites da evidência atual

As etapas anteriores passaram em testes automatizados e exportação Android/Hermes.
Isso não produz um APK instalado, não comprova localização nativa e não confirma
recebimento de notificações pelo sistema. A matriz permanece pendente até a
execução no aparelho. Uma aprovação em um modelo/versão Android não é evidência
automática para todos os fabricantes ou para iOS.

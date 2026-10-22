# Etapa 7 — validação em Android real

Escopo proposto para revisão, seguindo o controle de aprovação por etapa.
Base: commit `a192541` da branch `rastreamento-motorista`.

## O que será feito

1. Preparar a instalação nativa no Android da equipe e a comunicação com a API.
   Confirmar versão instalada, sessões de teste e permissões antes dos ensaios.
2. Executar a matriz em [validacao-dispositivos.md](validacao-dispositivos.md):
   navegação, endereço, estados, GPS, segundo plano, tela bloqueada, rede intermitente,
   conclusão offline após reinício, duas entregas, chegada local e isolamento de contas.
3. Quando o projeto Expo/EAS e FCM estiver configurado, verificar push real de
   atribuição, retirada, cancelamento e saída para entrega, inclusive ao tocar no aviso.
4. Registrar resultado observado, aparelho/Android, commit e condições de execução.
   Diferenciar passou, falhou, não executado e bloqueado por configuração.
5. Corrigir defeitos reproduzidos e repetir os casos afetados, mantendo comentários
   de manutenção. Ajustes de precisão/frequência/raio só serão feitos com evidência.
6. Atualizar documentação, registrar commit e fazer push na mesma branch.

## Banco e escopo de mudanças

Não há migration, tabela ou coluna nova prevista. Os testes usam as estruturas
existentes de entregas, localização, eventos e tentativas. Não apagar bases nem
executar cenários destrutivos sobre pedidos reais. Usar contas e pedidos de teste.

Se um defeito exigir alteração de schema, explicar a necessidade e a migration
antes de aplicá-la. A etapa não inclui funcionalidades novas, mapa interno do cliente,
publicação em loja ou deploy de produção.

## Pré-requisitos confirmados

Este ambiente cloud não possui `adb`, emulador ou SDK Android configurado. Não há
conexão disponível aqui com um telefone físico; USB conectado ao computador do
usuário não fica automaticamente acessível à máquina cloud.

O perfil `preview` usa o identificador Android de teste `com.ymlp.marmitaria.teste`.
O usuário criou e vinculou o projeto EAS na cópia Windows; esse vínculo local é
preservado por `app.config.js`. A configuração Firebase/FCM continua pendente e,
por isso, recebimento push real permanece bloqueado. Alertas locais,
GPS e conclusão offline podem ser testados após instalar um build nativo, sem push.

O responsável pelo aparelho precisará executar os passos locais e compartilhar os
resultados observados. Nenhum teste físico será marcado como aprovado por simulação,
exportação JavaScript ou testes automatizados anteriores.

O usuário informou um aparelho com **Android 16** e um computador **Windows sem
Android Studio**. Para essa preparação, foi acrescentado o perfil APK via EAS em
`mobile/eas.json`; veja [apk-android.md](apk-android.md). Ele permite compilar na
nuvem sem SDK no Windows. Login e vínculo Expo foram confirmados, assim como acesso
à API pelo navegador Android em `http://192.168.15.7:3333/health`. O perfil de teste
permite HTTP para essa rede; ainda faltam definir a variável da API no EAS e compilar.
Ainda não foi gerado APK nem executado ensaio físico do aplicativo.

## Critério de conclusão

Matriz executada nos dispositivos disponíveis, falhas relevantes reproduzidas e
corrigidas, retestes registrados e limitações restantes explicitadas. Se faltarem
aparelho, instalação ou configuração push, a parte correspondente permanece pendente;
não declarar a etapa inteira concluída.

# APK de teste no Android — Windows sem Android Studio

O perfil `preview` de `mobile/eas.json` gera um APK pelo serviço Expo EAS Build.
A compilação ocorre nos servidores do serviço; o Windows precisa apenas de Git,
Node e acesso à conta Expo da equipe. Android Studio, SDK local, Expo Go e Metro
não são necessários para instalar/abrir esse APK: o JavaScript fica dentro dele.

## Primeiro passo no Windows

Para quem ainda não tem o ambiente preparado, abrir **PowerShell** e executar:

```powershell
foreach ($ferramentaTeste in "node", "git", "docker") {
  if (Get-Command $ferramentaTeste -ErrorAction SilentlyContinue) {
    & $ferramentaTeste --version
  } else {
    Write-Output "$ferramentaTeste : não instalado"
  }
}
```

Esse comando só informa o que já está instalado. Não altera o Windows e não precisa
ser executado como administrador. Compartilhar o resultado permite orientar a
instalação apenas do que faltar. Docker é necessário se os bancos/backend forem
executados nesse Windows; não é requisito do APK nem do EAS Build em si.

Não é necessário descobrir uma URL de API ou escolher identificadores sozinho:
essas configurações fazem parte da preparação orientada. O usuário precisará entrar
na conta Expo da equipe quando chegar à etapa de build; nunca compartilhar a senha.

## Requisitos antes de compilar

1. Vincular o app ao projeto Expo/EAS correto com `npx.cmd eas-cli@latest init`.
   O vínculo fica em `expo.extra.eas.projectId` no `app.json` local. A configuração
   dinâmica em `app.config.js` preserva esse vínculo. O perfil `preview` define
   o pacote de teste `com.ymlp.marmitaria.teste`, nome `Marmitaria Teste` e scheme
   `marmitaria-teste`; o identificador de produção continua a cargo da equipe.
2. Definir `EXPO_PUBLIC_API_URL` no ambiente EAS **preview**, apontando para uma API
   acessível pelo celular. Ela é pública e entra no aplicativo durante o build;
   não incluir senhas/tokens nessa variável.
3. Preferir uma API HTTPS acessível pelo aparelho. `localhost`, `127.0.0.1` e
   `10.0.2.2` não apontam para o Windows em um APK instalado no telefone. Se o
   backend ficar no Windows, usar seu IP na mesma rede Wi-Fi e conferir firewall;
   O perfil `preview` usa `APP_VARIANT=preview` para permitir HTTP no Android pelo
   plugin `expo-build-properties`. Essa liberação não é aplicada fora dessa variante.
4. Para push real, configurar Firebase/FCM conforme [teste-etapa6.md](teste-etapa6.md).
   Isso não é necessário para iniciar os testes de GPS/alertas locais/offline.
   Em build EAS, o arquivo Firebase também precisa ser disponibilizado ao servidor
   de compilação: um arquivo ignorado pelo Git não é enviado automaticamente.
   Preferir a configuração de arquivo do ambiente EAS; não versionar chaves privadas.

O APK não inclui a API, MySQL ou MongoDB. Esses serviços precisam estar disponíveis
separadamente para login e operações online. Configuração pública de API alterada
depois da compilação exige gerar outro APK neste fluxo.

O mapa também usa `EXPO_PUBLIC_CARTO_API_KEY`. Para desenvolvimento, defina-a em
`mobile/.env` e reinicie o Expo. Para compilar pelo EAS, configure a variável no
ambiente EAS `preview`. Variáveis `EXPO_PUBLIC_` ficam visíveis no aplicativo:
a chave da CARTO não é um segredo. Consulte as condições, limites e restrições no
painel da CARTO e mantenha a atribuição do mapa visível.

## Compilar no serviço usando o Windows

Na cópia atualizada da branch `rastreamento-motorista`, com login e vínculo EAS
concluídos, executar no PowerShell. O IP abaixo foi confirmado pelo usuário no
navegador Android durante esta preparação; em outra rede, usar o endereço verificado
para aquele computador:

```powershell
Set-Location "$env:USERPROFILE\pi-5-sem-teste\mobile"
git pull --ff-only
npm.cmd ci
npx.cmd eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value "http://192.168.15.7:3333" --visibility plaintext
npx.cmd eas-cli@latest build --platform android --profile preview
```

Se a variável já existir, atualizar seu valor pelo painel do projeto Expo em vez
de criar uma duplicata. O endereço é público e entra no APK, sem senhas ou tokens.
O `app.json` alterado por `eas init` não deve ser descartado; essa atualização da
branch não modifica esse arquivo. Se o Git indicar conflito, interromper e analisar
a mensagem, sem usar reset/checkout para apagar o vínculo.

Usar a conta da equipe. Para esse pacote de teste, se a CLI perguntar se deve gerar
um novo keystore Android, responder `y`: o EAS gerencia a chave de assinatura do APK.
Não compartilhar senha ou token no chat. Autenticar no Windows não autentica
automaticamente este ambiente cloud do Codex.

O EAS fornece uma página/link do build. Depois de terminar com sucesso, abrir o
link no Android, baixar o `.apk`, autorizar a instalação por essa origem e instalar.
O app deve abrir sem terminal Metro no computador; a API ainda precisa estar acessível.

## Estado atual

Perfil APK preparado, com pacote separado e HTTP permitido apenas na variante de
teste. O usuário confirmou login Expo e vínculo do projeto no Windows. O navegador
do Android acessou `http://192.168.15.7:3333/health`; a API retornou bancos saudáveis.
MySQL no Windows usa porta de host 3307 e `DB_PORT=3307` no backend.

O usuário concluiu o build EAS pelo Windows, instalou e abriu o APK no Android 16.
Relatou login bem-sucedido como motoboy depois de reconectar à rede Wi-Fi da API.
Nenhum build foi executado neste ambiente cloud. Para preparar a primeira entrega,
seguir [teste-apk-motoboy.md](teste-apk-motoboy.md).

Compilar APK e executar os ensaios em Android 16 são passos distintos. Os testes da
[matriz de dispositivos](validacao-dispositivos.md) continuam pendentes; instalar e
entrar no app não comprova navegação completa, GPS ou notificações.

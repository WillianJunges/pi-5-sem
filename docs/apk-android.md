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

1. Definir o identificador Android real da equipe em `expo.android.package` e
   vincular o app ao projeto Expo/EAS correto (`expo.extra.eas.projectId`).
   Não foi escolhido identificador nem criado projeto automaticamente.
2. Definir `EXPO_PUBLIC_API_URL` no ambiente EAS **preview**, apontando para uma API
   acessível pelo celular. Ela é pública e entra no aplicativo durante o build;
   não incluir senhas/tokens nessa variável.
3. Preferir uma API HTTPS acessível pelo aparelho. `localhost`, `127.0.0.1` e
   `10.0.2.2` não apontam para o Windows em um APK instalado no telefone. Se o
   backend ficar no Windows, usar seu IP na mesma rede Wi-Fi e conferir firewall;
   HTTP também exige verificar/liberar explicitamente o tráfego no build Android.
4. Para push real, configurar Firebase/FCM conforme [teste-etapa6.md](teste-etapa6.md).
   Isso não é necessário para iniciar os testes de GPS/alertas locais/offline.
   Em build EAS, o arquivo Firebase também precisa ser disponibilizado ao servidor
   de compilação: um arquivo ignorado pelo Git não é enviado automaticamente.
   Preferir a configuração de arquivo do ambiente EAS; não versionar chaves privadas.

O APK não inclui a API, MySQL ou MongoDB. Esses serviços precisam estar disponíveis
separadamente para login e operações online. Configuração pública de API alterada
depois da compilação exige gerar outro APK neste fluxo.

## Compilar no serviço usando o Windows

Na cópia atualizada da branch `rastreamento-motorista`, com os requisitos acima
resolvidos, executar no PowerShell:

```powershell
cd mobile
npm ci
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Usar a conta da equipe. A CLI pode pedir confirmação do projeto e configuração da
assinatura Android; conferir as opções com o responsável. Não compartilhar senha
ou token no chat. Autenticar no Windows não autentica automaticamente este ambiente
cloud do Codex.

O EAS fornece uma página/link do build. Depois de terminar com sucesso, abrir o
link no Android, baixar o `.apk`, autorizar a instalação por essa origem e instalar.
O app deve abrir sem terminal Metro no computador; a API ainda precisa estar acessível.

## Estado atual

Perfil APK preparado. Nenhum build EAS foi iniciado e nenhum APK foi gerado ainda.
Não há autenticação Expo disponível neste ambiente, identificador Android/projeto
EAS configurados ou URL de API confirmada para o aparelho. Esses requisitos precisam
ser resolvidos antes de anunciar um APK funcional para download.

Compilar APK e executar os ensaios em Android 16 são passos distintos. Os testes da
[matriz de dispositivos](validacao-dispositivos.md) continuam sem execução física.

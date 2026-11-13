# Simulador de rota para a apresentação

Alternativa para demonstrar o mapa do cliente sem sair de moto, por exemplo se
o backend não estiver acessível fora da rede local. O simulador roda no computador
e envia posições fictícias para uma entrega em andamento. Ele demonstra o envio
pelo backend e a atualização do mapa, mas não testa o GPS real nem o rastreamento
do celular do motoboy com a tela bloqueada.

## Preparação

- Ligue os bancos e o backend no computador.
- Conecte os celulares à rede que permite acessar o backend. No build de
  desenvolvimento, mantenha também o servidor Expo acessível.
- O mapa precisa de internet e da chave CARTO configurada no ambiente do app.
- Crie um pedido de entrega, confirme e prepare como proprietária, marque como
  pronto, atribua um motoboy e inicie a entrega no perfil do motoboy.
- Abra o acompanhamento desse pedido no app do cliente.

## Simular o trajeto

Em **outro PowerShell**, sem fechar os terminais do backend e do Expo:

```powershell
cd C:\Users\wikka\Desktop\TG\PI\pi-5-sem\backend
$env:COURIER_PASSWORD = Read-Host "Digite a senha do motoboy"
```

Quando a senha for solicitada, digite **somente a senha** e aperte Enter. Ela
aparece na tela enquanto é digitada; não inclua a senha em prints. Quando o
prompt `PS ...>` voltar, execute o comando abaixo com o e-mail do motoboy que
está atribuído à entrega:

```powershell
npm run sim:route -- "EMAIL_DO_MOTOBOY"
```

O simulador escolhe uma entrega em andamento dessa conta e envia posições a cada
cinco segundos, durante aproximadamente dois minutos. Acompanhe o marcador no
celular do cliente. Para interromper, pressione `Ctrl+C` **no terminal do
simulador**. Depois, conclua a entrega pelo app do motoboy.

Use apenas uma entrega em andamento nessa conta para garantir que o simulador
escolha a entrega demonstrada. A coleta real de GPS do motoboy também pode enviar
posições ao mesmo tempo e interferir na simulação; confira o comportamento no ensaio.
O endereço mostrado no terminal pode ser dado pessoal: use dados de teste na demo.

Ao terminar, remova a senha do ambiente do PowerShell:

```powershell
Remove-Item Env:COURIER_PASSWORD
```

Ensaie antes da apresentação e apresente o trajeto como uma **simulação**, não
como uma volta de moto real.

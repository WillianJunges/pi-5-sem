# Preparar uma entrega fictícia para o APK

Usar apenas no banco local de desenvolvimento. Não há migration ou alteração de
schema. Com as contas `motoboy@example.com` (COURIER), `proprietaria@example.com`
(OWNER) e o catálogo do dia preparados, executar no PowerShell:

```powershell
Set-Location "$env:USERPROFILE\pi-5-sem-teste\backend"
git pull --ff-only
npm.cmd run db:seed:courier
```

O comando exige `NODE_ENV=development` (padrão quando não definido). Cria o cliente
fictício `cliente.entrega@example.com`, senha local de teste `Teste123456!`, se essa
conta não existir; nunca altera senha ou perfil de uma conta existente. Cria um
endereço fictício em Indaiatuba e um pedido com um item do cardápio de hoje. Simula
distância de 1 km somente na instância do serviço usada pelo seed; preços e taxa
seguem os serviços existentes. Não consulta geocodificação ou rota externa.

O pedido passa por confirmação, preparo e pronto usando as ações normais. A entrega
gerada pelo trigger é atribuída ao motoboy de teste. Cada execução sequencial
reutiliza o pedido ativo marcado por esse seed, inclusive após uma falha parcial;
não reinicia entregas em andamento nem troca seu responsável. Após concluir ou
cancelar o pedido, outra execução cria um novo exemplo. Não executar o seed em
paralelo. Se houver falha, ele pode deixar dados de teste parciais e informar o erro;
corrigir a causa e executar novamente permite continuar a preparação.

No celular, continuar como motoboy, atualizar a lista e abrir a entrega. Conferir
endereço, observações e pagamento antes de iniciar. Não é necessário recompilar o APK:
essas mudanças são dados do backend. Depois, executar os casos da
[matriz de validação](validacao-dispositivos.md) um por vez.

O endereço é fictício e as coordenadas são de referência em Indaiatuba. Não seguir
até esse destino nem considerar esse seed uma validação de geocodificação, cálculo
de rota ou chegada real. O teste de chegada precisa de outro destino configurado
perto do aparelho. Os testes de GPS, segundo plano e notificações continuam pendentes.

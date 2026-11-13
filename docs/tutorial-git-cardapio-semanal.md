# TUTORIAL GIT — CARDÁPIO SEMANAL E BUILD DE DESENVOLVIMENTO

Branch sugerida: `feat/cardapio-semanal`

## 1. CRIAR A BRANCH, COMMIT E PUSH

Na raiz do projeto, confira os arquivos antes de adicionar. As alterações incluem
o vínculo EAS em `mobile/app.json`, o perfil de desenvolvimento e o cardápio.

```powershell
git switch -c feat/cardapio-semanal
git status
git add .
git status
git commit -m "feat: cardapio semanal com aprovacao diaria"
git push -u origin feat/cardapio-semanal
```

## 2. PRINTS

1. A lista com o modelo semanal do dia.
2. O modelo e seus itens, com a opção de preparar o cardápio.
3. O cardápio do dia aguardando ativação e, depois, ativo.
4. Um cardápio especial por data e a visão do cliente.

## 3. PULL REQUEST

Base: `main` ← compare: `feat/cardapio-semanal`

Título: `feat: cardápio semanal com aprovação diária`

Descrição para copiar:

```markdown
## O que foi feito
- Modelos de cardápio por dia da semana e cardápios especiais por data.
- Preparação de uma cópia para o dia e aprovação manual antes da abertura.
- Encerramento do cardápio anterior ao ativar o próximo, mantendo o histórico.
- Perfil de build de desenvolvimento para testar alterações no Android.

## Para testar
- Na pasta `backend`, execute `npm run db:migrate` para aplicar a migração 029.
- Crie um modelo para o dia atual, adicione itens, prepare a cópia e ative-a.
- Confira o cardápio no perfil de cliente; teste também um especial por data.
- O build de desenvolvimento precisa do servidor Expo e de uma API acessível.

## Prints
| Modelo semanal | Aprovação | Cliente |
|:---:|:---:|:---:|
| <img src="COLE_AQUI_O_LINK_1" width="220"> | <img src="COLE_AQUI_O_LINK_2" width="220"> | <img src="COLE_AQUI_O_LINK_3" width="220"> |
```

Arraste os prints para o PR e substitua os textos pelos links gerados pelo GitHub.

## 4. DEPOIS DO MERGE

```powershell
git switch main
git pull
git branch -d feat/cardapio-semanal
git fetch --prune
```

# App da Marmitaria

Aplicativo de pedidos de marmitas com três perfis de uso:

- **Cliente** — consulta o cardápio, faz e acompanha pedidos.
- **Proprietária** — gerencia produtos, cardápios, pedidos e motoboys.
- **Motoboy** — recebe e realiza as entregas, com rastreamento em tempo real.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `mobile/` | App em React Native (Expo + TypeScript + Expo Router) |
| `backend/` | API em Node.js (Express + TypeScript) |
| `database/` | Scripts SQL do MySQL (tabelas, views, functions, procedures, triggers) |
| `docs/` | Documentação do projeto |

## Bancos de dados

- **MySQL** — base relacional principal ([docs/banco-de-dados.md](docs/banco-de-dados.md))
- **MongoDB** — dados desnormalizados ([docs/banco-nao-relacional.md](docs/banco-nao-relacional.md))

## Como rodar

Veja [docs/ambiente.md](docs/ambiente.md).

## Equipe

| Integrante | Módulo |
|---|---|
| Ricardo | Base, autenticação e documentação |
| Willian | Cliente |
| Yuri | Motoboy e rastreamento |
| Lucas | Proprietária |

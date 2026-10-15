# Arquitetura

## Visão geral

```
mobile (Expo / React Native)  ──HTTP/JSON──▶  backend (Node + Express)  ──▶  MySQL
                              ◀─Socket.IO──   (rastreamento em tempo real)
```

## Backend — organização por módulos

```
backend/src/
├── app.ts              # configuração do Express (middlewares, rotas, erros)
├── server.ts           # sobe o servidor HTTP
├── routes.ts           # junta as rotas de todos os módulos
├── config/             # variáveis de ambiente, conexão com banco
├── shared/             # código usado por todos (erros, middlewares)
└── modules/
    └── <modulo>/
        ├── <modulo>.routes.ts       # define as URLs
        ├── <modulo>.controller.ts   # lê a requisição e devolve a resposta
        ├── <modulo>.service.ts      # regras de negócio
        └── <modulo>.repository.ts   # acesso ao banco
```

Fluxo de uma requisição: **Route → Controller → Service → Repository → Banco**.

Regra: o *controller* não acessa o banco e o *repository* não tem regra de negócio.

## Mobile — organização

```
mobile/
├── app/        # telas (Expo Router: cada arquivo é uma rota)
└── src/        # código que não é tela (serviços, contextos, componentes)
```

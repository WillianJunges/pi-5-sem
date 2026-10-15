# Arquitetura

## Visão geral

```
mobile (Expo / React Native)  ──HTTP/JSON──▶  backend (Node + Express)  ──▶  MySQL   (relacional)
                              ◀─Socket.IO──   (rastreamento em tempo real) └─▶  MongoDB (desnormalizado)
```

## Backend — organização por módulos

```
backend/src/
├── app.ts              # configuração do Express (middlewares, rotas, erros)
├── server.ts           # sobe o servidor HTTP
├── routes.ts           # junta as rotas de todos os módulos
├── config/             # variáveis de ambiente, conexões (MySQL e MongoDB)
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
├── app/                      # telas (Expo Router: cada arquivo é uma rota)
│   ├── _layout.tsx           # AuthProvider + separa área logada / não logada
│   ├── (auth)/               # login e cadastro (só sem sessão)
│   └── (app)/                # só com sessão
│       ├── index.tsx         # redireciona para a área do perfil
│       ├── profile.tsx       # perfil do usuário + sair
│       ├── customer/         # Cliente       → Willian
│       ├── owner/            # Proprietária  → Lucas
│       └── courier/          # Motoboy       → Yuri
└── src/
    ├── components/           # componentes reutilizáveis (Button, TextField...)
    ├── contexts/             # AuthContext (useAuth)
    ├── services/             # api(), autenticação, chamadas ao backend
    ├── utils/
    └── theme.ts              # cores e espaçamentos
```

Cada perfil só consegue abrir a própria pasta (`Stack.Protected` em `app/(app)/_layout.tsx`).
Cada integrante trabalha dentro da pasta do seu perfil, o que evita conflitos de merge.

Hook de autenticação disponível em qualquer tela:

```tsx
const { user, signOut } = useAuth();   // user.id, user.name, user.role...
```

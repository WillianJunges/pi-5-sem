# Ambiente de desenvolvimento

## Pré-requisitos

- [Node.js](https://nodejs.org) 22 ou superior (LTS)
- [Docker](https://www.docker.com/) + Docker Compose (para o MySQL)
- Git
- App **Expo Go** no celular (ou emulador Android/iOS)

## 1. Bancos de dados (MySQL + MongoDB via Docker)

Na raiz do repositório:

```bash
cp .env.example .env      # ajuste as senhas se quiser
docker compose up -d      # sobe o MySQL (3306) e o MongoDB (27017)
docker compose ps         # confere se está "running"
```

Para parar: `docker compose down` (os dados ficam no volume `mysql_data`).
Para apagar tudo e recriar do zero: `docker compose down -v`.

## 2. Backend

```bash
cd backend
cp .env.example .env      # os dados do banco devem bater com o .env da raiz
npm install
npm run db:migrate        # cria/atualiza as tabelas (scripts de database/schema)
npm run dev               # http://localhost:3333/health  → "database":"ok", "mongodb":"ok"
```

> Já tem MySQL instalado na máquina (sem Docker)? Pode usar ele: rode uma vez, como root,
> o script `database/setup-local.sql` (cria o banco `marmitaria` e o usuário) e depois
> o `npm run db:migrate`.
>
> MongoDB sem Docker: instale o [MongoDB Community](https://www.mongodb.com/try/download/community)
> (já vem como serviço na porta 27017). Se não quiser usar o Mongo agora, deixe
> `MONGO_URL=` vazio no `backend/.env`: a API funciona, só sem o histórico de acessos.

## 3. Mobile

```bash
cd mobile
cp .env.example .env      # coloque o IP do computador que roda o backend
npm install
npm start                 # escaneie o QR code com o Expo Go
```

## VM (servidor)

Na VM o processo é o mesmo: instalar Docker e Node, clonar o repositório e seguir os
passos acima. Liberar no firewall a porta da API (3333). A porta do MySQL (3306) só deve
ser liberadas (assim como a 27017 do Mongo) se alguém precisar acessar os bancos de fora da VM.

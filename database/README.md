# database

Scripts SQL do banco MySQL, versionados junto com o código.

- `schema/` — scripts de tabelas, views, functions, procedures e triggers, numerados na
  ordem em que devem rodar (`001_...sql`, `002_...sql`). Detalhes em
  [docs/banco-de-dados.md](../docs/banco-de-dados.md).
- `setup-local.sql` — cria o banco e o usuário para quem usa MySQL sem Docker.

O MongoDB não tem scripts: as coleções e índices são criados pelo próprio backend
(ver [docs/banco-nao-relacional.md](../docs/banco-nao-relacional.md)).

## Como aplicar

Com o MySQL rodando e o `backend/.env` configurado:

```bash
cd backend
npm run db:migrate
```

O comando roda, em ordem, só os scripts que ainda não foram aplicados e registra cada um
na tabela `schema_migrations`. Pode rodar quantas vezes quiser.

## Regras

- **Nunca edite um script que já foi aplicado** (alguém da equipe pode já ter rodado). Para
  mudar uma tabela, crie um novo script (`00X_alter_...sql`).
- Procedures, functions e triggers usam `DELIMITER $$ ... DELIMITER ;` e começam com
  `DROP ... IF EXISTS`, assim o mesmo arquivo roda no Workbench e no `db:migrate`.
- Use o próximo número livre. Se dois integrantes criarem o mesmo número ao mesmo tempo,
  quem fizer o merge depois renumera o seu.
- Os IDs são UUID (`CHAR(36)`) gerados pelo backend, e não `AUTO_INCREMENT`: o mesmo id
  identifica o registro no MySQL e a cópia desnormalizada no MongoDB.

O que **não** vai para o repositório: dados reais, dumps e senhas (ficam no `.env`).

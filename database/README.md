# database

Scripts SQL do banco MySQL, versionados junto com o código.

- `schema/` — scripts de criação/alteração de tabelas, numerados na ordem em que devem rodar
  (`001_...sql`, `002_...sql`).

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
- Use o próximo número livre. Se dois integrantes criarem o mesmo número ao mesmo tempo,
  quem fizer o merge depois renumera o seu.
- Os IDs são UUID (`CHAR(36)`) gerados pelo backend, e não `AUTO_INCREMENT`, para manter o
  código independente do banco (facilita uma eventual troca para MongoDB).

O que **não** vai para o repositório: dados reais, dumps e senhas (ficam no `.env`).

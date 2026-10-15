# database

Scripts SQL do banco MySQL, versionados junto com o código.

- `schema/` — scripts de criação/alteração de tabelas, numerados na ordem em que devem rodar
  (`001_...sql`, `002_...sql`). **Nunca edite um script que já foi aplicado**: crie um novo.

O que **não** vai para o repositório: dados reais, dumps de produção e senhas (ficam no `.env`).

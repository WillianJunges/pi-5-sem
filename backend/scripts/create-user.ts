/**
 * Cria um usuário com qualquer perfil (útil para criar a proprietária e motoboys de teste).
 * Uso:
 *   npm run user:create -- --name "Dona Maria" --email maria@email.com --password 123456 --role OWNER
 */
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { db } from '../src/config/database';
import { ROLES, type Role } from '../src/modules/users/user.types';
import { usersRepository } from '../src/modules/users/users.repository';

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string' },
      phone: { type: 'string' },
      role: { type: 'string', default: 'CUSTOMER' },
    },
  });

  const role = values.role?.toUpperCase() as Role;
  if (!values.name || !values.email || !values.password || !ROLES.includes(role)) {
    console.error(
      'Uso: npm run user:create -- --name "Nome" --email email --password senha --role CUSTOMER|OWNER|COURIER',
    );
    process.exit(1);
  }

  const email = values.email.trim().toLowerCase();
  if (await usersRepository.findByEmail(email)) {
    console.error(`Já existe usuário com o e-mail ${email}`);
    process.exit(1);
  }

  const user = await usersRepository.create({
    name: values.name,
    email,
    phone: values.phone ?? null,
    passwordHash: await bcrypt.hash(values.password, 10),
    role,
  });
  console.log(`Usuário criado: ${user.name} <${user.email}> (${user.role}) id=${user.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.end());

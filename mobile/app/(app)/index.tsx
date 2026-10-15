import { Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

const HOME_BY_ROLE = {
  CUSTOMER: '/customer',
  OWNER: '/owner',
  COURIER: '/courier',
} as const;

/** Depois do login, manda cada perfil para a sua área. */
export default function Index() {
  const { user } = useAuth();
  if (!user) return null;
  return <Redirect href={HOME_BY_ROLE[user.role]} />;
}

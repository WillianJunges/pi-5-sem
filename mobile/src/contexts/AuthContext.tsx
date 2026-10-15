import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, onSessionExpired } from '../services/api';
import { authService, type RegisterData, type User } from '../services/auth.service';
import { usersService } from '../services/users.service';

interface AuthContextValue {
  /** Usuário logado, ou null se não houver sessão. */
  user: User | null;
  /** true enquanto verifica se existe sessão salva (abertura do app). */
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(data: RegisterData): Promise<void>;
  signOut(): Promise<void>;
  /** Recarrega o perfil do servidor (ex.: depois de editar dados). */
  reloadUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback(async (next: User | null) => {
    setUserState(next);
    await usersService.setCached(next);
  }, []);

  const signOut = useCallback(async () => {
    await authService.logout();
    await setUser(null);
  }, [setUser]);

  const reloadUser = useCallback(async () => {
    await setUser(await usersService.me());
  }, [setUser]);

  // Abertura do app: usa o perfil salvo e atualiza em segundo plano.
  useEffect(() => {
    (async () => {
      if (await authService.hasSession()) {
        const cached = await usersService.getCached();
        if (cached) {
          setUserState(cached);
          reloadUser().catch((err) => {
            if (err instanceof ApiError && err.status === 401) void setUser(null);
            // Outros erros (sem internet): continua com o perfil salvo.
          });
        } else {
          await reloadUser().catch(() => signOut());
        }
      }
      setLoading(false);
    })();
  }, [reloadUser, setUser, signOut]);

  // Se o refresh token expirar durante o uso, volta para o login.
  useEffect(() => {
    onSessionExpired(() => void setUser(null));
    return () => onSessionExpired(null);
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut,
      reloadUser,
      async signIn(email, password) {
        await setUser(await authService.login(email, password));
      },
      async signUp(data) {
        await setUser(await authService.register(data));
      },
    }),
    [user, loading, signOut, reloadUser, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

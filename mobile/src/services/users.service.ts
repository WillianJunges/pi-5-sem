import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import type { User } from './auth.service';

const CACHED_USER_KEY = 'auth.user';

export const usersService = {
  /** Perfil do usuário logado (GET /users/me). */
  me(): Promise<User> {
    return api<User>('/users/me');
  },

  /** Último perfil carregado, guardado no aparelho para o app abrir mesmo sem internet. */
  async getCached(): Promise<User | null> {
    const json = await SecureStore.getItemAsync(CACHED_USER_KEY);
    return json ? (JSON.parse(json) as User) : null;
  },

  async setCached(user: User | null): Promise<void> {
    if (user) {
      await SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      await SecureStore.deleteItemAsync(CACHED_USER_KEY);
    }
  },
};

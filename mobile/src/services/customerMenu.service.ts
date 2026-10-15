import { api, ApiError } from './api';
import { mockTodayMenu } from './customerMenu.mock';

/**
 * TEMPORÁRIO: enquanto as tabelas e a rota de cardápio (módulo da Proprietária) não
 * existem, o app usa dados de exemplo. Quando GET /menus/today estiver pronto, troque
 * para false e apague customerMenu.mock.ts.
 */
export const USE_MENU_MOCK = true;

export type MenuStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

/** Formato combinado em docs/banco-nao-relacional.md (documento "menus"). */
export interface MenuItem {
  productId: string;
  name: string;
  description: string | null;
  price: number;
  variations: string[];
}

export interface Menu {
  menuId: string;
  /** Data do cardápio no formato AAAA-MM-DD. */
  date: string;
  status: MenuStatus;
  items: MenuItem[];
}

export const customerMenuService = {
  /** Cardápio do dia (GET /menus/today). Devolve null se não houver cardápio hoje. */
  async getToday(): Promise<Menu | null> {
    if (USE_MENU_MOCK) return mockTodayMenu();

    try {
      return await api<Menu>('/menus/today', { auth: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};

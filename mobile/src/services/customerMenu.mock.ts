import { todayISODate } from '../utils/date';
import type { Menu } from './customerMenu.service';

/**
 * TEMPORÁRIO: cardápio de exemplo para testar a tela do Cliente até a rota
 * GET /menus/today existir. Apagar junto com USE_MENU_MOCK.
 */
export async function mockTodayMenu(): Promise<Menu> {
  // simula o tempo de resposta da rede para dar para ver o "carregando"
  await new Promise((resolve) => setTimeout(resolve, 600));

  return {
    menuId: 'mock-menu',
    date: todayISODate(),
    status: 'ACTIVE',
    items: [
      {
        productId: 'mock-1',
        name: 'Marmita Grande',
        description: 'Arroz, feijão, salada e acompanhamento do dia.',
        price: 25,
        variations: ['Frango grelhado', 'Carne de panela', 'Linguiça'],
      },
      {
        productId: 'mock-2',
        name: 'Marmita Pequena',
        description: 'Arroz, feijão e acompanhamento do dia.',
        price: 19.9,
        variations: ['Frango grelhado', 'Carne de panela'],
      },
      {
        productId: 'mock-3',
        name: 'Marmita Fitness',
        description: 'Arroz integral, legumes no vapor e proteína grelhada.',
        price: 27.5,
        variations: ['Frango', 'Tilápia'],
      },
      {
        productId: 'mock-4',
        name: 'Refrigerante lata',
        description: null,
        price: 6,
        variations: [],
      },
    ],
  };
}

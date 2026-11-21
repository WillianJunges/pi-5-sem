/** Cores, espaçamentos e formas compartilhados por todas as telas. */
export const colors = {
  /** Laranja da marca (fundos, botões, destaques). */
  brand: '#FF6B35',
  /** Âmbar do final do degradê. */
  brandEnd: '#FFA62B',
  /** Laranja mais escuro: use em textos, preços e links sobre fundo claro (melhor contraste). */
  primary: '#E8541A',
  primaryText: '#FFFFFF',
  /** Fundo laranja bem claro (chips, ícones, contadores). */
  primarySoft: '#FFF1E8',
  /** Amarelo do "Prato do dia". */
  highlight: '#FFC933',
  highlightEnd: '#FFA000',
  highlightText: '#4A2A00',

  background: '#FFF8F3',
  /** Fundo de cards e painéis. */
  surface: '#FFFFFF',
  /** Fundo dos campos de texto. */
  field: '#FFFBF8',
  text: '#1F1410',
  muted: '#8A7A72',
  border: '#F1E5DD',

  danger: '#B91C1C',
  success: '#16A34A',
  successSoft: '#E8F8EE',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

/** Arredondamentos padrão. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/** Sombras suaves (iOS usa shadow*, Android usa elevation). */
export const shadows = {
  card: {
    shadowColor: '#783C1E',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  brand: {
    shadowColor: '#FF6B35',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

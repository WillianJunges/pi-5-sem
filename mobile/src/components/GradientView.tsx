import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface GradientViewProps {
  from: string;
  to: string;
  /** Quantas faixas formam o degradê (mais faixas = transição mais suave). */
  steps?: number;
  style?: StyleProp<ViewStyle>;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * Degradê horizontal feito só com Views (sem biblioteca nativa, então funciona
 * no app de desenvolvimento atual sem gerar o APK de novo).
 * Ocupa todo o espaço do pai: coloque-o como primeiro filho e o conteúdo depois.
 *
 * Cada faixa é posicionada por porcentagem e avança um pouco sobre a seguinte,
 * para não aparecerem linhas finas entre elas (arredondamento de pixels do Android).
 */
export function GradientView({ from, to, steps = 40, style }: GradientViewProps) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = (t: number) =>
    `rgb(${a.map((start, i) => Math.round(start + (b[i] - start) * t)).join(',')})`;
  const slice = 100 / steps;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: mix(0.5) }, style]}
    >
      {Array.from({ length: steps }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${i * slice}%`,
            width: `${slice * 2}%`,
            backgroundColor: mix(i / (steps - 1)),
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
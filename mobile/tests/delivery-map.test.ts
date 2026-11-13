import { describe, expect, it } from 'vitest';
import { createMapHtml, formatDistance, MAP_HTML, mapUpdateScript, straightDistance, validPoint } from '../src/features/tracking/mapHtml';

const fatec = { latitude: -23.085755, longitude: -47.202467 };

describe('mapa da entrega (8b)', () => {
  it('aceita só coordenadas válidas como destino', () => {
    expect(validPoint(fatec)).toBe(true);
    expect(validPoint(null)).toBe(false);
    expect(validPoint({ latitude: Number.NaN, longitude: -47 })).toBe(false);
    expect(validPoint({ latitude: -23 })).toBe(false); // pedido antigo salvo sem coordenadas
    expect(validPoint({ latitude: 91, longitude: 0 })).toBe(false);
  });

  it('calcula a distância em linha reta', () => {
    expect(straightDistance(fatec, fatec)).toBe(0);
    // 0,01° de latitude ≈ 1,11 km
    const d = straightDistance(fatec, { latitude: fatec.latitude + 0.01, longitude: fatec.longitude });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
  });

  it('formata metros e quilômetros', () => {
    expect(formatDistance(3)).toBe('10 m');
    expect(formatDistance(347)).toBe('350 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });

  it('envia o estado como JSON, sem abrir brecha para código', () => {
    const script = mapUpdateScript({ destination: fatec, courier: null });
    expect(script).toContain('"latitude":-23.085755');
    expect(script.trim().endsWith('true;')).toBe(true);
  });

  it('carrega o Leaflet com verificação de integridade', () => {
    expect(MAP_HTML).toContain('leaflet@1.9.4/dist/leaflet.js');
    expect(MAP_HTML).toMatch(/integrity="sha256-/);
  });

  it('inclui a chave codificada na URL das imagens do mapa', () => {
    const html = createMapHtml('teste&outra=1</script>');
    expect(html).toContain('?key=teste%26outra%3D1%3C%2Fscript%3E');
  });
});

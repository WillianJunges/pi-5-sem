import { AppError } from '../../shared/errors/AppError';

/**
 * Serviços de endereço/mapa (gratuitos, sem chave):
 *   ViaCEP  → CEP para rua, bairro, cidade e UF
 *   Photon  → busca por texto (autocomplete) e coordenadas, com dados do OpenStreetMap
 *
 * O app chama sempre o nosso backend, nunca os serviços direto: assim dá para trocar de
 * fornecedor sem atualizar o app, e as coordenadas usadas na taxa de entrega são
 * calculadas aqui (o app não consegue mandar uma localização falsa).
 */

const USER_AGENT = 'marmitaria-tg/1.0 (projeto academico)';
const TIMEOUT_MS = 5000;
/** Retângulo que cobre o Brasil (oeste, sul, leste, norte). */
const BRAZIL_BBOX = '-74,-34,-34,5.3';

export interface CepResult {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
}

export interface AddressSuggestion {
  street: string;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  latitude: number;
  longitude: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const UF_BY_STATE: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

/** "São Paulo" → "sao paulo" (para comparar nomes sem acento/maiúscula). */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function toUf(state: string | undefined): string | null {
  return state ? (UF_BY_STATE[normalize(state)] ?? null) : null;
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError('Serviço de endereços indisponível. Tente novamente.', 502);
  }
  if (!res.ok) throw new AppError('Serviço de endereços indisponível. Tente novamente.', 502);
  return (await res.json()) as T;
}

interface ViaCepResponse {
  erro?: boolean | string;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
}

async function photon(query: string, limit: number): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), bbox: BRAZIL_BBOX });
  const data = await getJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?${params}`);
  return data.features.filter((f) => f.properties.countrycode === 'BR');
}

function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const p = feature.properties;
  // só interessa o que é rua ou casa; cidades, bairros e estabelecimentos ficam de fora
  const street = p.street ?? (p.type === 'street' ? p.name : undefined);
  if (!street) return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    street,
    number: p.housenumber ?? null,
    district: p.locality ?? p.district ?? null,
    city: p.city ?? null,
    state: toUf(p.state),
    cep: p.postcode ? p.postcode.replace(/\D/g, '') || null : null,
    latitude,
    longitude,
  };
}

export const geoService = {
  /** Endereço de um CEP (8 dígitos). Devolve null se o CEP não existir. */
  async lookupCep(cep: string): Promise<CepResult | null> {
    const data = await getJson<ViaCepResponse>(`https://viacep.com.br/ws/${cep}/json/`);
    if (data.erro) return null;
    return {
      cep: data.cep.replace(/\D/g, ''),
      street: data.logradouro,
      district: data.bairro,
      city: data.localidade,
      state: data.uf,
    };
  },

  /** Sugestões de endereço enquanto o cliente digita. */
  async search(query: string): Promise<AddressSuggestion[]> {
    const features = await photon(query, 10);
    const seen = new Set<string>();
    const suggestions: AddressSuggestion[] = [];
    for (const feature of features) {
      const s = toSuggestion(feature);
      if (!s) continue;
      // a mesma rua costuma vir em vários trechos; mostra uma vez por bairro
      const key = normalize(`${s.street}|${s.number ?? ''}|${s.district ?? ''}|${s.city ?? ''}`);
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(s);
    }
    return suggestions.slice(0, 6);
  },

  /**
   * Coordenadas de um endereço, para a taxa de entrega por distância.
   * Prefere o trecho da rua com o mesmo CEP; senão, o primeiro da mesma cidade/UF.
   * Devolve null se não achar (ou se o serviço falhar): o endereço é salvo mesmo assim.
   */
  async geocode(address: { street: string; number: string; city: string; state: string; cep: string }) {
    try {
      const features = await photon(`${address.street} ${address.number}, ${address.city} ${address.state}`, 10);
      // confere cidade E estado: o OpenStreetMap tem cidades com o mesmo nome em estados diferentes
      const sameCity = features.filter(
        (f) =>
          f.properties.city &&
          normalize(f.properties.city) === normalize(address.city) &&
          toUf(f.properties.state) === address.state,
      );
      const sameCep = sameCity.find((f) => f.properties.postcode?.replace(/\D/g, '') === address.cep);
      const best = sameCep ?? sameCity[0];
      if (!best) return null;
      const [longitude, latitude] = best.geometry.coordinates;
      return { latitude, longitude } satisfies Coordinates;
    } catch {
      return null;
    }
  },
};

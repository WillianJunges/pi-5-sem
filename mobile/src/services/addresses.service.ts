import { api } from './api';

export interface Address {
  id: string;
  label: string | null;
  /** Só dígitos: "13334100". */
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface AddressInput {
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

/** Resposta de GET /geo/cep/:cep (ViaCEP). */
export interface CepResult {
  cep: string;
  street: string;
  district: string;
  city: string;
  state: string;
}

/** Item de GET /geo/search (Photon/OpenStreetMap). */
export interface AddressSuggestion {
  street: string;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

/** "13334100" → "13334-100" */
export function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** "Rua Dom Pedro I, 120 - Apto 3" */
export function addressLine(a: Pick<Address, 'street' | 'number' | 'complement'>): string {
  return `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ''}`;
}

export const addressesService = {
  list: () => api<Address[]>('/addresses'),
  get: (id: string) => api<Address>(`/addresses/${id}`),
  create: (data: AddressInput) => api<Address>('/addresses', { method: 'POST', body: data }),
  update: (id: string, data: AddressInput) => api<Address>(`/addresses/${id}`, { method: 'PUT', body: data }),
  setDefault: (id: string) => api<void>(`/addresses/${id}/default`, { method: 'PATCH' }),
  remove: (id: string) => api<void>(`/addresses/${id}`, { method: 'DELETE' }),

  lookupCep: (cep: string) => api<CepResult>(`/geo/cep/${cep.replace(/\D/g, '')}`),
  search: (query: string) => api<AddressSuggestion[]>(`/geo/search?q=${encodeURIComponent(query)}`),
};

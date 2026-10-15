export interface Address {
  id: string;
  userId: string;
  label: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}

/** Campos que o cliente preenche. */
export interface AddressData {
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
}

export interface SaveAddressData extends AddressData {
  latitude: number | null;
  longitude: number | null;
}

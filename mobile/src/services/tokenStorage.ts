import * as SecureStore from 'expo-secure-store';
import { createTokenStorage } from './sessionTokens';
export type { Tokens } from './sessionTokens';

/**
 * Tokens ficam no armazenamento seguro do aparelho
 * (Keychain no iOS / Keystore no Android), nunca em AsyncStorage.
 */
// Após o primeiro desbloqueio, a tarefa de entrega pode autenticar com a tela bloqueada.
// A chave continua no armazenamento seguro deste aparelho e não migra para outro dispositivo.
export const tokenStorage = createTokenStorage({
  getItemAsync: key => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }),
  deleteItemAsync: key => SecureStore.deleteItemAsync(key),
});

import * as SecureStore from 'expo-secure-store';
import { createTokenStorage } from './sessionTokens';
export type { Tokens } from './sessionTokens';

/**
 * Tokens ficam no armazenamento seguro do aparelho
 * (Keychain no iOS / Keystore no Android), nunca em AsyncStorage.
 */
export const tokenStorage = createTokenStorage(SecureStore);

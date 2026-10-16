import { expect } from 'vitest';
import { AppError } from '../../src/shared/errors/AppError';

/** Espera que a promessa falhe com AppError do status informado (e, opcionalmente, mensagem). */
export async function expectAppError(promise: Promise<unknown>, status: number, message?: RegExp | string) {
  const err = await promise.then(
    () => {
      throw new Error(`Esperava AppError ${status}, mas não houve erro`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(status);
  if (message) expect((err as AppError).message).toMatch(message);
}

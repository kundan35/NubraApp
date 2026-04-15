// Result<T, E> monad
// Eliminates try/catch hell. Makes errors explicit in type signatures.
// Domain never throws — always returns Result.

export type Result<T, E = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E };

export const Result = {
  ok: <T>(value: T): Result<T, never> =>
    ({ ok: true, value }),

  err: <E>(error: E): Result<never, E> =>
    ({ ok: false, error }),

  fromPromise: async <T>(
    fn: () => Promise<T>
  ): Promise<Result<T, Error>> => {
    try {
      return Result.ok(await fn());
    } catch (e) {
      return Result.err(
        e instanceof Error ? e : new Error(String(e))
      );
    }
  },

  // Map the value if ok, passthrough if err
  map: <T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => U
  ): Result<U, E> => {
    if (result.ok) return Result.ok(fn(result.value));
    return result;
  },
};

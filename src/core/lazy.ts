/**
 * Work put off until it is asked for. The page opens every game's module at once (it is one file), so a table that
 * a module would work out as it is loaded (an aim found by trying throws, a picture of a stage) is worked out for
 * everybody, whether or not they ever open that game. These keep the same value, made on first use and kept.
 */
/** A value made when first asked for. */
export function once<T>(make: () => T): () => T {
  let made = false,
    value: T;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value;
  };
}
/** `object` with a property `key` that is made when first read (a stage card's picture, drawn when its window opens). */
export function withLazy<O extends object, K extends string, V>(object: O, key: K, make: () => V): O & Record<K, V> {
  const get = once(make);
  return Object.defineProperty(object, key, { get, enumerable: true, configurable: true }) as O & Record<K, V>;
}

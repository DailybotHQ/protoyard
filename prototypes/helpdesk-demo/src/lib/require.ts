/** A blueprint service by entity name; fails loudly if the blueprint lost that entity. */
export function serviceOf<T>(services: Readonly<Record<string, T>>, entity: string): T {
  const service = services[entity];
  if (!service) throw new Error(`The blueprint has no "${entity}" entity.`);
  return service;
}

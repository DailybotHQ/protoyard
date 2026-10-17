import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { ShopDatabase } from '../database/schema.ts';
import { createShopServices, type ShopServices } from '../domain/services.ts';

const KEY = Symbol('shop');

export interface Shop {
  runtime: PrototypeRuntime<ShopDatabase>;
  db: ShopDatabase;
  services: ShopServices;
}

/** Called once in App.svelte; screens read it with `useShop()`. */
export function provideShop(): Shop {
  const runtime = getRuntime() as unknown as PrototypeRuntime<ShopDatabase>;
  const shop: Shop = { runtime, db: runtime.db, services: createShopServices(runtime) };
  setContext(KEY, shop);
  return shop;
}

export function useShop(): Shop {
  const shop = getContext<Shop | undefined>(KEY);
  if (!shop) throw new Error('useShop() must be used inside App.svelte');
  return shop;
}

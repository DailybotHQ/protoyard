import type { CartItem, Product, ShopDatabase } from '../database/schema.ts';

export type CartLine = CartItem & { product: Product; categorySlug: string };

/** The customer's cart joined with live product data (price and stock may change). */
export async function cartLines(db: ShopDatabase, customerId: string): Promise<CartLine[]> {
  if (!customerId) return [];
  const [items, categories] = await Promise.all([
    db.cartItems.where('customerId').equals(customerId).sortBy('addedAt'),
    db.categories.toArray(),
  ]);
  const products = await db.products.bulkGet(items.map((i) => i.productId));
  const slugs = new Map(categories.map((c) => [c.id, c.slug]));
  return items.flatMap((item, index) => {
    const product = products[index];
    return product ? [{ ...item, product, categorySlug: slugs.get(product.categoryId) ?? '' }] : [];
  });
}

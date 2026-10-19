<script lang="ts">
import { Package, ShoppingBag, ShoppingCart, Store, Wrench } from '@lucide/svelte';
import {
  avatarImage,
  can,
  createRouter,
  Link,
  liveQuery,
  Router,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Avatar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { CAPABILITIES, ROLE_LABELS } from './domain/policy.ts';
import { provideShop } from './lib/context.ts';
import Admin from './screens/Admin.svelte';
import Cart from './screens/Cart.svelte';
import Checkout from './screens/Checkout.svelte';
import OrderDetail from './screens/OrderDetail.svelte';
import Orders from './screens/Orders.svelte';
import ProductDetail from './screens/ProductDetail.svelte';
import Shop from './screens/Shop.svelte';

const shop = provideShop();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. */
const router = createRouter(
  [
    { path: '/', component: Shop, title: 'Shop' },
    { path: '/products/:id', component: ProductDetail, title: 'Product' },
    { path: '/cart', component: Cart, title: 'Cart' },
    { path: '/checkout', component: Checkout, title: 'Checkout' },
    { path: '/orders', component: Orders, title: 'Orders' },
    { path: '/orders/:id', component: OrderDetail, title: 'Order' },
    { path: '/admin', component: Admin, title: 'Admin' },
  ],
  { titleSuffix: shop.runtime.manifest.name }
);
onDestroy(() => router.destroy());

const me = $derived(principal.current?.persona.id ?? '');
const cartCount = liveQuery(
  async () =>
    (await shop.db.cartItems.where('customerId').equals(me).toArray()).reduce(
      (sum, line) => sum + line.quantity,
      0
    ),
  { initial: 0, deps: () => me }
);
const navClass =
  'inline-flex min-h-touch items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0';
</script>

<div class="flex min-h-dvh flex-col bg-background">
  <header class="sticky top-0 z-30 border-b border-border bg-background/85 pt-safe backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
      <a href="#/" class="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight">
        <span class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">
          <Store class="size-5" />
        </span>
        <span class="sr-only sm:not-sr-only">{principal.current?.organization?.name ?? 'Storefront'}</span>
      </a>
      <nav aria-label="Main" class="flex items-center gap-0.5 sm:ml-4">
        <Link href="/" {router} exact class={navClass} activeClass="bg-primary/10 font-semibold !text-foreground">
          <ShoppingBag class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Shop</span>
        </Link>
        {#if can(CAPABILITIES.ordersReadOwn)}
          <Link href="/orders" {router} class={navClass} activeClass="bg-primary/10 font-semibold !text-foreground">
            <Package class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Orders</span>
          </Link>
        {/if}
        {#if can(CAPABILITIES.productsManage)}
          <Link href="/admin" {router} class={navClass} activeClass="bg-primary/10 font-semibold !text-foreground">
            <Wrench class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Admin</span>
          </Link>
        {/if}
      </nav>
      <div class="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          href="/cart"
          {router}
          class="relative inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          activeClass="bg-primary text-primary-foreground"
          aria-label={`Cart, ${cartCount.current ?? 0} item${cartCount.current === 1 ? '' : 's'}`}
        >
          <ShoppingCart class="size-5" aria-hidden="true" />
          {#if (cartCount.current ?? 0) > 0}
            <span class="absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground tabular-nums" aria-hidden="true">
              {cartCount.current}
            </span>
          {/if}
        </Link>
        {#if principal.current}
          <div class="hidden min-w-0 text-right md:block">
            <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
            <p class="truncate text-xs text-muted-foreground">{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</p>
          </div>
          <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
        {/if}
      </div>
    </div>
  </header>

  <main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-safe sm:px-6 sm:py-8 lg:px-8">
    <Router {router} />
  </main>

  <footer class="border-t border-border py-6 pb-16 text-center text-xs text-muted-foreground">
    Demo storefront — products, prices and orders are simulated. No real payments are ever taken.
  </footer>
</div>

<script lang="ts">
import { Package, ShoppingBag, ShoppingCart, Store, Wrench } from '@lucide/svelte';
import {
  avatarImage,
  can,
  createRouter,
  liveQuery,
  Router,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Avatar, Badge, Button } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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
const navClass = 'min-h-touch gap-2 px-2.5 sm:min-h-0';
const shopActive = $derived(router.isActive('/', true));
const ordersActive = $derived(router.isActive('/orders'));
const adminActive = $derived(router.isActive('/admin'));
const cartActive = $derived(router.isActive('/cart'));
</script>

<div class="flex min-h-dvh flex-col">
  <Box as="header" surface="default" border="block-end" radius="none" padding="none" class="sticky top-0 z-30 pt-safe">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
      <Button href="#/" variant="ghost" class="h-auto shrink-0 gap-2 px-1">
        <Box surface="muted" radius="lg" padding="none" class="grid size-9 place-items-center" aria-hidden="true">
          <LucideIcon icon={Store} tone="primary" class="size-5" />
        </Box>
        <Text as="span" weight="semibold" class="sr-only sm:not-sr-only">{principal.current?.organization?.name ?? 'Storefront'}</Text>
      </Button>
      <nav aria-label="Main" class="flex items-center gap-0.5 sm:ml-4">
        <Button href="#/" variant={shopActive ? 'secondary' : 'ghost'} size="sm" class={navClass} aria-current={shopActive ? 'page' : undefined}>
          <LucideIcon icon={ShoppingBag} class="size-4" /><span class="max-sm:sr-only">Shop</span>
        </Button>
        {#if can(CAPABILITIES.ordersReadOwn)}
          <Button href="#/orders" variant={ordersActive ? 'secondary' : 'ghost'} size="sm" class={navClass} aria-current={ordersActive ? 'page' : undefined}>
            <LucideIcon icon={Package} class="size-4" /><span class="max-sm:sr-only">Orders</span>
          </Button>
        {/if}
        {#if can(CAPABILITIES.productsManage)}
          <Button href="#/admin" variant={adminActive ? 'secondary' : 'ghost'} size="sm" class={navClass} aria-current={adminActive ? 'page' : undefined}>
            <LucideIcon icon={Wrench} class="size-4" /><span class="max-sm:sr-only">Admin</span>
          </Button>
        {/if}
      </nav>
      <div class="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          href="#/cart"
          variant={cartActive ? 'default' : 'ghost'}
          size="icon"
          class="relative size-11"
          aria-current={cartActive ? 'page' : undefined}
          aria-label={`Cart, ${cartCount.current ?? 0} item${cartCount.current === 1 ? '' : 's'}`}
        >
          <LucideIcon icon={ShoppingCart} class="size-5" />
          {#if (cartCount.current ?? 0) > 0}
            <Badge class="absolute -top-0.5 -right-0.5 min-w-5 justify-center px-1" aria-hidden="true">
              {cartCount.current}
            </Badge>
          {/if}
        </Button>
        {#if principal.current}
          <div class="hidden min-w-0 text-right md:block">
            <Text size="sm" weight="medium" truncate>{principal.current.persona.name}</Text>
            <Text size="xs" tone="muted" truncate>{ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}</Text>
          </div>
          <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
        {/if}
      </div>
    </div>
  </Box>

  <main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-safe sm:px-6 sm:py-8 lg:px-8">
    <Router {router} />
  </main>

  <Box as="footer" border="block-start" radius="none" padding="none" class="py-6 pb-16">
    <Text size="xs" tone="muted" align="center">
      Demo storefront — products, prices and orders are simulated. No real payments are ever taken.
    </Text>
  </Box>
</div>

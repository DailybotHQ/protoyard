import type { DomainEvent, EventApplyContext, TimelineContext } from '@protoyard/core';
import type { Shipment } from '../database/schema.ts';

interface DeliveryPayload {
  shipmentId: string;
  dueAt: string;
}

/** Delivery events are keyed by stable shipment id and ETA, independent of advance window size. */
export async function logisticsTimeline(
  ctx: TimelineContext
): Promise<DomainEvent<DeliveryPayload>[]> {
  const shipments = (await ctx.read('shipments')) as unknown as Shipment[];
  return shipments
    .filter((shipment) => {
      const at = Date.parse(shipment.dueAt);
      return shipment.status === 'in-transit' && at >= ctx.from.getTime() && at <= ctx.to.getTime();
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((shipment) => ({
      id: `shipment-delivered:${shipment.id}:${shipment.dueAt}`,
      type: 'shipment.delivered',
      at: shipment.dueAt,
      source: 'timeline',
      payload: { shipmentId: shipment.id, dueAt: shipment.dueAt },
    }));
}

export async function applyLogisticsEvent(
  event: DomainEvent,
  ctx: EventApplyContext
): Promise<void> {
  if (event.type !== 'shipment.delivered') return;
  const payload = event.payload as DeliveryPayload;
  const shipment = (await ctx.get('shipments', payload.shipmentId)) as unknown as
    | Shipment
    | undefined;
  if (shipment?.status !== 'in-transit' || shipment.dueAt !== payload.dueAt) return;
  await ctx.put('shipments', {
    ...shipment,
    status: 'delivered',
    deliveredAt: event.at,
  });
}

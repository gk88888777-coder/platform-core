// घटनाओं के नाम एक ही जगह: टाइपो से बचाव
export const OrderEvents = {
  CREATED: 'order.created',
  ACCEPTED: 'order.accepted',
  PACKED: 'order.packed',
  OUT_FOR_DELIVERY: 'order.out_for_delivery',
  DELIVERED: 'order.delivered',
  CANCELLED: 'order.cancelled',
} as const;

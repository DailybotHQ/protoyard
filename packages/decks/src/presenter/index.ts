/**
 * `@protoyard/decks/presenter`: the presenter protocol the `@texuli/slides`
 * stage and its presenter window speak (`@texuli/deck/engine`): versioned,
 * closed messages over a same-origin `BroadcastChannel`, validated on
 * receipt. The stage opens and drives the presenter window itself.
 */
export {
  createBroadcastPresenterTransport,
  createMemoryPresenterTransport,
  createPresenterTransport,
  isPresenterMessage,
  PRESENTER_MESSAGE_TYPES,
  PRESENTER_PROTOCOL_VERSION,
  type PresenterMessage,
  type PresenterMessageType,
  type PresenterTransport,
  parsePresenterMessage,
  presenterChannelName,
  presenterMessage,
  sanitizePresenterNamespace as sanitizeNamespace,
} from '@texuli/deck/engine';

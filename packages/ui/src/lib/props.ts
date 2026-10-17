/** Bits triggers add `type="button"`, which is meaningless (and invalid) on anchors. */
export function anchorProps(props: Record<string, unknown>): Record<string, unknown> {
  const { type: _type, ...rest } = props;
  return rest;
}

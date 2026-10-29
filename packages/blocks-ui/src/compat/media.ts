import type { Block } from '@protoyard/blocks';

export function toTexuliMediaBlock(block: Block): unknown {
  if (block.type === 'image' || block.type === 'video') {
    return {
      type: block.type,
      id: block.id,
      tone: block.tone,
      src: block.src,
      alt: 'alt' in block ? block.alt : undefined,
      decorative: 'decorative' in block ? block.decorative : undefined,
      width: block.width,
      height: block.height,
      caption: block.caption,
      credit: 'credit' in block ? block.credit : undefined,
      fit: 'fit' in block ? block.fit : undefined,
      label: 'label' in block ? block.label : undefined,
      poster: 'poster' in block ? block.poster : undefined,
      autoplay: 'autoplay' in block ? block.autoplay : undefined,
      loop: 'loop' in block ? block.loop : undefined,
      muted: 'muted' in block ? block.muted : undefined,
      controls: 'controls' in block ? block.controls : undefined,
    };
  }
  return block;
}

export const TEXULI_MEDIA_TYPES = new Set(['image', 'figure', 'video', 'gallery']);

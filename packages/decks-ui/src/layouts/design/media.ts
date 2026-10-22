/**
 * Image and video blocks for media layouts. Media always goes through the
 * shared blocks (their schemas and renderers own the media policy: local,
 * data: and avatar sources only), so a layout never writes a `src` itself.
 */
interface ImageInput {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

interface VideoInput {
  src: string;
  label?: string;
  width?: number;
  height?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export function imageBlock(image: ImageInput, fit: 'cover' | 'contain' = 'cover') {
  const alt = image.alt.trim();
  return {
    type: 'image',
    src: image.src,
    ...(alt ? { alt } : { decorative: true }),
    width: image.width ?? 1280,
    height: image.height ?? 720,
    fit,
  };
}

export function videoBlock(video: VideoInput, fallbackLabel: string) {
  return {
    type: 'video',
    src: video.src,
    label: video.label ?? fallbackLabel,
    width: video.width ?? 1280,
    height: video.height ?? 720,
    muted: video.muted,
    autoplay: video.autoplay,
    loop: video.loop,
    controls: true,
  };
}

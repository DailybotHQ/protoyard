# Media package entry points

Use these public imports only (no `packages/media/src/...` from apps).

| Need | Import |
| --- | --- |
| Responsive image | `@texuli/media/image` |
| Gallery + lightbox | `@texuli/media/gallery`, `@texuli/media/gallery/lightbox` |
| Video player | `@texuli/media/video` |
| Captions / chapters / transcript | `@texuli/media/captions` |
| Audio + waveform | `@texuli/media/audio` |
| Composition document | `@texuli/media/composition-model` |
| Groups and layer timing | `@texuli/media/composition-v2` |
| Canvas render | `@texuli/media/composition-canvas` (+ `/draw`, `/render`) |
| SVG render | `@texuli/media/composition-svg` |
| Keyframe animation | `@texuli/media/animation`, `@texuli/media/animation/player` |
| Animation timeline editor | `@texuli/media/timeline` (+ `/model`) |
| Export functions | `@texuli/media/export` |
| Export UI control | `@texuli/media/export/ui` |
| Generator slot | `@texuli/media/generator-slot` |
| Image editor | `@texuli/media/image-editor` (+ `/model`, `/render`) |
| URL policy | `@texuli/core/url-policy` (`safeImageSrc`, `safeMediaSrc`, `safeHref`) |
| Class helpers (from media or apps) | `texuli/cx` |

Framework-free models often also re-export from `@texuli/media` root — prefer
the **lazy subpath** that matches the feature so unused UI stays out of the bundle.

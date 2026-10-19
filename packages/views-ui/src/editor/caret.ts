/**
 * Where the caret sits inside a textarea, in px from the textarea's top-left
 * (scroll included), using the mirror-div technique: copy the textarea's text
 * metrics onto a hidden div, put the text before the caret in it, and measure
 * a marker span. Used to anchor the `@`/`#` suggestion list at the caret.
 */
const COPIED = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'tabSize',
  'wordSpacing',
] as const;

export function caretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const property of COPIED) mirror.style[property] = style[property];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  // A zero-width space keeps an empty marker measurable at the line end.
  marker.textContent = textarea.value.slice(position, position + 1) || '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight =
    Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4 || 20;
  const result = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
  };
  mirror.remove();
  return result;
}

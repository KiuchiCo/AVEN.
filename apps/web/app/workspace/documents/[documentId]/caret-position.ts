const mirrored = ['boxSizing', 'width', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize'] as const;

/**
 * Where a character position falls inside a text box, in pixels from the box's top-left corner, found by laying the same text out in
 * an invisible copy of the box and measuring a marker placed at that position. (A text box has no API for this.)
 */
export function caretPosition(field: HTMLTextAreaElement | HTMLInputElement, position: number): { left: number; top: number; height: number } {
  const style = getComputedStyle(field);
  const copy = globalThis.document.createElement('div');
  for (const name of mirrored) copy.style[name] = style[name];
  Object.assign(copy.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: field instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre', overflowWrap: 'break-word', height: 'auto' });
  copy.textContent = field.value.slice(0, position);
  const marker = globalThis.document.createElement('span');
  marker.textContent = field.value.slice(position) || '.'; // gives the marker a size at the very end
  copy.appendChild(marker);
  globalThis.document.body.appendChild(copy);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const result = { left: marker.offsetLeft + parseFloat(style.borderLeftWidth) - field.scrollLeft, top: marker.offsetTop + parseFloat(style.borderTopWidth) - field.scrollTop, height: lineHeight };
  copy.remove();
  return result;
}

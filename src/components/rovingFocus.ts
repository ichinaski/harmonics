// Arrow-key navigation for a row of buttons with one tab stop (roving
// tabindex): the piano keys and the pitch class buttons. Tab enters the row on
// one button, the arrows move between buttons, Home and End jump to the ends,
// and Enter or Space press the focused button as usual.

/**
 * The index to move focus to for a key press, or null when the key isn't a
 * navigation key. Indices may fall outside 0..count-1 at the ends, so callers
 * can scroll (the piano shifts an octave) or clamp.
 */
export function rovingTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return index + 1;
    case 'ArrowLeft':
    case 'ArrowDown':
      return index - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

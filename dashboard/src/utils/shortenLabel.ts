/**
 * Fit a chart axis label into a fixed width. A long run of digits (a WhatsApp id that has no name) keeps both
 * ends, because the tail is what tells two ids apart; any other label keeps its start. Characters are counted,
 * not UTF-16 units, so an emoji at the cut is never split in half.
 */
export function shortenLabel(label: string, max = 16): string {
  const chars = Array.from(label);
  if (chars.length <= max) return label;
  if (/^\d+$/.test(label)) {
    const head = Math.ceil((max - 1) / 2);
    const tail = max - 1 - head;
    return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`;
  }
  return `${chars.slice(0, max - 1).join('')}…`;
}

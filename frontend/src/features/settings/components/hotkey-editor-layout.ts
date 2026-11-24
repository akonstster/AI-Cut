/**
 * How tall the command list may grow. The shortcuts dialog keeps 1vh above and below itself
 * (`max-h-[98vh]`), so everything above the list (header and keyboard preview) is subtracted from
 * that budget; the 50vh cap keeps the dialog compact when the window is tall. A floor keeps the
 * list scrollable on very short windows instead of collapsing it.
 */
export function computeHotkeyListMaxHeight(viewportHeight: number, usedHeight: number): number {
  const budget = viewportHeight * 0.98 - usedHeight
  return Math.max(120, Math.round(Math.min(viewportHeight * 0.5, budget)))
}

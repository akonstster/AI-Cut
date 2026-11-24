/**
 * A press or release of Alt with nothing else held.
 *
 * In a desktop web view that is the window's menu key: the view hands the keyboard to the menu and
 * the editor stops receiving shortcuts until the window is clicked again. AI-Cut only uses Alt in
 * combinations (Alt+1…4, Alt+wheel), so a bare Alt is swallowed before the window sees it.
 */
export function isBareAltPress(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): boolean {
  const isAlt = event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight'
  return isAlt && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

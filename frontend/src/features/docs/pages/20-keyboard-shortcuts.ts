import type { DocPageContent } from '../docs-content'

const page = {
  order: 20,
  slug: 'keyboard-shortcuts',
  title: 'Keyboard Shortcuts',
  description: 'Default shortcuts by group, plus how to search, rebind, and reset them.',
  category: 'Reference',
  sections: [
    {
      title: 'Playback',
      blocks: [
        {
          kind: 'table',
          headers: ['Action', 'Shortcut'],
          rows: [
            ['Play / Pause', '`Space`'],
            ['Shuttle forward / stop / reverse', '`L` / `K` / `J`'],
            ['Previous / Next frame', '`Left` / `Right`'],
            ['Previous / Next snap point', '`Up` / `Down`'],
            ['Go to start / end', '`Home` / `End`'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: '`L` starts forward playback and each further press speeds it up (1×, 2×, 4×); `J` shuttles in reverse the same way and `K` stops. The preview shows the current shuttle speed. While the pointer is over the Source monitor, the same keys drive the source player. These three are fixed transport keys and are not listed in the shortcut editor.',
        },
      ],
    },
    {
      title: 'Editing',
      blocks: [
        {
          kind: 'table',
          headers: ['Action', 'Shortcut'],
          rows: [
            ['Split at playhead', '`Alt+C`'],
            ['Split at cursor', '`Shift+C`'],
            ['Join', '`Shift+J`'],
            [
              'Delete / Ripple delete',
              '`Delete` or `Backspace` / `Ctrl+Delete` (or `Ctrl+Backspace`)',
            ],
            ['Insert freeze frame', '`Shift+F`'],
            ['Link / Unlink clips', '`Ctrl+Alt+L` / `Alt+Shift+L`'],
            ['Toggle linked selection', '`Shift+L`'],
            ['Nudge 1px / 10px', '`Shift+Arrow` / `Ctrl+Shift+Arrow`'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: '**Join** (`Shift+J`) re-merges the parts of a clip that came from one cut. Linked video and audio halves rejoin together, so selecting the parts on either track is enough.',
        },
      ],
    },
    {
      title: 'Tools',
      blocks: [
        {
          kind: 'table',
          headers: ['Tool', 'Shortcut'],
          rows: [
            ['Selection', '`V`'],
            ['Trim edit', '`T`'],
            ['Razor', '`C`'],
            ['Rate stretch', '`R`'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Slip and slide are trim behaviors of the **Trim edit** tool: drag the top strip of a clip to slide it, its body to slip it. Ripple and rolling work the same way — none of them has its own shortcut.',
        },
      ],
    },
    {
      title: 'History, view, and clipboard',
      blocks: [
        {
          kind: 'table',
          headers: ['Action', 'Shortcut'],
          rows: [
            ['Undo / Redo', '`Ctrl+Z` / `Ctrl+Shift+Z`'],
            ['Copy / Cut / Paste', '`Ctrl+C` / `Ctrl+X` / `Ctrl+V`'],
            ['Toggle snap / canvas snap', '`S` / `Shift+S`'],
            ['Toggle preview fullscreen', '``Ctrl+` `` / ``Cmd+` ``'],
            ['Zoom in / out', '`Ctrl+=` / `Ctrl+-`'],
            ['Zoom to fit / 100%', '`\\` / `Shift+\\` (or `Ctrl+0`)'],
            ['Edit / Color / Motion / Canvas workspace', '`Alt+1` / `Alt+2` / `Alt+3` / `Alt+4`'],
          ],
        },
      ],
    },
    {
      title: 'Markers and keyframes',
      blocks: [
        {
          kind: 'table',
          headers: ['Action', 'Shortcut'],
          rows: [
            ['Add / Remove marker', '`M` / `Shift+M`'],
            ['Previous / Next marker', '`[` / `]`'],
            ['Clear keyframes', '`Shift+A`'],
            ['Add keyframe to selected Edit layer', '`K`'],
            ['Keyframe graph / sheet / split view', '`1` / `2` / `3`'],
            ['Previous / Next property keyframe', '`Alt+[` / `Alt+]`'],
            ['Toggle auto-key for active property', '`A`'],
            ['Fit selected keyframes', '`F`'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The keyframe keys (`1`/`2`/`3`, `K`, `Alt+[`/`Alt+]`, `A`, `F`) act while the keyframe editor is hovered or focused; there, `Left`/`Right` step the selection and `Shift+Left`/`Shift+Right` nudge it, and `Delete` removes the selected keyframes. `K` stops playback first when the transport is running.',
        },
      ],
    },
    {
      title: 'Source monitor and project',
      blocks: [
        {
          kind: 'table',
          headers: ['Action', 'Shortcut'],
          rows: [
            ['Mark In / Out', '`I` / `O`'],
            ['Mark In / Out at hovered frame', '`Shift+I` / `Shift+O`'],
            ['Clear In/Out', '`Alt+X`'],
            ['Insert / Overwrite edit', '`,` / `.`'],
            ['Save', '`Ctrl+S`'],
            ['Export', '`Ctrl+Shift+E`'],
            ['Open Scene Browser', '`Ctrl+Shift+F`'],
          ],
        },
      ],
    },
    {
      title: 'Customize shortcuts',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Every binding above is a shipped default. Open the redesigned shortcut editor from the **Keyboard Shortcuts** button (keyboard icon) in the editor toolbar to remap any command to the keys you prefer.',
        },
        {
          kind: 'steps',
          items: [
            'Search commands by name, or filter to the **Custom**, **Conflicts**, or **Unassigned** groups.',
            'Pick a command and press **Record**, then hold your modifiers and press the final key.',
            'If the combo is already in use, the editor flags the conflict — choose **Overwrite** to reassign it, or pick different keys.',
            'Use **Unbind** to clear a binding, or add an alternate binding alongside the primary one.',
          ],
        },
        {
          kind: 'note',
          tone: 'tip',
          text: 'Use **Reset** to restore a single command, or **Reset All** to return every shortcut to its default. You can also **Export** your bindings to a preset file and **Import** it on another machine.',
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page

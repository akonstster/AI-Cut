import type { DocPageContent } from '../docs-content'

const page = {
  order: 7,
  slug: 'editing-tools',
  title: 'Editing Tools',
  description:
    'Selection, razor, trim, rate stretch, and the ripple, rolling, slip and slide trim behaviors.',
  category: 'Core Editing',
  related: ['timeline', 'keyboard-shortcuts', 'properties'],
  sections: [
    {
      title: 'The core tools',
      blocks: [
        {
          kind: 'table',
          headers: ['Tool', 'Key', 'Use'],
          rows: [
            ['Selection', '`V`', 'Select, move, and arrange clips.'],
            ['Trim edit', '`T`', 'Drag a clip edge to change where it starts or ends.'],
            ['Razor', '`C`', 'Cut a clip wherever you click.'],
            ['Rate stretch', '`R`', 'Change duration by changing playback speed.'],
          ],
        },
      ],
    },
    {
      title: 'Slip and slide',
      blocks: [
        {
          kind: 'list',
          items: [
            'Pick the **Trim edit** tool (`T`) and drag the **top strip** of a clip — the row where its name sits — to **slide** it: the clip moves along the track and the cuts beside it follow, so the sequence keeps its length.',
            'Drag the **rest of the clip body** to **slip** it: different source frames play inside the clip, while the clip itself and its neighbors stay where they are.',
            'The pointer turns into a slip or slide cursor over the strip you are about to use, and the clip shows a live preview of the frames while you drag.',
            'Slip and slide work on video, audio and compound clips. They stop at the ends of the source and keep transitions intact.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Slip and slide have no separate tools or shortcuts. They live inside the **Trim edit** tool and depend on where you grab the clip.',
        },
      ],
    },
    {
      title: 'Trim behaviors',
      blocks: [
        {
          kind: 'list',
          items: [
            'A **ripple** trim changes an edit and shifts all later material, so the total duration changes.',
            'A **rolling** trim moves the cut between two neighboring clips, with no change to overall duration.',
            'A **slip** edit changes which source frames appear inside a clip without moving the clip or its neighbors.',
            'A **slide** edit moves a clip along the track while automatically adjusting the neighboring cuts.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Ripple, rolling, slip and slide are behaviors of the **Trim edit** tool, not separate tools with their own shortcut.',
        },
      ],
    },
    {
      title: 'Keep clips in sync',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Linked selection** moves a video clip and its audio together; toggle it with `Shift+L`.',
            'Link clips with `Ctrl+Alt+L` and unlink them with `Alt+Shift+L` when a relationship needs to change.',
            '**Sync lock** on a track keeps timing aligned during ripple-style edits.',
          ],
        },
      ],
    },
    {
      title: 'Structural edits',
      blocks: [
        {
          kind: 'list',
          items: [
            'Insert a **freeze frame** at the playhead with `Shift+F` to hold a single frame.',
            'Group a run of clips into a **compound clip** to reuse or simplify a busy section, or open it as a **sequence** tab to edit it as a standalone timeline.',
            'Use the **Bento layout** dialog to arrange selected visual clips into a structured grid.',
          ],
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page

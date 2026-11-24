import type { DocPageContent } from '../docs-content'
const page = {
  order: 28,
  slug: 'production',
  title: 'Storyboard, Workflow, Elements and MCP',
  description: 'Plan shots, connect generation and reuse project references.',
  category: 'Creative Tools',
  sections: [
    {
      title: 'Generation tasks and history',
      items: [
        'Tasks include image generation and editing, video generation and editing, lip sync, upscale, background removal, music, speech, sound effects, transcription and text. Availability depends on the provider and model.',
        'Read the information tooltip beside each model setting. Seed initializes randomness, and repeatability depends on the model. Duration, geometry and reference limits vary.',
        'History retains results, settings and costs. Takes groups alternative generations and lets you mark a preferred result. Reuse outputs as inputs, place them on the timeline or load their settings.',
        'File sharing uses the system share sheet where supported. Review the chosen output and destination before sending.',
      ],
    },
    {
      title: 'Edit the Workflow graph',
      items: [
        'Add text, media and generation cards. Connect outputs to the required model input. A generation output can feed a compatible downstream generation.',
        'Drop a file onto a media card or choose an existing library item. Supply an HTTPS URL when a video input requires a hosted reference.',
        'Select an edge and use its delete button or Delete/Backspace to disconnect it. Templates add reusable graph sections. Import and export transfer workflows.',
        'New cards appear in the visible area. Pan and zoom to navigate larger graphs. Generation cards report missing inputs and waiting dependencies.',
      ],
    },
    {
      title: '3D blocking and HTML graphics',
      items: [
        'Blocking defines objects, stand-in figures, camera and motion. A scene saved on a shot can be rendered again as frames or video. The local previs shows composition and movement.',
        'Use previs frames as first frame, last frame or reference according to the selected model. Movement guidance from a previs video requires a model that accepts video references. Character photographs go into supported reference inputs through Elements.',
        'HTML/CSS graphics create animated titles and overlays. motion_render renders HTML with CSS animation into a transparent clip. Scripts are unsupported in this renderer.',
      ],
    },
    {
      title: 'Storyboard and previs',
      items: [
        'Review shot prompts, order and duration after importing a script. Keep shot IDs when editing through MCP to preserve links.',
        'A generated storyboard image is a reference. Set first and last frames explicitly for frame-based generation.',
        'The Workflow button opens linked cards. Linked prompts synchronize with the storyboard. Timeline moves and cuts are separate editing operations.',
        'Attach existing project media to shots. Rendering authored 3D scene JSON is local. Creating a scene from a text description can call a paid language model.',
      ],
    },
    {
      title: 'Elements and generation',
      items: [
        'Elements belong to the current project. Add characters, objects or places with images and mention them as @name in prompts.',
        'Element images consume reference capacity. Check the selected model’s supported inputs and the blocking message beside Run.',
        'Connect media to named Workflow inputs such as first frame, last frame or references. OpenRouter video references may require a publicly accessible HTTPS URL.',
        'Choose compatible resolution, aspect and size values. Optional model controls are in additional settings. The editor is free and provider generation is billed to your account.',
      ],
    },
    {
      title: 'MCP',
      items: [
        'Copy the MCP address from Settings → Providers and agent. The default port is 8796. Restart after changing it.',
        'Read model_form for supported fields. Paginate storyboard_get using next_offset. storyboard_set replaces the supplied list, so retain IDs and all shots to keep.',
        'canvas_get reads the workflow. canvas_set replaces it unless add is true. Settings use model_form keys and media edges can target media:<field_key>.',
        'Use elements_list and element_save for references, previs_render for scene output, and timeline_get and timeline_edit for montage operations.',
      ],
    },
  ],
} satisfies DocPageContent
export default page

<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { TextSelection } from '@tiptap/pm/state';
  import StarterKit from '@tiptap/starter-kit';
  import Image from '@tiptap/extension-image';
  import { Placeholder } from '@tiptap/extensions';
  import { Markdown } from '@tiptap/markdown';
  import DragHandle from '@tiptap/extension-drag-handle';
  import BubbleMenu from '@tiptap/extension-bubble-menu';
  import { api, notify } from './client.svelte';
  import { prepareImage } from './resize';
  import { SlashCommand, slashItems } from './slash';
  import { icon } from '../lib/icons';

  let {
    value = $bindable(''),
    ownerId,
    startWithSteps = false,
  }: {
    value: string;
    ownerId: number;
    /** An empty recipe starts as a numbered list: step 1 is ready, no need to know the "/" menu. */
    startWithSteps?: boolean;
  } = $props();

  let element: HTMLDivElement;
  let handle: HTMLDivElement;
  let bubble: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let editor = $state<Editor | null>(null);
  let tick = $state(0);

  async function insertImages(files: File[], pos?: number) {
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      try {
        const photo = await api.upload(await prepareImage(file), 'recipe', ownerId, false);
        const chain = editor!.chain().focus();
        (pos !== undefined ? chain.insertContentAt(pos, { type: 'image', attrs: { src: photo.urls.lg, alt: '' } }) : chain.setImage({ src: photo.urls.lg, alt: '' })).run();
      } catch (e) {
        notify((e as Error).message, 'error');
      }
    }
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
        Image,
        Markdown,
        Placeholder.configure({
          includeChildren: true,
          // Only the current line shows a placeholder, so the selection tells where it is.
          placeholder: ({ editor, node }) => {
            if (node.type.name === 'heading') return 'Titre';
            if (editor.isActive('blockquote')) return 'Une astuce, une variante…';
            if (editor.isActive('listItem')) return 'Décrivez l\'étape… (Entrée pour la suivante)';
            return 'Écrivez ici, ou tapez « / » pour plus de blocs';
          },
        }),
        DragHandle.configure({ render: () => handle }),
        BubbleMenu.configure({ element: bubble, shouldShow: ({ editor, from, to }) => from !== to && !editor.isActive('image') }),
        SlashCommand(slashItems(() => fileInput.click())),
      ],
      content: value,
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'prose block-editor', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Préparation' },
        // Until something is written, a tap anywhere in an empty "steps" editor lands in step 1,
        // not in the empty line after the list.
        handleClick: (view, pos) => {
          const first = view.state.doc.firstChild;
          if (!startWithSteps || view.state.doc.textContent.trim() || first?.type.name !== 'orderedList' || pos < first.nodeSize) return false;
          editor?.commands.setTextSelection(3);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.some((f) => f.type.startsWith('image/'))) return false;
          insertImages(files);
          return true;
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.some((f) => f.type.startsWith('image/'))) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          insertImages(files, pos);
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        value = editor.getMarkdown();
      },
      onTransaction: () => tick++,
    });
    if (startWithSteps && !value.trim()) {
      editor.commands.setContent(
        { type: 'doc', content: [{ type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] },
        { emitUpdate: false },
      );
    }
    return () => editor?.destroy();
  });

  function setLink() {
    const previous = editor!.getAttributes('link').href ?? '';
    const href = prompt('Lien (laisser vide pour retirer)', previous);
    if (href === null) return;
    if (!href) editor!.chain().focus().unsetLink().run();
    else editor!.chain().focus().setLink({ href }).run();
  }

  const active = (name: string, attrs?: Record<string, unknown>) => (tick, editor?.isActive(name, attrs) ?? false);

  /**
   * Block buttons: on an empty line they turn it into that block; on a line with text they add a new one after it,
   * so a tip or a heading never swallows what was just written.
   */
  function insertBlock(kind: 'step' | 'heading' | 'tip') {
    const ed = editor;
    if (!ed) return;
    const from = ed.state.selection.$from;
    const empty = from.parent.textContent.length === 0;
    if (kind === 'step') {
      if (ed.isActive('orderedList') && !empty) {
        ed.chain().focus().setTextSelection(from.end()).splitListItem('listItem').run();
      } else if (empty || ed.isActive('orderedList')) {
        ed.chain().focus().toggleOrderedList().run();
      } else {
        const pos = from.after(1);
        ed.chain()
          .focus()
          .command(({ tr, state }) => {
            tr.insert(pos, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, pos + 1));
            return true;
          })
          .toggleOrderedList()
          .run();
      }
      return;
    }
    if (empty) {
      if (kind === 'heading') ed.chain().focus().toggleHeading({ level: 2 }).run();
      else ed.chain().focus().toggleBlockquote().run();
      return;
    }
    // New empty line after the current top-level block (a whole list counts as one), then turn it into the block.
    const pos = from.after(1);
    ed.chain()
      .focus()
      .command(({ tr, state }) => {
        tr.insert(pos, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        return true;
      })
      .run();
    if (kind === 'heading') ed.chain().focus().setHeading({ level: 2 }).run();
    else ed.chain().focus().toggleBlockquote().run();
  }
</script>

<div class="editor-shell">
  <!-- The usual blocks in one tap: the "/" menu stays for those who know it. -->
  <div class="blocks" role="toolbar" aria-label="Insérer dans la préparation">
    <button type="button" onclick={() => insertBlock('step')}>{@html icon('list-ordered', 18)}<span>Étape</span></button>
    <button type="button" onclick={() => insertBlock('heading')}>{@html icon('heading', 18)}<span>Titre</span></button>
    <button type="button" onclick={() => fileInput.click()}>{@html icon('image', 18)}<span>Photo</span></button>
    <button type="button" onclick={() => insertBlock('tip')}>{@html icon('lightbulb', 18)}<span>Astuce</span></button>
  </div>
  <div bind:this={element}></div>

  <div class="drag-handle" bind:this={handle} title="Glisser pour déplacer le bloc">⋮⋮</div>

  <div class="bubble" bind:this={bubble}>
    <button type="button" class:on={active('bold')} aria-label="Gras" onclick={() => editor?.chain().focus().toggleBold().run()}><b>G</b></button>
    <button type="button" class:on={active('italic')} aria-label="Italique" onclick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
    <button type="button" class:on={active('strike')} aria-label="Barré" onclick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></button>
    <button type="button" class:on={active('heading', { level: 2 })} aria-label="Titre" onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
    <button type="button" class:on={active('link')} onclick={setLink}>Lien</button>
  </div>

  <input type="file" accept="image/*" multiple hidden bind:this={fileInput} onchange={(e) => (insertImages([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ''))} />
</div>

<style>
  .editor-shell {
    position: relative;
  }
  /* Stays in view while writing a long preparation. */
  .blocks {
    position: sticky;
    top: var(--editor-toolbar-top, 0px);
    z-index: 6;
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    overflow-x: auto;
    scrollbar-width: none;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .blocks::-webkit-scrollbar {
    display: none;
  }
  .blocks button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px 0 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }
  .blocks button :global(svg) {
    color: var(--accent);
  }
  .blocks button:active {
    background: var(--surface-2);
  }
  /* Drag to reorder needs a mouse: hidden on touch screens. */
  @media (pointer: coarse) {
    /* The drag-handle plugin sets inline styles on it. */
    .drag-handle {
      display: none !important;
    }
    .editor-shell :global(.block-editor) {
      padding-left: 12px;
    }
  }
  .editor-shell :global(.block-editor) {
    min-height: 320px;
    padding: 8px 8px 8px 36px;
    outline: none;
  }
  .editor-shell :global(.block-editor > *) {
    margin-top: 0.5em;
    margin-bottom: 0.5em;
  }
  .editor-shell :global(.block-editor p.is-empty::before),
  .editor-shell :global(.block-editor h2.is-empty::before),
  .editor-shell :global(.block-editor h3.is-empty::before) {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    color: var(--muted);
    opacity: 0.6;
  }
  .editor-shell :global(.block-editor img) {
    max-width: 100%;
    border-radius: 10px;
  }
  .editor-shell :global(.block-editor img.ProseMirror-selectednode) {
    outline: 3px solid var(--accent);
  }
  .editor-shell :global(.block-editor a) {
    color: var(--accent);
  }
  .drag-handle {
    display: grid;
    place-items: center;
    width: 22px;
    height: 24px;
    border-radius: 6px;
    color: var(--muted);
    font-size: 12px;
    letter-spacing: -3px;
    cursor: grab;
    user-select: none;
  }
  .drag-handle:hover {
    background: var(--surface-2);
  }
  .bubble {
    /* Hidden until the BubbleMenu plugin positions and reveals it. */
    position: absolute;
    visibility: hidden;
    z-index: 20;
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 10px;
    background: var(--ink);
    box-shadow: var(--shadow);
  }
  .bubble button {
    min-width: 36px;
    height: 36px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--bg);
    cursor: pointer;
  }
  .bubble button.on,
  .bubble button:hover {
    background: color-mix(in srgb, var(--bg) 20%, transparent);
  }
  :global(.slash-menu) {
    position: fixed;
    z-index: 200;
    width: 270px;
    max-height: 310px;
    overflow-y: auto;
    padding: 6px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
  }
  :global(.slash-menu button) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }
  :global(.slash-menu button.active) {
    background: var(--surface-2);
  }
  :global(.slash-menu .icon) {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    font-size: 0.85rem;
    font-weight: 700;
  }
  :global(.slash-menu strong),
  :global(.slash-menu small) {
    display: block;
  }
  :global(.slash-menu small) {
    color: var(--muted);
    font-size: 0.78rem;
  }
  :global(.slash-menu p) {
    margin: 6px 8px;
    color: var(--muted);
  }
</style>

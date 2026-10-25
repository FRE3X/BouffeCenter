<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Image from '@tiptap/extension-image';
  import { Placeholder } from '@tiptap/extensions';
  import { Markdown } from '@tiptap/markdown';
  import DragHandle from '@tiptap/extension-drag-handle';
  import BubbleMenu from '@tiptap/extension-bubble-menu';
  import { api, notify } from './client.svelte';
  import { prepareImage } from './resize';
  import { SlashCommand, slashItems } from './slash';

  let {
    value = $bindable(''),
    ownerId,
  }: { value: string; ownerId: number } = $props();

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
          placeholder: ({ node }) => (node.type.name === 'heading' ? 'Titre' : 'Tape « / » pour insérer un bloc…'),
        }),
        DragHandle.configure({ render: () => handle }),
        BubbleMenu.configure({ element: bubble, shouldShow: ({ editor, from, to }) => from !== to && !editor.isActive('image') }),
        SlashCommand(slashItems(() => fileInput.click())),
      ],
      content: value,
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'prose block-editor' },
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
</script>

<div class="editor-shell">
  <div bind:this={element}></div>

  <div class="drag-handle" bind:this={handle} title="Glisser pour déplacer le bloc">⋮⋮</div>

  <div class="bubble" bind:this={bubble}>
    <button type="button" class:on={active('bold')} onclick={() => editor?.chain().focus().toggleBold().run()}><b>G</b></button>
    <button type="button" class:on={active('italic')} onclick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
    <button type="button" class:on={active('strike')} onclick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></button>
    <button type="button" class:on={active('heading', { level: 2 })} onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
    <button type="button" class:on={active('link')} onclick={setLink}>Lien</button>
  </div>

  <input type="file" accept="image/*" multiple hidden bind:this={fileInput} onchange={(e) => (insertImages([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ''))} />
</div>

<style>
  .editor-shell {
    position: relative;
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
    min-width: 30px;
    height: 30px;
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

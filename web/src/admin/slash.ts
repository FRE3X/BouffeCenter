import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';

export type SlashItem = {
  title: string;
  hint: string;
  icon: string;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
};

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function slashItems(onImage: () => void): SlashItem[] {
  return [
    { title: 'Texte', hint: 'Paragraphe simple', icon: '¶', keywords: 'texte paragraphe text', run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
    { title: 'Titre', hint: 'Grand titre de section', icon: 'H2', keywords: 'titre heading h2', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
    { title: 'Sous-titre', hint: 'Titre plus petit', icon: 'H3', keywords: 'sous titre heading h3', run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
    { title: 'Étapes', hint: 'Liste numérotée', icon: '1.', keywords: 'etapes liste numerotee ordered steps', run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
    { title: 'Liste à puces', hint: 'Liste simple', icon: '•', keywords: 'liste puces bullet', run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
    { title: 'Image', hint: 'Importer une photo', icon: '▣', keywords: 'image photo upload', run: (e, r) => (e.chain().focus().deleteRange(r).run(), onImage()) },
    { title: 'Astuce', hint: 'Citation / encadré', icon: '❝', keywords: 'astuce citation quote conseil note', run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  ];
}

/** Notion-like "/" menu: type "/" then filter blocks by name. */
export function SlashCommand(items: SlashItem[]) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => {
            const q = normalize(query);
            return items.filter((i) => normalize(`${i.title} ${i.keywords}`).includes(q));
          },
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let el: HTMLDivElement;
            let selected = 0;
            let current: SuggestionProps<SlashItem, SlashItem>;

            const draw = () => {
              el.innerHTML = current.items.length
                ? current.items
                    .map(
                      (item, i) =>
                        `<button type="button" data-i="${i}" class="${i === selected ? 'active' : ''}"><span class="icon">${item.icon}</span><span><strong>${item.title}</strong><small>${item.hint}</small></span></button>`,
                    )
                    .join('')
                : '<p>Aucun bloc</p>';
              const rect = current.clientRect?.();
              if (rect) {
                const below = rect.bottom + 320 < innerHeight;
                el.style.left = `${Math.min(rect.left, innerWidth - 280)}px`;
                el.style.top = below ? `${rect.bottom + 6}px` : '';
                el.style.bottom = below ? '' : `${innerHeight - rect.top + 6}px`;
              }
              el.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
            };

            return {
              onStart(props) {
                current = props;
                selected = 0;
                el = document.createElement('div');
                el.className = 'slash-menu';
                el.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
                  if (btn) current.command(current.items[Number(btn.dataset.i)]);
                });
                document.body.append(el);
                draw();
              },
              onUpdate(props) {
                current = props;
                selected = Math.min(selected, Math.max(0, props.items.length - 1));
                draw();
              },
              onKeyDown({ event }) {
                if (!current.items.length) return false;
                if (event.key === 'ArrowDown') selected = (selected + 1) % current.items.length;
                else if (event.key === 'ArrowUp') selected = (selected - 1 + current.items.length) % current.items.length;
                else if (event.key === 'Enter') {
                  current.command(current.items[selected]);
                  return true;
                } else return false;
                draw();
                return true;
              },
              onExit() {
                el?.remove();
              },
            };
          },
        }),
      ];
    },
  });
}

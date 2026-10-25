/** True once the page knows the visitor is a member (class set by the inline check in Base.astro). */
export const isMember = () => typeof document !== 'undefined' && document.documentElement.classList.contains('member');

/** Runs `cb` now if the visitor is a member, or as soon as the background session check confirms it. */
export function onMember(cb: () => void) {
  if (isMember()) cb();
  else addEventListener('bc:member', cb, { once: true });
}

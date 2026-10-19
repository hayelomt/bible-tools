/**
 * The shared handout's one script, allowed by its hash (`page.ts`): fits the page as the app does
 * (apps/web/src/export/handout.ts `fitStep`, kept in step by hand), scales the sheet down to a
 * narrow window, and prints. The layouts in turn (passage text, then two columns, then smaller
 * type), then one line left out at each step: notes from the end, then questions, then takeaways.
 */
export const HANDOUT_SCRIPT = `(() => {
  const LAYOUTS = [[1, 1, 11], [0, 1, 11], [0, 2, 11], [0, 2, 10.5], [0, 2, 10], [0, 2, 9.5], [0, 2, 9]];
  const NAMES = { notes: ['note heading', 'note headings'], questions: ['question', 'questions'], takeaways: ['takeaway', 'takeaways'] };
  const box = document.querySelector('.handout-box');
  const frame = document.querySelector('.handout-frame');
  const paper = document.querySelector('.handout-paper');
  const notice = document.querySelector('.tools output');
  const lists = ['notes', 'questions', 'takeaways'].map((name) => {
    const section = box.querySelector('[data-fit="' + name + '"]');
    return { name, section, items: section ? [...section.querySelectorAll('li')] : [] };
  });
  const last = LAYOUTS.length - 1 + lists.reduce((n, l) => n + l.items.length, 0);
  const apply = (step) => {
    const [text, columns, size] = LAYOUTS[Math.min(step, LAYOUTS.length - 1)];
    box.style.fontSize = size + 'pt';
    box.classList.toggle('no-text', !text);
    box.classList.toggle('two-columns', columns === 2);
    let more = Math.max(0, step - (LAYOUTS.length - 1));
    const out = [];
    for (const list of lists) {
      const n = Math.min(more, list.items.length);
      more -= n;
      list.items.forEach((li, i) => { li.hidden = i >= list.items.length - n; });
      if (list.section) list.section.hidden = n > 0 && n === list.items.length;
      if (n > 0) out.push(n + ' ' + NAMES[list.name][n === 1 ? 0 : 1]);
    }
    return out;
  };
  const fit = () => {
    let step = 0;
    let out = apply(0);
    while (box.scrollHeight > box.clientHeight + 1 && step < last) out = apply(++step);
    const list = out.length < 2 ? out.join('') : out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1];
    notice.textContent = out.length ? 'Too long for one page: ' + list + ' left out.' : '';
  };
  const scale = () => {
    const mm = 96 / 25.4;
    const s = Math.min(1, frame.clientWidth / (210 * mm));
    paper.style.setProperty('--sheet-scale', String(s));
    frame.style.height = 278 * mm * s + 'px';
  };
  fit();
  scale();
  document.fonts.ready.then(fit);
  addEventListener('resize', scale);
  document.querySelector('[data-print]').addEventListener('click', () => print());
})();`;

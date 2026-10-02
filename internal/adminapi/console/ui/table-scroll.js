export function syncTableScrollAffordance(scroller) {
  if (!scroller) return;
  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
  const hasOverflow = maxScrollLeft > 1;
  const atStart = !hasOverflow || scroller.scrollLeft <= 1;
  const atEnd = !hasOverflow || scroller.scrollLeft >= maxScrollLeft - 1;
  scroller.dataset.overflowX = String(hasOverflow);
  scroller.dataset.scrollStart = String(atStart);
  scroller.dataset.scrollEnd = String(atEnd);
}

export function syncTableScrollAffordances() {
  document.querySelectorAll('.table-scroll').forEach(syncTableScrollAffordance);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { dropIndex, liveOrder, moveTo } from "@/core/day";

type Drag = { scope: string; id: string; order: string[]; start: string[] };

/**
 * Drag-to-reorder for short lists, by pointer (mouse, touch, pen) or keyboard.
 * Rows carry `data-reorder-id`; the handle gets `handle(...)`. The list shows the
 * live order while dragging and `commit` runs once, on drop.
 * Several lists can share one hook: each is told apart by `scope`.
 *
 * Moves and the drop are heard on the window, not the handle: React moves rows
 * in the page as you drag, which can drop the handle's pointer capture, and a
 * drop that's never heard would leave the list stuck on an old order.
 */
export function useReorder(commit: (scope: string, order: string[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const list = useRef<Element | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });

  const live = drag != null;
  useEffect(() => {
    if (!live) return;
    const move = (e: PointerEvent) =>
      setDrag((d) => {
        if (!d || !list.current) return d;
        const rows = [...list.current.querySelectorAll<HTMLElement>("[data-reorder-id]")].filter((r) => r.dataset.reorderId !== d.id);
        const mids = rows.map((r) => {
          const b = r.getBoundingClientRect();
          return b.top + b.height / 2;
        });
        const next = moveTo(d.order, d.id, dropIndex(mids, e.clientY));
        return next.join() === d.order.join() ? d : { ...d, order: next };
      });
    const end = (drop: boolean) => () =>
      setDrag((d) => {
        // Commit outside the state update, once.
        if (d && drop && d.order.join() !== d.start.join()) queueMicrotask(() => commitRef.current(d.scope, d.order));
        return null;
      });
    const up = end(true), cancel = end(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", cancel);
    };
  }, [live]);

  const order = (scope: string, ids: string[]) => (drag?.scope === scope ? liveOrder(drag.order, ids) : ids);

  const handle = (scope: string, id: string, ids: string[], label: string) => ({
    "aria-label": `Move ${label}. Use the up and down arrow keys.`,
    title: "Drag to reorder",
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      list.current = e.currentTarget.closest("[data-reorder]");
      setDrag({ scope, id, order: ids, start: ids });
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      const i = ids.indexOf(id);
      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
      if (to < 0 || to >= ids.length) return;
      e.preventDefault();
      commit(scope, moveTo(ids, id, to));
      // Keep focus on the handle after the list re-renders.
      const el = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => el.isConnected && el.focus());
    },
  });

  return { order, handle, dragging: drag ? `${drag.scope}:${drag.id}` : null };
}

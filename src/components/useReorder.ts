"use client";

import { useState } from "react";
import { dropIndex, moveTo } from "@/core/day";

type Drag = { scope: string; id: string; order: string[]; start: string[] };

/**
 * Drag-to-reorder for short lists, by pointer (mouse, touch, pen) or keyboard.
 * Rows carry `data-reorder-id`; the handle gets `handle(...)`. The list shows the
 * live order while dragging and `commit` runs once, on drop.
 * Several lists can share one hook: each is told apart by `scope`.
 */
export function useReorder(commit: (scope: string, order: string[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);

  const order = (scope: string, ids: string[]) => (drag?.scope === scope ? drag.order : ids);

  const handle = (scope: string, id: string, ids: string[], label: string) => ({
    "aria-label": `Move ${label}. Use the up and down arrow keys.`,
    title: "Drag to reorder",
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ scope, id, order: ids, start: ids });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!drag || drag.scope !== scope || drag.id !== id) return;
      const list = e.currentTarget.closest("[data-reorder]");
      if (!list) return;
      const rows = [...list.querySelectorAll<HTMLElement>("[data-reorder-id]")].filter((r) => r.dataset.reorderId !== id);
      const mids = rows.map((r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2;
      });
      const next = moveTo(drag.order, id, dropIndex(mids, e.clientY));
      if (next.join() !== drag.order.join()) setDrag({ ...drag, order: next });
    },
    onPointerUp: () => {
      if (drag && drag.scope === scope && drag.order.join() !== drag.start.join()) commit(scope, drag.order);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
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

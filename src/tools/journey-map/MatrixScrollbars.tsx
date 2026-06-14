import { useEffect, useLayoutEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

type MatrixScrollbarsProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentVersion: string;
};

type ScrollMetrics = {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
};

type DragState = {
  axis: "x" | "y";
  pointerStart: number;
  scrollStart: number;
} | null;

const EMPTY_METRICS: ScrollMetrics = {
  scrollLeft: 0,
  scrollTop: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollWidth: 0,
  scrollHeight: 0,
};

function readMetrics(node: HTMLDivElement | null): ScrollMetrics {
  if (!node) return EMPTY_METRICS;
  return {
    scrollLeft: node.scrollLeft,
    scrollTop: node.scrollTop,
    clientWidth: node.clientWidth,
    clientHeight: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
  };
}

export function MatrixScrollbars({
  scrollRef,
  contentVersion,
}: MatrixScrollbarsProps) {
  const [metrics, setMetrics] = useState<ScrollMetrics>(EMPTY_METRICS);
  const [dragState, setDragState] = useState<DragState>(null);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const sync = () => setMetrics(readMetrics(node));
    sync();

    node.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => sync());

    resizeObserver?.observe(node);
    if (node.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(node.firstElementChild);
    }

    return () => {
      node.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      resizeObserver?.disconnect();
    };
  }, [scrollRef, contentVersion]);

  useEffect(() => {
    if (!dragState) return;

    const node = scrollRef.current;
    if (!node) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (dragState.axis === "x") {
        const maxTravel = Math.max(1, metrics.clientWidth);
        const deltaRatio = (event.clientX - dragState.pointerStart) / maxTravel;
        const nextScrollLeft =
          dragState.scrollStart +
          deltaRatio * Math.max(0, metrics.scrollWidth - metrics.clientWidth);
        node.scrollLeft = Math.max(
          0,
          Math.min(
            Math.max(0, metrics.scrollWidth - metrics.clientWidth),
            nextScrollLeft,
          ),
        );
      } else {
        const maxTravel = Math.max(1, metrics.clientHeight);
        const deltaRatio = (event.clientY - dragState.pointerStart) / maxTravel;
        const nextScrollTop =
          dragState.scrollStart +
          deltaRatio * Math.max(0, metrics.scrollHeight - metrics.clientHeight);
        node.scrollTop = Math.max(
          0,
          Math.min(
            Math.max(0, metrics.scrollHeight - metrics.clientHeight),
            nextScrollTop,
          ),
        );
      }

      setMetrics(readMetrics(node));
    };

    const stopDragging = () => setDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragState, metrics, scrollRef]);

  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const hasHorizontalScrollbar = maxScrollLeft > 0;
  const hasVerticalScrollbar = maxScrollTop > 0;

  const horizontalThumbSize = hasHorizontalScrollbar
    ? Math.max(12, (metrics.clientWidth / metrics.scrollWidth) * 100)
    : 100;
  const verticalThumbSize = hasVerticalScrollbar
    ? Math.max(12, (metrics.clientHeight / metrics.scrollHeight) * 100)
    : 100;
  const horizontalThumbOffset = hasHorizontalScrollbar
    ? (metrics.scrollLeft / maxScrollLeft) * (100 - horizontalThumbSize)
    : 0;
  const verticalThumbOffset = hasVerticalScrollbar
    ? (metrics.scrollTop / maxScrollTop) * (100 - verticalThumbSize)
    : 0;

  const beginDrag =
    (axis: "x" | "y") => (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (
        (axis === "x" && !hasHorizontalScrollbar) ||
        (axis === "y" && !hasVerticalScrollbar)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDragState({
        axis,
        pointerStart: axis === "x" ? event.clientX : event.clientY,
        scrollStart: axis === "x" ? metrics.scrollLeft : metrics.scrollTop,
      });
    };

  return (
    <>
      <div
        aria-hidden="true"
        className={`matrix-scrollbar matrix-scrollbar-x ${
          hasHorizontalScrollbar ? "" : "is-disabled"
        } ${dragState?.axis === "x" ? "is-dragging" : ""}`}
      >
        <div className="matrix-scrollbar-track">
          <span
            className="matrix-scrollbar-thumb"
            onPointerDown={beginDrag("x")}
            style={{
              width: `${horizontalThumbSize}%`,
              transform: `translateX(${horizontalThumbOffset}%)`,
            }}
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        className={`matrix-scrollbar matrix-scrollbar-y ${
          hasVerticalScrollbar ? "" : "is-disabled"
        } ${dragState?.axis === "y" ? "is-dragging" : ""}`}
      >
        <div className="matrix-scrollbar-track">
          <span
            className="matrix-scrollbar-thumb"
            onPointerDown={beginDrag("y")}
            style={{
              height: `${verticalThumbSize}%`,
              transform: `translateY(${verticalThumbOffset}%)`,
            }}
          />
        </div>
      </div>
    </>
  );
}

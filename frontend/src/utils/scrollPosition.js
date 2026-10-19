
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_PREFIX = "page-scroll-position:";

function getScrollContainer() {
  return document.querySelector("main");
}

export function saveScrollPosition(path) {
  const container = getScrollContainer();

  if (!container) return;

  sessionStorage.setItem(
    `${STORAGE_PREFIX}${path}`,
    String(container.scrollTop)
  );
}


export function useRestoreScrollPosition(path, ready = true) {
  const location = useLocation();

  useEffect(() => {
    if (!ready || !location.state?.restoreScroll) return;

    const savedPosition = sessionStorage.getItem(
      `${STORAGE_PREFIX}${path}`
    );

    if (savedPosition === null) return;

    const targetPosition = Number(savedPosition);
    let frame;
    let attempts = 0;

    function restore() {
      const container = getScrollContainer();

      if (!container) return;

      const maxScroll =
        container.scrollHeight - container.clientHeight;

      // Wait briefly if the page content has not rendered yet.
      if (maxScroll < targetPosition && attempts < 10) {
        attempts += 1;
        frame = requestAnimationFrame(restore);
        return;
      }

      container.scrollTop = Math.min(targetPosition, maxScroll);
    }

    frame = requestAnimationFrame(restore);

    return () => cancelAnimationFrame(frame);
  }, [
    path,
    location.key,
    location.state?.restoreScroll,
    ready,
  ]);
}

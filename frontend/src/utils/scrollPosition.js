
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

    let firstFrame;
    let secondFrame;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const container = getScrollContainer();

        if (container) {
          container.scrollTop = Number(savedPosition);
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [path, location.key, location.state?.restoreScroll, ready]);
}

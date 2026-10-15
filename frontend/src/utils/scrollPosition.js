
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
    let animationFrame;
    let startTime;

    const duration = 350;

    function animateScroll(timestamp) {
      const container = getScrollContainer();

      if (!container) return;

      if (startTime === undefined) {
        startTime = timestamp;
      }

      const progress = Math.min(
        (timestamp - startTime) / duration,
        1
      );

      // Ease-out cubic: fast at first, then gently slows down.
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      container.scrollTop =
        container.scrollTop +
        (targetPosition - container.scrollTop) * easedProgress;

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animateScroll);
      } else {
        container.scrollTop = targetPosition;
      }
    }

    animationFrame = requestAnimationFrame(animateScroll);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [path, location.key, location.state?.restoreScroll, ready]);
}
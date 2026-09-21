import { useEffect } from "react";

// One active dialog at a time: contain keyboard focus and restore it on close.
export function useDialogFocus() {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    const originalOverflow = document.body.style.overflow;
    const focusables = () =>
      current
        ? Array.from(
            current.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
            ),
          ).filter((e) => e.getClientRects().length > 0)
        : [];
    const update = () => {
      const found =
        Array.from(
          document.querySelectorAll<HTMLElement>('[role="dialog"]'),
        ).at(-1) || null;
      if (found === current) return;
      if (found) {
        previous = document.activeElement as HTMLElement;
        current = found;
        document.body.style.overflow = "hidden";
        (focusables()[0] || current).focus({ preventScroll: true });
      } else {
        current = null;
        document.body.style.overflow = originalOverflow;
        if (previous?.isConnected) previous.focus({ preventScroll: true });
        previous = null;
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        current
          .querySelector<HTMLButtonElement>(
            '[data-dialog-close]:not(:disabled), button[aria-label="Close client details"]:not(:disabled)',
          )
          ?.click();
      }
      if (event.key === "Tab") {
        const items = focusables();
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !current.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !current.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", keydown);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = originalOverflow;
    };
  }, []);
}

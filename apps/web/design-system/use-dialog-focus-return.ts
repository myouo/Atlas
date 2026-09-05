"use client";

import { useRef } from "react";

/** Controlled dialogs may be opened by controls outside a Radix Trigger. */
export function useDialogFocusReturn() {
  const opener = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus() {
      const element = document.activeElement;
      if (element instanceof HTMLElement && !element.closest('[role="dialog"]')) {
        opener.current = element;
      }
    },
    onCloseAutoFocus(event: Event) {
      const element = opener.current;
      if (!element?.isConnected || element.closest("[inert]")) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
    }
  };
}

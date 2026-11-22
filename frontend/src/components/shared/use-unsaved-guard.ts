"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// CR-057: every unsaved-changes warning is the browser's own dialog with one wording, on every form and dialog.
// Refresh / tab close / a typed URL can only show the browser's `beforeunload` dialog (its text is fixed by the
// browser), so in-app navigation and closing a dialog use `window.confirm` to look the same.

import { LEAVE_PAGE_MESSAGE } from "./unsaved-messages";

export { CLOSE_DIALOG_MESSAGE, LEAVE_PAGE_MESSAGE } from "./unsaved-messages";

/** While `active`, refresh / tab close / a typed URL asks with the browser's leave dialog. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [active]);
}

/**
 * A full-page form with unsaved input (`dirty`): in-app links, browser Back, `leave()` / `leaveBack()` ask with
 * `window.confirm`; refresh and tab close ask with the browser's dialog. `onDiscard` runs once the user agrees to
 * leave (e.g. drop a stored draft). Keeps a same-URL history entry while dirty so browser Back can ask first.
 */
export function useUnsavedGuard(dirty: boolean, onDiscard?: () => void) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const discardRef = useRef(onDiscard);
  const guarded = useRef(false);
  const bypass = useRef(false);
  const afterCollapse = useRef<(() => void) | null>(null);
  useEffect(() => { dirtyRef.current = dirty; discardRef.current = onDiscard; });
  useEffect(() => {
    if (dirty && !guarded.current) {
      bypass.current = false;
      window.history.pushState({ ...window.history.state, unsavedGuard: true }, "", window.location.href);
      guarded.current = true;
    }
  }, [dirty]);
  /** True when leaving is fine: nothing to lose, or the user agreed in the browser dialog. */
  function confirmLeave() {
    if (!dirtyRef.current) return true;
    if (!window.confirm(LEAVE_PAGE_MESSAGE)) return false;
    discardRef.current?.();
    return true;
  }
  function navigate(href: string, replace = false) {
    bypass.current = true;
    const go = () => { if (replace) router.replace(href); else router.push(href); };
    if (guarded.current) {
      guarded.current = false; afterCollapse.current = go; window.history.back();
    } else go();
  }
  function leave(href = "/") {
    if (confirmLeave()) navigate(href);
  }
  function leaveBack() {
    if (!confirmLeave()) return;
    const distance = guarded.current ? 2 : 1;
    if (window.history.length <= distance) { navigate("/", true); return; }
    bypass.current = true; guarded.current = false; window.history.go(-distance);
  }
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirtyRef.current && !bypass.current) { event.preventDefault(); event.returnValue = ""; }
    }
    function back(event: PopStateEvent) {
      if (afterCollapse.current) {
        event.stopImmediatePropagation(); const go = afterCollapse.current; afterCollapse.current = null;
        window.setTimeout(go, 0); return;
      }
      if (!guarded.current || bypass.current) return;
      event.stopImmediatePropagation();
      // Back already left the guard entry: put it back, then leave for real only if the user agrees.
      window.history.pushState({ ...window.history.state, unsavedGuard: true }, "", window.location.href);
      if (confirmLeave()) { bypass.current = true; guarded.current = false; window.history.go(-2); }
    }
    function click(event: MouseEvent) {
      if (!dirtyRef.current || bypass.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!confirmLeave()) return;
      bypass.current = true;
      const go = () => router.push(url.pathname + url.search + url.hash);
      if (guarded.current) { guarded.current = false; afterCollapse.current = go; window.history.back(); } else go();
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", back, true);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("popstate", back, true); document.removeEventListener("click", click, true); };
  }, [router]);
  return { leave, leaveBack, finish: (href: string) => navigate(href, true) };
}

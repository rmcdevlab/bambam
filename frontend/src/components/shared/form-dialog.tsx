"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { CLOSE_DIALOG_MESSAGE, useBeforeUnload } from "./use-unsaved-guard";

// CR-057: a dialog that holds a form. Once the user has typed, picked or changed something in it, closing it
// (✕, Esc, click outside, a `DialogClose` ยกเลิก) asks with `window.confirm`, and refresh / tab close asks with the
// browser's dialog. Closing from code (`open` set to false after a save) never asks.
//
// "Changed" = an input/change event from a field, or a click on a choice control (checkbox, switch, radio, option,
// toggle) or on anything marked `data-guard-change` (e.g. remove photo). `data-guard-skip` opts a field out (a
// search box). Events from a nested picker dialog/popover count too: picking a value changes this form.

const CHOICE = '[role="checkbox"],[role="switch"],[role="radio"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[aria-pressed],[data-guard-change]';

type Props = React.ComponentProps<typeof Dialog>;

export function FormDialog({ open, onOpenChange, children, ...props }: Props) {
  const [dirty, setDirty] = React.useState(false);
  // a fresh start each time the dialog opens or closes
  const [seen, setSeen] = React.useState(open);
  if (open !== seen) { setSeen(open); setDirty(false); }
  useBeforeUnload(!!open && dirty);

  function mark(target: EventTarget | null) {
    const el = target instanceof Element ? target : null;
    if (!el || el.closest("[data-guard-skip]") || dirty) return;
    setDirty(true);
  }
  function change(next: boolean) {
    if (!next && dirty && !window.confirm(CLOSE_DIALOG_MESSAGE)) return;
    onOpenChange?.(next);
  }
  const onClick = (event: React.MouseEvent) => {
    const el = event.target instanceof Element ? event.target.closest(CHOICE) : null;
    if (el && !el.closest('[aria-disabled="true"],[data-disabled]')) mark(el);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element && event.target.closest(CHOICE)) mark(event.target);
  };

  return <Dialog open={open} onOpenChange={change} {...props}>
    {/* React events from the portalled content bubble here through the React tree; the box itself takes no layout. */}
    <div className="contents" onInputCapture={(e) => mark(e.target)} onChangeCapture={(e) => mark(e.target)} onClickCapture={onClick} onKeyDownCapture={onKeyDown}>
      {children}
    </div>
  </Dialog>;
}

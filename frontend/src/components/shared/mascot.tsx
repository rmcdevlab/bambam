import { appPath } from "@/lib/app-path";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// BAM snow leopard in the navy / royal-blue techwear suit (D-181). Trimmed WebP exports in public/brand;
// the generated PNG masters live in docs/shared/style/references/mascot-leopard/. The previous white tiger is archived
// in docs/shared/style/references/mascot-tiger-archive/.
const SOURCES = {
  welcome: { src: appPath("/brand/bam-leopard-welcome.webp"), width: 398, height: 560 },
  guide: { src: appPath("/brand/bam-leopard-guide.webp"), width: 378, height: 560 },
  review: { src: appPath("/brand/bam-leopard-review.webp"), width: 373, height: 560 },
  tracking: { src: appPath("/brand/bam-leopard-tracking.webp"), width: 352, height: 560 },
  loading: { src: appPath("/brand/bam-leopard-loading.webp"), width: 363, height: 560 },
  // S01 login (CR-019 follow-up, bam-workplace-login-v7.html): presenting, with the staff badge.
  login: { src: appPath("/brand/bam-leopard-login.webp"), width: 631, height: 640 },
} as const;

export type MascotPose = keyof typeof SOURCES;

type MascotProps = {
  pose?: MascotPose;
  /** Rendered height in px; width follows the image ratio. */
  size?: number;
  className?: string;
  priority?: boolean;
};

/** Decorative BAM mascot (`aria-hidden`). CR-035: always shown on a solid primary surface (`MascotPanel`). */
export function Mascot({ pose = "welcome", size = 120, className, priority }: MascotProps) {
  const s = SOURCES[pose];
  const width = Math.round((s.width / s.height) * size);
  return (
    <span
      aria-hidden="true"
      data-mascot={pose}
      className={cn("mascot-frame pointer-events-none relative inline-block shrink-0 select-none align-middle", className)}
      style={{ width, height: size }}
    >
      <Image
        src={s.src}
        alt=""
        aria-hidden="true"
        width={width}
        height={size}
        priority={priority}
        className="mascot-image relative size-full object-contain"
      />
    </span>
  );
}

type MascotPanelProps = Omit<ComponentProps<"section">, "children" | "ref"> & {
  /** Tag of the panel: `header` for page headings, `section` / `div` elsewhere. */
  as?: "header" | "section" | "div";
  pose?: MascotPose;
  /** Mascot height in px: [phone, sm and up]. */
  size?: [number, number];
  /** Replaces the pose image (settings role mascots). */
  art?: ReactNode;
  priority?: boolean;
  /** Content after the heading block (pickers, actions); wraps under it on narrow screens. */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * CR-035 — the S06 tracking treatment used wherever the mascot appears: the mascot on a solid primary panel,
 * beside white heading copy. Buttons inside flip to the panel (globals.css `.mascot-panel`).
 */
export function MascotPanel({ as: Tag = "section", pose = "welcome", size = [80, 120], art, priority, aside, className, children, ...props }: MascotPanelProps) {
  return (
    <Tag {...props} className={cn("mascot-panel flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-primary px-5 py-5 text-primary-foreground sm:px-7 sm:py-6", className)}>
      <div className="flex min-w-60 flex-1 basis-80 items-center gap-4 sm:gap-6">
        {art ?? <>
          <Mascot pose={pose} size={size[0]} priority={priority} className="sm:hidden" />
          <Mascot pose={pose} size={size[1]} priority={priority} className="hidden sm:inline-block" />
        </>}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {aside && <div className="w-full sm:w-auto">{aside}</div>}
    </Tag>
  );
}

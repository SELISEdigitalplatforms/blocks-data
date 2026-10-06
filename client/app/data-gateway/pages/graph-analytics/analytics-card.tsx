"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The flat, bordered panel chrome Schema and Security already use (a hairline
 * `border-border/40` frame, no drop shadow, a small icon-in-a-tinted-square
 * badge beside a compact semibold title) — the generic `Card` ui-kit these
 * analytics cards used instead was a visibly different style: a heavier
 * `shadow-sm`, a solid default border, and a much larger `text-xl` title.
 */
export function AnalyticsCard({
  icon: Icon,
  title,
  headerRight,
  children,
  className,
  contentClassName,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  /** Rendered at the far right of the header row — a stat, a control, whatever the card needs there. */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-sm border border-border/40 bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {headerRight}
      </div>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </div>
  );
}

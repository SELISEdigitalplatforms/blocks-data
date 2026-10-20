"use client";

import type { ComponentType, ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { TypeChip } from "./type-chip";

/**
 * The chrome every docked panel in the schema shell shares.
 *
 * Access and Validation had a header apiece — same icon slot, same two-line
 * title, same close button, written out twice — and they had already drifted
 * (one declared its own width, the other did not; their borders came from
 * different tokens). One component means a change to panel chrome cannot land
 * on only half of them.
 *
 * Geometry matches the explorer sidebar's header: `min-h-11` and the same 12px
 * inline padding, so the two columns flanking the table line up across the top.
 * The shell takes a primary-tinted border and header background so a docked
 * panel reads as its own surface beside the table.
 */

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  mono = true,
  onClose,
  closeLabel,
  actions,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  /** Second line: plain text, or a composed subject (see `FieldSubject`). */
  subtitle?: ReactNode;
  /** The title is a schema or property name (mono) unless the panel names itself ("Default value"). */
  mono?: boolean;
  onClose: () => void;
  closeLabel: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 shrink-0 items-start gap-2 border-b border-primary/20 bg-primary/10 px-3 py-2.5">
      <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium text-foreground", mono && "font-mono")} title={title}>
          {title}
        </p>
        {subtitle && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {actions}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="dg-interactive inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The panel body. Width is deliberately `w-full` — the animated column in
 * `SchemaDetailsPage` owns it, and a panel that also declares a width ends up
 * a frame out of step with the column resizing around it.
 */
export function PanelShell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-sm border border-primary/40 bg-card",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/**
 * The second header line of a panel about one property: the property's name,
 * its type, and the schema it belongs to — "Quantity · String · on TestSchema".
 */
export function FieldSubject({
  name,
  type,
  isArray,
  schemaName,
}: {
  name: string;
  type?: string;
  isArray?: boolean;
  schemaName?: string;
}) {
  return (
    <>
      <span className="truncate font-mono text-foreground/80">{name}</span>
      {type && <TypeChip type={type} isArray={isArray} className="h-[18px] px-1.5 text-[10.5px]" />}
      {schemaName && <span className="truncate">on {schemaName}</span>}
    </>
  );
}

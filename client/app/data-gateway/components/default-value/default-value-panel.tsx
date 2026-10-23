"use client";

import { Button } from "@/components/ui-kits/button/button";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { handleErrorMessages } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { useSchemaVariableContext, useSetFieldDefault } from "../../hooks/use-configuration";
import { useTransientStatus } from "../../hooks/use-transient-status";
import type { IFieldDefaultValue } from "../../models/data-service";
import {
  canUseExpressions,
  canUseNow,
  checkDefaultDraft,
  defaultFromDraft,
  draftFromDefault,
  draftKind,
  emptyDefaultDraft,
  expressionWording,
  type DefaultDraft,
  type DefaultTarget,
} from "../../utils/default-value.util";
import { AUTH_NAMES } from "../../utils/variable-syntax";
import { StatusSnackbar } from "../primitives";
import {
  CurrentDateTimeCard,
  HINT_CLASS,
  ItemsEditor,
  LABEL_CLASS,
  ModeBadge,
  StatusLine,
  WillStore,
  describeDraftNow,
  expressionGroups,
  type DraftItem,
  type PreviewPiece,
} from "./default-value-fields";

export interface DefaultValuePanelProps {
  /** The property; a nested one by its full dotted path, e.g. Read.Roles. */
  fieldName: string;
  /** The entity the default is stored on (the root entity for nested properties). */
  schemaId: string;
  projectKey: string;
  fieldType: string;
  isArray: boolean;
  enumValues?: string[];
  /** The default as the schema response had it; null when none. */
  initialDefault?: IFieldDefaultValue | null;
}

/** One line under the value box saying what it takes. */
function hintFor(fieldType: string, useNow: boolean): string {
  if (useNow) return "Stored in UTC. Records created together in one bulk insert all get the same date and time.";
  switch (fieldType) {
    case "String":
    case "ID":
      return "Type fixed text, add expressions filled at insert time, or mix them. A missing value becomes empty text.";
    case "DateTime":
      return "Pick a fixed date (UTC), or use Expression to fill in the current date and time when each record is created.";
    case "Enum":
      return "One of the allowed values. Pick it again to clear.";
    case "Boolean":
      return "Pick true or false. Pick it again to clear.";
    default:
      return "Stored exactly as entered.";
  }
}

/** What the box shows before anything is typed. */
function placeholderFor(fieldType: string, fieldName: string): string {
  if (canUseExpressions(fieldType)) return "Type text, or add an expression";
  if (fieldType === "Int") return "e.g. 1";
  if (fieldType === "Float") return "e.g. 0.5";
  return fieldType === "DateTime" ? "" : `Stored when ${fieldName} is omitted`;
}

/** An `HttpError` from the client: its status and the response body (or the body's `errors`). */
const asHttpError = (error: unknown): { status: number; errors: Record<string, unknown> } | null =>
  typeof error === "object" && error !== null && "status" in error && "errors" in error
    ? (error as { status: number; errors: Record<string, unknown> })
    : null;

/** The server's reason for a refusal: the response's message, else its errors. */
function serverMessage(error: unknown): string {
  const http = asHttpError(error);
  if (!http) return "Something went wrong.";
  if (typeof http.errors?.message === "string" && http.errors.message) return expressionWording(http.errors.message);
  const messages = handleErrorMessages(http.errors);
  return expressionWording(Array.isArray(messages) ? messages.join(" ") : messages);
}

/**
 * The draft and the stable keys of its items (rows are added and removed, so their position is no key),
 * with the edits the panel makes. Every edit marks the draft touched and drops a server refusal.
 */
function useDefaultDraft(initialDefault: IFieldDefaultValue | null, nowAllowed: boolean, onEdit: () => void) {
  const counter = useRef(0);
  const newKey = () => `item-${counter.current++}`;
  const [draft, setDraft] = useState<DefaultDraft>(() => {
    const start = draftFromDefault(initialDefault);
    return start.useNow && !nowAllowed ? emptyDefaultDraft() : start;
  });
  // The first rows get fixed keys; rows added later take the counter's, which only event handlers touch.
  const [keys, setKeys] = useState<string[]>(() => draft.items.map((_, i) => `initial-${i}`));

  const edit = (next: DefaultDraft, nextKeys: string[] = keys) => {
    setDraft(next);
    setKeys(nextKeys);
    onEdit();
  };

  return {
    draft,
    keys,
    reset: () => {
      setDraft(emptyDefaultDraft());
      setKeys([newKey()]);
    },
    setUseNow: (useNow: boolean) => edit({ ...emptyDefaultDraft(), useNow }, [newKey()]),
    setDirection: (direction: DefaultDraft["direction"]) => edit({ ...draft, direction }),
    setOffset: (offset: DefaultDraft["offset"]) => edit({ ...draft, offset }),
    setItem: (index: number, text: string) => edit({ ...draft, items: draft.items.map((item, i) => (i === index ? text : item)) }),
    addItem: () => edit({ ...draft, items: [...draft.items, ""] }, [...keys, newKey()]),
    removeItem: (index: number) => {
      const items = draft.items.filter((_, i) => i !== index);
      const rest = keys.filter((_, i) => i !== index);
      edit({ ...draft, items: items.length > 0 ? items : [""] }, rest.length > 0 ? rest : [newKey()]);
    },
  };
}

/** The rows on screen: every item for a list, the first one otherwise. */
function visibleItems(draft: DefaultDraft, keys: string[], isArray: boolean): DraftItem[] {
  const rows = draft.items.map((text, i) => ({ text, key: keys[i] ?? `item-extra-${text}` }));
  return isArray ? rows : rows.slice(0, 1);
}

const VARIABLE_SPLIT = /(\{\{[^}]*\}\})/g;
const IS_VARIABLE = /^\{\{.*\}\}$/;

/** The preview of what an insert would store, from the draft as it stands. */
function previewOf(draft: DefaultDraft, target: DefaultTarget, fieldName: string): { pieces: PreviewPiece[]; caption: string } {
  const text = (t: string): PreviewPiece => ({ text: t, tone: "text" });
  const muted = (t: string): PreviewPiece => ({ text: t, tone: "muted" });
  const kind = draftKind(draft, target);
  if (kind === "Now") {
    const o = defaultFromDraft(draft, target).offset ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const ms = (o.days * 86400 + o.hours * 3600 + o.minutes * 60 + o.seconds) * 1000;
    const when = Number.isFinite(ms) ? `${new Date(Date.now() + ms).toISOString().slice(0, 16).replace("T", " ")} UTC` : "—";
    return { pieces: [text(when)], caption: "for a record created right now" };
  }
  const items = target.isArray ? draft.items.filter((t) => t.trim() !== "") : draft.items.slice(0, 1);
  if (items.every((t) => t.trim() === "")) {
    return { pieces: [muted("—")], caption: `when an insert leaves ${fieldName} out` };
  }
  if (kind === "Template") {
    const pieces: PreviewPiece[] = [];
    items.forEach((item, index) => {
      for (const part of item.split(VARIABLE_SPLIT).filter((p) => p !== "")) {
        pieces.push(IS_VARIABLE.test(part) ? { text: part.slice(2, -2).trim(), tone: "variable" } : text(part));
      }
      if (target.isArray && index < items.length - 1) pieces.push(muted(","));
    });
    return { pieces, caption: "filled in at insert time" };
  }
  const quote = (t: string) => (target.fieldType === "String" ? JSON.stringify(t.trim()) : t.trim());
  const values = items.map((t) => text(quote(t)));
  return {
    pieces: target.isArray ? [muted("["), ...values, muted("]")] : values,
    caption: `when an insert leaves ${fieldName} out`,
  };
}

/**
 * The default value of one property, from one value box: typed fixed text, values filled in when a
 * record is created (added from the box's "{ } Expression" menu), or both mixed; for a date-time,
 * a fixed date or the current date & time. The API kind is worked out on save (see `draftKind`).
 * Shared by the docked inspector and the drawer, like the validation panel.
 */
export function DefaultValuePanel({
  fieldName,
  schemaId,
  projectKey,
  fieldType,
  isArray,
  enumValues = [],
  initialDefault = null,
}: Readonly<DefaultValuePanelProps>) {
  const nowAllowed = canUseNow(fieldType, isArray);
  // What's stored now: the schema response's value, then whatever this panel last saved.
  const [saved, setSaved] = useState<IFieldDefaultValue | null>(initialDefault);
  const [touched, setTouched] = useState(false);
  // A server refusal shows where the syntax errors do, until the draft changes.
  const [serverError, setServerError] = useState<string | null>(null);
  const { status, setSuccess, setError } = useTransientStatus();
  const { mutateAsync: setFieldDefault, isPending } = useSetFieldDefault();
  const variables = useSchemaVariableContext(schemaId, projectKey);
  const editor = useDefaultDraft(initialDefault, nowAllowed, () => {
    setTouched(true);
    setServerError(null);
  });
  const { draft } = editor;

  const target: DefaultTarget = { fieldType, isArray, enumValues, schemaName: variables.schemaName, fields: variables.fields };
  const kind = draftKind(draft, target);
  // Expression references need the schema's fields; until they load only the syntax is checked server-side.
  const draftError = kind === "Template" && !variables.schemaName ? null : checkDefaultDraft(draft, target);
  const shownError = serverError ?? (touched ? draftError : null);
  const payload = draftError ? null : defaultFromDraft(draft, target);
  // An untouched blank box over no saved default is nothing to save, even though "" is a legal text default.
  const isBlank = !draft.useNow && draft.items.every((item) => item.trim() === "");
  const isDirty = !(isBlank && !saved) && JSON.stringify(payload) !== JSON.stringify(saved);
  const preview = previewOf(draft, target, fieldName);
  const groups = expressionGroups({
    fieldType,
    isArray,
    schemaName: variables.schemaName || "Schema",
    fields: variables.fields,
    authNames: AUTH_NAMES,
  });
  const showBadge = canUseExpressions(fieldType) || nowAllowed;

  const save = async (value: IFieldDefaultValue | null) => {
    try {
      const res = await setFieldDefault({ schemaId, fieldName, defaultValue: value, projectKey });
      if (res.isSuccess === false) {
        setServerError(expressionWording(res.message || "The default could not be saved."));
        return;
      }
      setSaved(value);
      setServerError(null);
      setTouched(false);
      if (value === null) editor.reset();
      setSuccess(value === null ? "Default value cleared" : "Default value saved");
    } catch (error) {
      if (asHttpError(error)?.status === 400) setServerError(serverMessage(error));
      else setError([serverMessage(error)]);
    }
  };

  const handleSave = () => {
    setTouched(true);
    if (draftError || !payload) return;
    void save(payload);
  };

  const canSave = isDirty && !(touched && draftError) && !isPending;

  return (
    <>
      <ScrollArea className="relative flex-1 overflow-auto">
        <div className="flex flex-col gap-[18px] p-4">
          <StatusLine saved={saved} fieldName={fieldName} />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className={LABEL_CLASS}>{isArray ? "Values" : "Value"}</span>
              {showBadge && <ModeBadge dynamic={kind !== "Static"} />}
            </div>

            {draft.useNow ? (
              <CurrentDateTimeCard
                direction={draft.direction}
                offset={draft.offset}
                invalid={Boolean(shownError)}
                summary={describeDraftNow(draft.direction, draft.offset)}
                onDirection={editor.setDirection}
                onChange={editor.setOffset}
                onUseFixed={() => editor.setUseNow(false)}
              />
            ) : (
              <ItemsEditor
                items={visibleItems(draft, editor.keys, isArray)}
                isArray={isArray}
                fieldType={fieldType}
                enumValues={enumValues}
                placeholder={placeholderFor(fieldType, fieldName)}
                invalid={Boolean(shownError)}
                groups={groups}
                onChange={editor.setItem}
                onUseNow={() => editor.setUseNow(true)}
                onAdd={editor.addItem}
                onRemove={editor.removeItem}
              />
            )}

            <p className={HINT_CLASS}>{hintFor(fieldType, draft.useNow)}</p>
            {shownError && (
              <p role="alert" className="text-[11.5px] text-rose-500">
                {shownError}
              </p>
            )}
          </div>

          <WillStore pieces={preview.pieces} caption={preview.caption} />

          <p className={HINT_CLASS}>Applied on insert and bulk insert when the property is missing or null, before required and validation checks.</p>
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-card px-4 py-3">
        <StatusSnackbar status={status} />
        <div className="flex items-center gap-2">
          <span className={cn("flex flex-1 items-center gap-1.5 text-[11px]", isDirty ? "text-amber-500" : "text-muted-foreground")}>
            {isDirty && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            {isDirty ? "Unsaved · applies from the next publish" : "Applies from the next publish"}
          </span>
          {saved && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
              onClick={() => void save(null)}
            >
              Clear default
            </Button>
          )}
          <Button type="button" size="sm" disabled={!canSave} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}

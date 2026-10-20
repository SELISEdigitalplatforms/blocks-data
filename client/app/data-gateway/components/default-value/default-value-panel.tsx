"use client";

import { Button } from "@/components/ui-kits/button/button";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { handleErrorMessages } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import { useSchemaVariableContext, useSetFieldDefault } from "../../hooks/use-configuration";
import { useTransientStatus } from "../../hooks/use-transient-status";
import type { DefaultValueKind, IFieldDefaultValue } from "../../models/data-service";
import {
  allowedDefaultKinds,
  checkDefaultDraft,
  defaultFromDraft,
  draftFromDefault,
  emptyDefaultDraft,
  expressionWording,
  formatDefaultSummary,
  type DefaultDraft,
  type DefaultTarget,
} from "../../utils/default-value.util";
import { AUTH_NAMES } from "../../utils/variable-syntax";
import { StatusSnackbar } from "../primitives";
import {
  ExpressionVariables,
  HINT_CLASS,
  ItemsEditor,
  KindPicker,
  LABEL_CLASS,
  OffsetInputs,
  StatusLine,
  WillStore,
  expressionVariables,
  itemsHeading,
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

/** One line under the source picker saying what the chosen kind does. */
function kindHint(kind: DefaultValueKind, fieldType: string): string {
  if (kind === "Template") return "Text built from this record and the signed-in user at insert time. A missing value becomes empty text.";
  if (kind === "Now") return "The time of the insert, UTC, shifted by the offset. Every row of a bulk insert gets the same time.";
  if (fieldType === "DateTime") return "Stored exactly as entered, in UTC. Used only when the insert leaves the property out.";
  return "Stored exactly as entered. Used only when the insert leaves the property out.";
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
function useDefaultDraft(initialDefault: IFieldDefaultValue | null, kinds: DefaultValueKind[], onEdit: () => void) {
  const counter = useRef(0);
  const newKey = () => `item-${counter.current++}`;
  const [draft, setDraft] = useState<DefaultDraft>(() => {
    const start = draftFromDefault(initialDefault);
    return kinds.includes(start.kind) ? start : emptyDefaultDraft(kinds[0]);
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
    reset: (kind: DefaultValueKind) => {
      setDraft(emptyDefaultDraft(kind));
      setKeys([newKey()]);
    },
    setKind: (kind: DefaultValueKind) => edit(emptyDefaultDraft(kind), [newKey()]),
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

/** The rows on screen: none for Now, every item for a list, the first one otherwise. */
function visibleItems(draft: DefaultDraft, keys: string[], isArray: boolean): DraftItem[] {
  if (draft.kind === "Now") return [];
  const rows = draft.items.map((text, i) => ({ text, key: keys[i] ?? `item-extra-${text}` }));
  return isArray ? rows : rows.slice(0, 1);
}

const VARIABLE_SPLIT = /(\{\{[^}]*\}\})/g;
const IS_VARIABLE = /^\{\{.*\}\}$/;

/** The preview of what an insert would store, from the draft as it stands. */
function previewOf(draft: DefaultDraft, payload: IFieldDefaultValue | null, target: DefaultTarget, fieldName: string): { pieces: PreviewPiece[]; caption: string } {
  const text = (t: string): PreviewPiece => ({ text: t, tone: "text" });
  const muted = (t: string): PreviewPiece => ({ text: t, tone: "muted" });
  if (draft.kind === "Now") {
    const now = payload ?? defaultFromDraft(draft, target);
    const o = now.offset ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const ms = (o.days * 86400 + o.hours * 3600 + o.minutes * 60 + o.seconds) * 1000;
    const when = Number.isFinite(ms) ? `${new Date(Date.now() + ms).toISOString().slice(0, 19)}Z` : "—";
    return { pieces: [text(when), muted(formatDefaultSummary(now))], caption: "if inserted right now" };
  }
  const items = target.isArray ? draft.items.filter((t) => t.trim() !== "") : draft.items.slice(0, 1);
  if (items.every((t) => t.trim() === "")) {
    return { pieces: [muted("—")], caption: `when an insert leaves ${fieldName} out` };
  }
  if (draft.kind === "Template") {
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
 * The default value of one property: a fixed value, an expression (the API's "Template"), or Now ± an
 * offset. Used on insert when the property isn't sent. Shared by the docked inspector and the drawer,
 * like the validation panel.
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
  const kinds = allowedDefaultKinds(fieldType, isArray);
  // What's stored now: the schema response's value, then whatever this panel last saved.
  const [saved, setSaved] = useState<IFieldDefaultValue | null>(initialDefault);
  const [touched, setTouched] = useState(false);
  // A server refusal shows where the syntax errors do, until the draft changes.
  const [serverError, setServerError] = useState<string | null>(null);
  // Which expression item the insert chips write into.
  const [activeItem, setActiveItem] = useState(0);
  const [allVariables, setAllVariables] = useState(false);
  const { status, setSuccess, setError } = useTransientStatus();
  const { mutateAsync: setFieldDefault, isPending } = useSetFieldDefault();
  const variables = useSchemaVariableContext(schemaId, projectKey);
  const editor = useDefaultDraft(initialDefault, kinds, () => {
    setTouched(true);
    setServerError(null);
  });
  const { draft } = editor;

  const target: DefaultTarget = { fieldType, isArray, enumValues, schemaName: variables.schemaName, fields: variables.fields };
  // Expression references need the schema's fields; until they load only the syntax is checked server-side.
  const draftError = draft.kind === "Template" && !variables.schemaName ? null : checkDefaultDraft(draft, target);
  const shownError = serverError ?? (touched ? draftError : null);
  const payload = draftError ? null : defaultFromDraft(draft, target);
  // An untouched blank form over no saved default is nothing to save, even though "" is a legal text default.
  const isBlank = draft.kind !== "Now" && draft.items.every((item) => item.trim() === "");
  const isDirty = !(isBlank && !saved) && JSON.stringify(payload) !== JSON.stringify(saved);
  const preview = previewOf(draft, payload, target, fieldName);
  const available = expressionVariables(variables.schemaName || "Schema", variables.fields, AUTH_NAMES, isArray);

  const insertVariable = (variable: string) => {
    const index = Math.min(activeItem, draft.items.length - 1);
    const current = draft.items[index] ?? "";
    const spacer = current && !current.endsWith(" ") ? " " : "";
    editor.setItem(index, `${current}${spacer}${variable}`);
  };

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
      if (value === null) editor.reset(kinds[0]);
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
  const placeholder =
    draft.kind === "Template"
      ? `{{${variables.schemaName || "Schema"}.Name}} {{Auth.Email}}`
      : fieldType === "Int"
        ? "e.g. 1"
        : fieldType === "Float"
          ? "e.g. 0.5"
          : fieldType === "DateTime"
            ? ""
            : `Stored when ${fieldName} is omitted`;

  return (
    <>
      <ScrollArea className="relative flex-1 overflow-auto">
        <div className="flex flex-col gap-[18px] p-4">
          <StatusLine saved={saved} fieldName={fieldName} />

          <div className="flex flex-col gap-2">
            {kinds.length > 1 && <KindPicker kinds={kinds} value={draft.kind} onChange={editor.setKind} />}
            <p className={HINT_CLASS}>{kindHint(draft.kind, fieldType)}</p>
          </div>

          {draft.kind === "Now" ? (
            <OffsetInputs
              direction={draft.direction}
              offset={draft.offset}
              invalid={Boolean(shownError)}
              onDirection={editor.setDirection}
              onChange={editor.setOffset}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className={LABEL_CLASS}>{itemsHeading(isArray, draft.kind)}</span>
                {isArray && <span className="text-[10.5px] text-muted-foreground">one per row, stored as a list</span>}
              </div>
              <ItemsEditor
                items={visibleItems(draft, editor.keys, isArray)}
                isExpression={draft.kind === "Template"}
                isArray={isArray}
                fieldType={fieldType}
                enumValues={enumValues}
                placeholder={placeholder}
                invalid={Boolean(shownError)}
                onChange={editor.setItem}
                onFocusItem={setActiveItem}
                onAdd={() => {
                  editor.addItem();
                  setActiveItem(draft.items.length);
                }}
                onRemove={(index) => {
                  editor.removeItem(index);
                  setActiveItem(0);
                }}
              />
              {(fieldType === "Enum" || fieldType === "Boolean") && draft.kind === "Static" && (
                <p className={HINT_CLASS}>{fieldType === "Enum" ? "One of the allowed values." : "Pick true or false."} Pick it again to clear.</p>
              )}
              {draft.kind === "Template" && (
                <ExpressionVariables
                  record={available.record}
                  auth={available.auth}
                  expanded={allVariables}
                  onToggle={() => setAllVariables((v) => !v)}
                  onInsert={insertVariable}
                />
              )}
            </div>
          )}

          {shownError && (
            <p role="alert" className="-mt-2 text-[11.5px] text-rose-500">
              {shownError}
            </p>
          )}

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

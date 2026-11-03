"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Play, Square } from "lucide-react";
import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { hasItemIdPlaceholder } from "../../rest/path-guard";
import { splitRequestLine } from "../../rest/request-line";
import type { RestMethod } from "../../rest/request-templates";

const METHODS: RestMethod[] = ["GET", "POST", "PATCH", "PUT", "DELETE"];
const ITEM_ID_PLACEHOLDER = "{itemId}";

/** Ctrl+Enter, or Cmd+Enter on a Mac. */
export const isSendShortcut = (event: KeyboardEvent) =>
  event.key === "Enter" && (event.ctrlKey || event.metaKey);

/** Selects the `{itemId}` placeholder so it can be typed over. */
export function selectItemIdPlaceholder(input: HTMLInputElement | null) {
  if (!input) return;
  const at = input.value.indexOf(ITEM_ID_PLACEHOLDER);
  if (at === -1) return;
  input.focus();
  input.setSelectionRange(at, at + ITEM_ID_PLACEHOLDER.length);
}

/** Entity names first; once the first segment names an entity, its item and items routes. */
function pathSuggestions(requestLine: string, entityNames: string[]): string[] {
  const entityPaths = entityNames.map((name) => `/${name}`);
  const first = splitRequestLine(requestLine).path.split("/")[1] ?? "";
  if (!entityNames.includes(first)) return entityPaths;
  return [...entityPaths, `/${first}/item/${ITEM_ID_PLACEHOLDER}`, `/${first}/items`];
}

type RequestBarProps = {
  method: RestMethod;
  onMethodChange: (method: RestMethod) => void;
  requestLine: string;
  onRequestLineChange: (requestLine: string) => void;
  entityNames: string[];
  pathError: string | null;
  isSending: boolean;
  onSend: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function RequestBar({
  method,
  onMethodChange,
  requestLine,
  onRequestLineChange,
  entityNames,
  pathError,
  isSending,
  onSend,
  onCancel,
  inputRef,
}: RequestBarProps) {
  const { t } = useT("data.gateway.schema");
  const listId = useId();
  const errorId = useId();
  const suggestions = useMemo(
    () => pathSuggestions(requestLine, entityNames),
    [requestLine, entityNames],
  );

  const selectFrame = useRef<number | null>(null);

  const cancelSelectFrame = () => {
    if (selectFrame.current !== null) cancelAnimationFrame(selectFrame.current);
    selectFrame.current = null;
  };

  useEffect(() => cancelSelectFrame, []);

  const handleChange = (value: string) => {
    onRequestLineChange(value);
    // Picking an item route from the suggestions leaves the placeholder ready to type over.
    if (hasItemIdPlaceholder(value) && suggestions.includes(value)) {
      cancelSelectFrame();
      selectFrame.current = requestAnimationFrame(() => {
        selectFrame.current = null;
        selectItemIdPlaceholder(inputRef.current);
      });
    }
  };

  return (
    <div className="shrink-0 border-b border-border/40 bg-card/80 px-3 py-2">
      <div className="flex items-center gap-2">
        <Select value={method} onValueChange={(value) => onMethodChange(value as RestMethod)}>
          <SelectTrigger
            aria-label={t("REST_PLAYGROUND.METHOD")}
            className="h-8 w-[6.5rem] shrink-0 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((value) => (
              <SelectItem key={value} value={value} className="font-mono text-xs">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={inputRef}
          aria-label={t("REST_PLAYGROUND.PATH")}
          aria-invalid={pathError !== null}
          aria-describedby={pathError ? errorId : undefined}
          list={listId}
          value={requestLine}
          placeholder={t("REST_PLAYGROUND.PATH_PLACEHOLDER")}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (!isSendShortcut(event)) return;
            event.preventDefault();
            onSend();
          }}
          className={cn(
            "h-8 min-w-0 flex-1 font-mono text-xs",
            pathError && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <datalist id={listId}>
          {suggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        {isSending ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
          >
            <Square className="h-3 w-3" />
            {t("REST_PLAYGROUND.CANCEL")}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onSend}
            title={t("REST_PLAYGROUND.SEND_SHORTCUT")}
            className="h-8 shrink-0 gap-1.5 px-3 text-xs shadow-[0_0_12px_-2px_rgba(99,102,241,0.35)] hover:shadow-[0_0_16px_-2px_rgba(99,102,241,0.5)]"
          >
            <Play className="h-3 w-3" />
            {t("REST_PLAYGROUND.SEND")}
          </Button>
        )}
      </div>
      {pathError && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
          {pathError}
        </p>
      )}
    </div>
  );
}

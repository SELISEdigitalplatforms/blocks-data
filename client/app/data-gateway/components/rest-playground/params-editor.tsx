"use client";

import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { joinRequestLine, splitRequestLine } from "../../rest/request-line";
import type { RestTemplateId } from "../../rest/request-templates";

type Pair = [string, string];

const SUGGESTED_KEYS: Partial<Record<RestTemplateId, string[]>> = {
  list: ["pageNo", "pageSize", "order", "select", "includeTotalCount"],
  getOne: ["select"],
  delete: ["hardDelete"],
};

export const suggestedParamKeys = (id: RestTemplateId | undefined): string[] =>
  (id && SUGGESTED_KEYS[id]) || [];

type ParamsEditorProps = {
  requestLine: string;
  onRequestLineChange: (requestLine: string) => void;
  suggestedKeys: string[];
};

/**
 * Key/value rows kept in sync with the request line's query string. The rows are held here so a row without a name
 * (which the request line drops) stays on screen while it is typed; the request line stays the source of truth.
 */
export function ParamsEditor({ requestLine, onRequestLineChange, suggestedKeys }: ParamsEditorProps) {
  const { t } = useT("data.gateway.schema");
  const { path, query } = splitRequestLine(requestLine);
  const [rows, setRows] = useState<Pair[]>(query);
  // The row to focus once it is on screen; cleared then, so a row that remounts later never takes the focus.
  const focusRow = useRef<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [syncedLine, setSyncedLine] = useState(requestLine);

  // The request line was edited elsewhere: its query replaces the rows, unless they already say the same.
  if (syncedLine !== requestLine) {
    setSyncedLine(requestLine);
    if (joinRequestLine(path, rows) !== joinRequestLine(path, query)) setRows(query);
  }

  const commit = (next: Pair[]) => {
    setRows(next);
    const line = joinRequestLine(path, next);
    if (line !== requestLine) onRequestLineChange(line);
  };

  const addRow = (pair: Pair) => {
    focusRow.current = rows.length;
    commit([...rows, pair]);
  };

  // A new row with a name gets its value focused, one without gets its name.
  useEffect(() => {
    const row = focusRow.current;
    focusRow.current = null;
    if (row === null || row >= rows.length) return;
    inputs.current[row * 2 + (rows[row][0] === "" ? 0 : 1)]?.focus();
  }, [rows]);

  const editRow = (index: number, part: 0 | 1, value: string) =>
    commit(
      rows.map((pair, i): Pair => {
        if (i !== index) return pair;
        return part === 0 ? [value, pair[1]] : [pair[0], value];
      }),
    );

  const present = new Set(rows.map(([key]) => key));
  const missing = suggestedKeys.filter((key) => !present.has(key));

  return (
    <div className="space-y-3 p-4">
      {rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
          {rows.map(([key, value], index) => (
            <div key={index} className="contents">
              <Input
                aria-label={t("REST_PLAYGROUND.PARAM_NAME")}
                placeholder={t("REST_PLAYGROUND.PARAM_NAME_PLACEHOLDER")}
                value={key}
                spellCheck={false}
                ref={(input) => {
                  inputs.current[index * 2] = input;
                }}
                onChange={(event) => editRow(index, 0, event.target.value)}
                className="h-8 font-mono text-xs"
              />
              <Input
                aria-label={t("REST_PLAYGROUND.PARAM_VALUE")}
                placeholder={t("REST_PLAYGROUND.PARAM_VALUE_PLACEHOLDER")}
                value={value}
                spellCheck={false}
                ref={(input) => {
                  inputs.current[index * 2 + 1] = input;
                }}
                onChange={(event) => editRow(index, 1, event.target.value)}
                className="h-8 font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("REST_PLAYGROUND.PARAM_REMOVE")}
                onClick={() => commit(rows.filter((_, i) => i !== index))}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="xxs"
          onClick={() => addRow(["", ""])}
          className="gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t("REST_PLAYGROUND.PARAM_ADD_ROW")}
        </Button>
        {missing.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">{t("REST_PLAYGROUND.PARAMS_SUGGESTED")}</span>
        )}
        {missing.map((key) => (
          <Button
            key={key}
            variant="outline"
            size="xxs"
            aria-label={t("REST_PLAYGROUND.PARAM_ADD", { key })}
            onClick={() => addRow([key, ""])}
            className="px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {key}
          </Button>
        ))}
      </div>
    </div>
  );
}

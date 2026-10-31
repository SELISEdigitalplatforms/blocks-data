import { useCallback, useMemo, useState } from "react";

export type SelectableKind = "file" | "directory";

export interface SelectableItem {
  id: string;
  kind: SelectableKind;
}

interface SelectionState {
  fileIds: Set<string>;
  directoryIds: Set<string>;
}

const emptySelection = (): SelectionState => ({
  fileIds: new Set(),
  directoryIds: new Set(),
});

/**
 * The files and folders ticked on one listing, kept as two id sets because the
 * zip request takes them as two lists.
 *
 * The selection belongs to the listing it was made on: when `resetKey` changes
 * (another folder, another search) it is dropped. That happens during render
 * rather than in an effect, so the stale ids never paint for a frame, and going
 * back to an earlier key does not bring its old selection back.
 */
export function useItemSelection(resetKey: string) {
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [selectionKey, setSelectionKey] = useState(resetKey);

  if (selectionKey !== resetKey) {
    setSelectionKey(resetKey);
    setSelection(emptySelection());
  }

  const toggle = useCallback((id: string, kind: SelectableKind) => {
    setSelection((prev) => {
      const key = kind === "file" ? "fileIds" : "directoryIds";
      const ids = new Set(prev[key]);
      if (ids.has(id)) {
        ids.delete(id);
      } else {
        ids.add(id);
      }
      return { ...prev, [key]: ids };
    });
  }, []);

  const setAll = useCallback((items: SelectableItem[], selected: boolean) => {
    setSelection((prev) => {
      const fileIds = new Set(prev.fileIds);
      const directoryIds = new Set(prev.directoryIds);
      items.forEach(({ id, kind }) => {
        const ids = kind === "file" ? fileIds : directoryIds;
        if (selected) {
          ids.add(id);
        } else {
          ids.delete(id);
        }
      });
      return { fileIds, directoryIds };
    });
  }, []);

  const clear = useCallback(() => setSelection(emptySelection()), []);

  const isSelected = useCallback(
    (id: string) => selection.fileIds.has(id) || selection.directoryIds.has(id),
    [selection],
  );

  return useMemo(
    () => ({
      fileIds: selection.fileIds,
      directoryIds: selection.directoryIds,
      count: selection.fileIds.size + selection.directoryIds.size,
      isSelected,
      toggle,
      setAll,
      clear,
    }),
    [selection, isSelected, toggle, setAll, clear],
  );
}

export type ItemSelection = ReturnType<typeof useItemSelection>;

import { SearchInput } from "@/components/search-input/search-input";
import { Button } from "@/components/ui-kits/button/button";
import { useStoragePath } from "@/hooks/use-scoped-path";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DmsItemList } from "../../components/dms-item-list/dms-item-list";
import { useDmsSearch } from "../../hooks/use-dms";
import { DmsItem, DmsItemType } from "../../models/dms.model";

const FILTERS: { label: string; value: DmsItemType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Directorys", value: "directory" },
  { label: "Files", value: "file" },
];

/**
 * Search across directorys and files.
 *
 * The term lives in the URL so a result set can be linked to and survives a
 * reload. Results are already access-filtered by the server, so anything listed
 * here is something the caller may open; no extra gating is applied on the way
 * in, only on the actions offered.
 */
export function StorageSearch() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const storagePath = useStoragePath();

  const [type, setType] = useState<DmsItemType | "all">("all");
  const query = params.get("q") ?? "";
  const directoryId = params.get("directoryId") ?? undefined;

  const results = useDmsSearch({
    query,
    directoryId,
    type: type === "all" ? undefined : type,
  });

  const items = useMemo(
    () => results.data?.pages.flatMap((page) => page.items) ?? [],
    [results.data],
  );

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value.trim()) {
      next.set("q", value);
    } else {
      next.delete("q");
    }
    setParams(next, { replace: true });
  };

  const openItem = (item: DmsItem) => {
    // A directory opens the browser at that directory; a file opens its parent, since
    // there is no standalone file route to land on.
    const target = item.type === "directory" ? item.itemId : item.parentDirectoryId;
    if (!target) return;
    navigate(`${storagePath}?directoryId=${encodeURIComponent(target)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        value={query}
        onSearch={setQuery}
        placeholder="Search files and directorys"
        isVisible
        setIsVisible={() => undefined}
      />

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={type === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setType(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {query.trim() ? (
        <DmsItemList
          items={items}
          isLoading={results.isLoading}
          hasNextPage={results.hasNextPage}
          isFetchingNextPage={results.isFetchingNextPage}
          onLoadMore={() => results.fetchNextPage()}
          onOpen={openItem}
          emptyMessage={`Nothing matches "${query}".`}
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Type to search across your directorys and files.
        </p>
      )}
    </div>
  );
}

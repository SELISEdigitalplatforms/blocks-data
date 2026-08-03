"use client";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { FilterChangeHandler, FilterToolbar } from "@/components/filter-toolbar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui-kits/breadcrumb/breadcrumb";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { useStoragePath } from "@/hooks/use-scoped-path";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { CreateDmsNewDirectory } from "@/storage/components/create-new-directory-modal/create-dms-new-directory";
import { FilePreviewModal } from "@/storage/components/file-preview-modal";
import { UploadDmsFileModal } from "@/storage/components/upload-dms-file-modal";
import { useDeleteFile, useLazyGetFile } from "@/storage/hooks/use-storage-file";
import { useDeleteDmsDirectory, useDmsChildren, useDmsDirectory } from "@/storage/hooks/use-dms";
import { FileVersionsDrawer } from "@/storage/components/file-versions-drawer/file-versions-drawer";
import { ManageAccessModal } from "@/storage/components/manage-access-modal/manage-access-modal";
import {
  MoveCopyDialog,
  MoveCopyMode,
} from "@/storage/components/move-copy-dialog/move-copy-dialog";
import { RenameDirectoryDialog } from "@/storage/components/rename-directory-dialog";
import {
  DmsFileItem,
  DmsDirectoryItem,
  DmsItem,
  DmsPermissionFlags,
} from "@/storage/models/dms.model";
import { canAddToDirectory, itemActions } from "@/storage/utils/permission-actions";
import { DmsItemType, IDmsFileAndDirectoryInfo } from "@/storage/models/storage.model";
import { useProjectStore } from "@seliseblocks/genesis-os";

import {
  FileText,
  Folder as Directory,
  FolderPlus as DirectoryPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreVertical,
  Music,
  Plus,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useGetStorageConfigurations } from "../../hooks/use-storage-configuration";
import {
  FileGridSkeleton,
  FileListSkeleton,
  DirectoryGridSkeleton,
  DirectoryListSkeleton,
} from "./storage-detail-skeleton";

type FilterValues = {
  search: string;
  lastModified: string;
  fileType: string[];
};

const getFileIcon = (extension: string, size: "sm" | "lg" = "lg") => {
  const sizeClass = size === "sm" ? "h-5 w-5" : "h-10 w-10";
  const ext = extension?.toLowerCase() || "";

  if (ext === ".pdf") {
    return <FileText className={`${sizeClass} text-blue-500`} />;
  } else if ([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"].includes(ext)) {
    return <ImageIcon className={`${sizeClass} text-cyan-500`} />;
  } else if ([".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv"].includes(ext)) {
    return <Video className={`${sizeClass} text-purple-500`} />;
  } else if ([".mp3", ".wav", ".flac", ".aac", ".ogg"].includes(ext)) {
    return <Music className={`${sizeClass} text-blue-400`} />;
  } else if ([".xlsx", ".xls", ".csv"].includes(ext)) {
    return <FileText className={`${sizeClass} text-green-500`} />;
  } else {
    return <FileText className={`${sizeClass} text-gray-500`} />;
  }
};

type BreadcrumbItem = {
  id: string;
  name: string;
};

/**
 * The listing rows the render tree below already expects, plus the per-item
 * permission flags the new endpoints return.
 *
 * The DMS listing is mapped onto the legacy row shape rather than the render
 * tree being rewritten around the new model. The fields it reads are the same
 * eight either way, and a rename sweep across 600 lines of grid and list markup
 * would risk far more than it would clarify. `fileStorageId` becomes the item id
 * because the item id is the storage object key prefix in the new model.
 */
type ListRow = IDmsFileAndDirectoryInfo & { permissions?: DmsPermissionFlags };

const toRow = (item: DmsItem): ListRow => ({
  parentId: item.parentDirectoryId ?? "",
  type: item.type === "directory" ? DmsItemType.Directory : DmsItemType.File,
  name: item.name,
  fileStorageId: item.itemId,
  extension: (item as DmsFileItem).extension ?? "",
  sizeInBytes: String((item as DmsFileItem).sizeInBytes ?? ""),
  version: (item as DmsFileItem).currentVersion ?? 0,
  description: (item as DmsDirectoryItem).description ?? "",
  itemId: item.itemId,
  // Older data can predate LastUpdatedDate. Display its creation date instead of
  // passing an empty timestamp to Date and rendering the Unix-epoch-like 1/1/1.
  lastUpdatedDate: item.lastUpdatedDate ?? item.createdDate ?? "",
  permissions: item.permissions,
});

export function StorageDetail() {
  const navigate = useNavigate();
  const storagePath = useStoragePath();
  const params = new URLSearchParams(window.location.search);
  const storageId = params.get("id") as string;
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleteDirectoryModalOpen, setIsDeleteDirectoryModalOpen] = useState<boolean>(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(null);

  // Derive directory navigation state from URL
  const currentParentId = params.get("directoryId") || "";
  const breadcrumbPath: BreadcrumbItem[] = useMemo(() => {
    const pathParam = params.get("path");
    if (!pathParam) return [];
    try {
      return JSON.parse(decodeURIComponent(pathParam));
    } catch {
      return [];
    }
  }, [params]);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState<FilterValues>({
    search: "",
    lastModified: "",
    fileType: [],
  });
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [accessItem, setAccessItem] = useState<DmsItem | null>(null);
  const [versionsFile, setVersionsFile] = useState<DmsItem | null>(null);
  const [transfer, setTransfer] = useState<{ item: DmsItem; mode: MoveCopyMode } | null>(null);
  const [renameDirectory, setRenameDirectory] = useState<DmsDirectoryItem | null>(null);
  const [isCreateDirectoryModalOpen, setIsCreateDirectoryModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IDmsFileAndDirectoryInfo | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data: configurations, isLoading } = useGetStorageConfigurations();

  // Cursor pagination: pages are followed while the server reports hasMore,
  // and the search term is passed down rather than filtered on the client, so a
  // directory with more items than one page still searches its whole contents.
  const childrenQuery = useDmsChildren(currentParentId || undefined, {
    search: filters.search || undefined,
  });
  const isDmsLoading = childrenQuery.isLoading;

  const { data: currentDirectory } = useDmsDirectory(currentParentId || undefined);
  const { mutateAsync: deleteDirectoryItem, isPending: deleteDirectoryPending } =
    useDeleteDmsDirectory();
  // Files are removed through the file endpoint, not the directory one. Routing a
  // file id at DeleteDirectory would simply not find a directory with that id.
  const { mutateAsync: deleteFile, isPending: deleteFilePending } = useDeleteFile();
  const { fetchFile } = useLazyGetFile();

  const rows = useMemo(
    () => (childrenQuery.data?.pages.flatMap((page) => page.items) ?? []).map(toRow),
    [childrenQuery.data],
  );

  const dmsItemsById = useMemo(() => {
    const map = new Map<string, DmsItem>();
    (childrenQuery.data?.pages.flatMap((page) => page.items) ?? []).forEach((item) =>
      map.set(item.itemId, item),
    );
    return map;
  }, [childrenQuery.data]);

  const totalChildCount = childrenQuery.data?.pages[0]?.totalChildCount ?? 0;
  const canAddHere = canAddToDirectory(currentDirectory ?? undefined);

  const storage = useMemo(() => {
    if (!Array.isArray(configurations)) {
      return undefined;
    }
    return configurations.find((config) => config.itemId === storageId);
  }, [configurations, storageId]);

  // Helper to build URL with directory navigation params
  const buildDirectoryUrl = useCallback((directoryId: string, path: BreadcrumbItem[]) => {
    const params = new URLSearchParams(window.location.search);
    if (directoryId) {
      params.set("directoryId", directoryId);
      params.set("path", encodeURIComponent(JSON.stringify(path)));
    } else {
      params.delete("directoryId");
      params.delete("path");
    }
    return `?${params.toString()}`;
  }, []);

  // Handle directory click - navigate into directory using URL
  const handleDirectoryClick = (directory: IDmsFileAndDirectoryInfo) => {
    const newPath = [...breadcrumbPath, { id: directory.itemId, name: directory.name }];
    navigate(buildDirectoryUrl(directory.itemId, newPath));
  };

  // Handle breadcrumb click - navigate to specific directory level
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Clicked on root (storage name)
      navigate(buildDirectoryUrl("", []));
    } else {
      // Clicked on a directory in the path
      const newPath = breadcrumbPath.slice(0, index + 1);
      navigate(buildDirectoryUrl(newPath[newPath.length - 1].id, newPath));
    }
  };

  // Handle file preview
  const handleFileClick = async (file: IDmsFileAndDirectoryInfo) => {
    setSelectedFile(file);
    setIsPreviewModalOpen(true);
    setIsLoadingPreview(true);
    setFilePreviewUrl(null);

    try {
      const response = await fetchFile({
        itemId: file.fileStorageId,
        projectKey,
        configurationName: storage?.name,
      });

      if (response?.url) {
        setFilePreviewUrl(response.url);
      }
    } catch (error) {
      return showErrorToast({ errors: error });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const onChange: FilterChangeHandler<FilterValues> = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onReset = () => {
    setFilters({
      search: "",
      lastModified: "",
      fileType: [],
    });
  };

  const { directorys, files } = useMemo(() => {
    const directorysData: ListRow[] = [];
    const filesData: ListRow[] = [];

    rows.forEach((item) => {
      if (item.type === DmsItemType.Directory) {
        directorysData.push(item);
      } else {
        filesData.push(item);
      }
    });

    return { directorys: directorysData, files: filesData };
  }, [rows]);

  // The name search is applied server side now, so only the extension filter is
  // still narrowed here. Re-filtering by name locally would hide results the
  // server had already matched on a later page.
  const filteredDirectorys = directorys;

  const filteredFiles = useMemo(() => {
    if (filters.fileType.length === 0) {
      return files;
    }

    return files.filter((file) => {
      const fileType = file?.extension?.toLowerCase() || "";
      return filters.fileType.some((type) => fileType.includes(type));
    });
  }, [files, filters.fileType]);

  // Deleting is a soft delete: the item moves to the trash and can be restored
  // from there. The hooks invalidate both the children and the trash listings.
  const handleDeleteFile = async (id: string) => {
    try {
      const res = await deleteFile({
        fileId: id,
        configurationName: storage?.name,
        projectKey,
      });
      if (res.isSuccess) {
        showSuccessToast({ description: "File Deleted successfully" });
        childrenQuery.refetch();
      } else {
        showErrorToast({ errors: "Something went wrong" });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  // Directorys are soft-deleted: the directory moves to the trash and can be restored
  // from there, so the hook invalidates both the children and trash listings.
  const handleDeleteDirectory = async (id: string) => {
    try {
      await deleteDirectoryItem({ directoryId: id });
      showSuccessToast({ description: "Directory Deleted successfully" });
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  /**
   * The actions offered on one row, gated by the flags the listing returned.
   *
   * Rendered from a single place rather than repeated in each of the four menus
   * (directory and file, grid and list), so a permission rule cannot end up
   * enforced in three of them and forgotten in the fourth.
   */
  const renderRowMenu = (row: ListRow) => {
    const dmsItem = dmsItemsById.get(row.itemId);
    const actions = itemActions(row);
    const isDirectoryRow = row.type === DmsItemType.Directory;
    // Default directories (Cloud/Construct/etc) are seeded system roots: they anchor
    // the tree and shouldn't be moved, renamed or deleted from the UI.
    const isProtected =
      isDirectoryRow && (dmsItem as { isDefault?: boolean } | undefined)?.isDefault === true;

    return (
      <>
        {dmsItem && !isDirectoryRow && actions.canViewVersions && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setVersionsFile(dmsItem);
            }}
            className="cursor-pointer"
          >
            Versions
          </DropdownMenuItem>
        )}
        {dmsItem && actions.canMove && !isProtected && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setTransfer({ item: dmsItem, mode: "move" });
            }}
            className="cursor-pointer"
          >
            Move
          </DropdownMenuItem>
        )}
        {dmsItem && !isDirectoryRow && actions.canCopy && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setTransfer({ item: dmsItem, mode: "copy" });
            }}
            className="cursor-pointer"
          >
            Copy
          </DropdownMenuItem>
        )}
        {dmsItem && actions.canManageAccess && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setAccessItem(dmsItem);
            }}
            className="cursor-pointer"
          >
            Manage access
          </DropdownMenuItem>
        )}
        {dmsItem && isDirectoryRow && actions.canRename && !isProtected && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setRenameDirectory(dmsItem as DmsDirectoryItem);
            }}
            className="cursor-pointer"
          >
            Rename
          </DropdownMenuItem>
        )}
        {actions.canDelete && !isProtected && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              if (isDirectoryRow) {
                setSelectedDirectoryId(row.itemId);
                setIsDeleteDirectoryModalOpen(true);
              } else {
                setSelectedFileId(row.itemId);
                setIsDeleteModalOpen(true);
              }
            }}
            className="cursor-pointer text-red-500"
          >
            Delete
          </DropdownMenuItem>
        )}
      </>
    );
  };

  if (isLoading) {
    return (
      <main className="flex flex-col">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="mt-6 rounded-sm border bg-card p-6">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="mt-4 h-4 w-3/4" />
        </div>
      </main>
    );
  }

  if (!storage) {
    return (
      <main className="flex flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Storage Details</h1>
        </div>
        <div className="mt-6 rounded-sm border bg-card p-6">
          <p className="text-muted-foreground">Storage configuration not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="cursor-pointer"
              onClick={() => navigate(storagePath)}
            >
              <span className="text-foreground hover:text-foreground">Storage</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {breadcrumbPath.length > 0 ? (
              <BreadcrumbLink
                className="cursor-pointer text-foreground hover:text-foreground"
                onClick={() => handleBreadcrumbClick(-1)}
              >
                {storage.storageStrategy}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="text-low-emphasis">
                {storage.storageStrategy}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {breadcrumbPath.map((item, index) => (
            <span key={item.id} className="flex items-center">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {index === breadcrumbPath.length - 1 ? (
                  <BreadcrumbPage className="text-low-emphasis">{item.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer text-foreground hover:text-foreground"
                    onClick={() => handleBreadcrumbClick(index)}
                  >
                    {item.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            {storage.storageStrategy === "S3Compatible"
              ? "AWS S3 Compatible"
              : storage.storageStrategy}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}/swagger/index.html`, "_blank")
            }
          >
            API Docs
          </Button>
          {/* <LogMenu link="/services/storage/logs" /> */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {(currentParentId || storage.name !== "Default") && canAddHere && (
                <Button size="sm" className="bg-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Add New
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload file
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setIsCreateDirectoryModalOpen(true)}
              >
                <DirectoryPlus className="mr-2 h-4 w-4" />
                Create new directory
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-6 flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-sm border bg-card">
        {/* Search and Filters */}
        {(totalChildCount > 0 || filters.search) && (
          <div className="p-3">
            <div className="-mb-3 flex items-center justify-between gap-4">
              <div className="flex-1">
                <FilterToolbar
                  filters={[
                    { key: "search", type: "SearchInput", label: "Search" },
                    // TODO: Implement Last Modified filter later
                    // {
                    //   key: "lastModified",
                    //   type: "Radio",
                    //   label: "Last modified",
                    //   props: {
                    //     options: [
                    //       { label: "All", value: "" },
                    //       { label: "Last Hour", value: "1h" },
                    //       { label: "Last 24 Hours", value: "24h" },
                    //       { label: "Last 7 Days", value: "7d" },
                    //       { label: "Last 30 Days", value: "30d" },
                    //     ],
                    //   },
                    // },
                    // TODO: Implement File Type filter later
                    // {
                    //   key: "fileType",
                    //   type: "MultiSelect",
                    //   label: "File type",
                    //   props: {
                    //     options: [
                    //       { label: "PDF", value: "pdf" },
                    //       { label: "Image", value: "image" },
                    //       { label: "Video", value: "video" },
                    //       { label: "Audio", value: "audio" },
                    //     ],
                    //   },
                    // },
                  ]}
                  values={filters}
                  defaultValues={{ search: "", lastModified: "", fileType: [] }}
                  onChange={onChange}
                  onReset={onReset}
                />
              </div>
              {totalChildCount > 0 && (
                <div className="flex items-center gap-1 rounded-md border p-1">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 overflow-auto p-3">
          {/* Directories */}
          <div className="mb-8">
            {isDmsLoading ? (
              viewMode === "grid" ? (
                <DirectoryGridSkeleton />
              ) : (
                <DirectoryListSkeleton />
              )
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredDirectorys.map((directory, index) => (
                  <div
                    key={`directory-${directory.fileStorageId}-${index}`}
                    role="button"
                    tabIndex={0}
                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
                    onClick={() => handleDirectoryClick(directory)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleDirectoryClick(directory);
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Directory className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                      <span className="truncate text-sm font-medium" title={directory.name}>
                        {directory.name}
                      </span>
                    </div>
                    <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0 -mr-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="p-1 w-6 h-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                            aria-label="More options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none">
                          {renderRowMenu(directory)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`rounded-lg ${directorys.length > 0 && "border"} overflow-hidden`}>
                <Table className="w-full bg-background">
                  {filteredDirectorys.length > 0 && (
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>File type</TableHead>
                        <TableHead>Last modified</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                  )}
                  <TableBody>
                    {filteredDirectorys.map((directory, index) => (
                      <TableRow
                        key={`directory-list-${directory.fileStorageId}-${index}`}
                        className="group cursor-pointer hover:bg-accent"
                        onClick={() => handleDirectoryClick(directory)}
                      >
                        {/* Directory Name */}
                        <TableCell className="flex items-center gap-3 min-w-0">
                          <Directory className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                          <span className="font-medium truncate max-w-[200px] min-w-0">
                            {directory.name}
                          </span>
                        </TableCell>

                        {/* Directory Type */}
                        <TableCell className="text-muted-foreground">Directory</TableCell>

                        {/* Last Modified */}
                        <TableCell className="text-muted-foreground">
                          {directory.lastUpdatedDate
                            ? new Date(directory.lastUpdatedDate).toLocaleDateString()
                            : "-"}
                        </TableCell>

                        {/* Dropdown Icon*/}
                        <TableCell className="w-px">
                          <div className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="p-1 w-6 h-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                                  aria-label="More options"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-none">
                                {renderRowMenu(directory)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Files Section */}
          <div>
            {filteredFiles.length > 0 && <h2 className="mb-4 text-base font-semibold">Files</h2>}
            {isDmsLoading ? (
              viewMode === "grid" ? (
                <FileGridSkeleton />
              ) : (
                <FileListSkeleton />
              )
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredFiles.map((file, index) => (
                  <div
                    key={`file-${file.fileStorageId}-${index}`}
                    role="button"
                    tabIndex={0}
                    className="group flex cursor-pointer flex-col rounded-lg border bg-background transition-colors hover:bg-accent"
                    onClick={() => handleFileClick(file)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleFileClick(file);
                      }
                    }}
                  >
                    {/* File Preview */}
                    <div className="flex h-40 items-center justify-center border-b bg-muted/30 p-4">
                      {[".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"].includes(
                        file?.extension?.toLowerCase() || "",
                      ) ? (
                        <div className="flex flex-col items-center justify-center space-y-2">
                          {getFileIcon(file.extension)}
                          <span className="text-xs text-muted-foreground">{file.extension}</span>
                        </div>
                      ) : file?.extension?.toLowerCase() === ".pdf" ? (
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <FileText className="h-12 w-12 text-blue-500" />
                          <span className="text-xs text-muted-foreground">PDF</span>
                        </div>
                      ) : (
                        getFileIcon(file.extension)
                      )}
                    </div>

                    {/* File Info */}
                    <div className="flex group w-full">
                      <div className="flex justify-between items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 p-3 min-w-0">
                          {getFileIcon(file.extension, "sm")}
                          <span className="truncate text-sm font-medium min-w-0" title={file.name}>
                            {file.name}
                          </span>
                        </div>

                        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0 mr-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="p-1 w-6 h-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                                aria-label="More options"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-none">
                              {renderRowMenu(file)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`rounded-lg ${files.length > 0 && "border"} overflow-hidden`}>
                <Table className="w-full bg-background">
                  {filteredFiles.length > 0 && (
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>File type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Last modified</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                  )}
                  <TableBody>
                    {filteredFiles.map((file, index) => (
                      <TableRow
                        key={`file-list-${file.fileStorageId}-${index}`}
                        className="group cursor-pointer hover:bg-accent"
                        onClick={() => handleFileClick(file)}
                      >
                        <TableCell className="flex items-center gap-3 min-w-0">
                          {getFileIcon(file.extension, "sm")}
                          <span className="font-medium truncate max-w-[200px] min-w-0">
                            {file.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {file.extension.toUpperCase().replace(".", "")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {file.sizeInBytes !== null
                            ? `${(parseInt(file.sizeInBytes) / 1024).toFixed(2)} KB`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {file.lastUpdatedDate
                            ? new Date(file.lastUpdatedDate).toLocaleDateString()
                            : "-"}
                        </TableCell>

                        {/* Dropdown icon */}
                        <TableCell className="text-muted-foreground w-px">
                          <div className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="p-1 w-6 h-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                                  aria-label="More options"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-none">
                                {renderRowMenu(file)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </ScrollArea>
        {!isDmsLoading && rows.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">No directorys and files found</p>
          </div>
        )}
        {childrenQuery.hasNextPage && (
          <div className="flex justify-center border-t p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => childrenQuery.fetchNextPage()}
              disabled={childrenQuery.isFetchingNextPage}
            >
              {childrenQuery.isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </div>

      {accessItem && (
        <ManageAccessModal
          open={!!accessItem}
          onOpenChange={(open) => !open && setAccessItem(null)}
          item={accessItem}
        />
      )}

      {versionsFile && (
        <FileVersionsDrawer
          open={!!versionsFile}
          onOpenChange={(open) => !open && setVersionsFile(null)}
          file={versionsFile}
        />
      )}

      {transfer && (
        <MoveCopyDialog
          open={!!transfer}
          onOpenChange={(open) => !open && setTransfer(null)}
          item={transfer.item}
          mode={transfer.mode}
          startDirectoryId={currentParentId || undefined}
        />
      )}

      <RenameDirectoryDialog
        open={!!renameDirectory}
        onOpenChange={(open) => !open && setRenameDirectory(null)}
        directory={renameDirectory}
        onDone={() => childrenQuery.refetch()}
      />

      {/* Upload Modal */}
      {storage && (
        <UploadDmsFileModal
          open={isUploadModalOpen}
          onOpenChange={setIsUploadModalOpen}
          configurationName={storage.storageStrategy}
          name={storage.name}
          parentId={currentParentId}
          dmsWorkspaceId={storageId}
          dmsWorkspaceName={storage.name}
          onUploadSuccess={() => childrenQuery.refetch()}
        />
      )}

      {storage && (
        <CreateDmsNewDirectory
          open={isCreateDirectoryModalOpen}
          onOpenChange={setIsCreateDirectoryModalOpen}
          parentId={currentParentId}
          configurationName={storage.storageStrategy}
          onSuccess={() => childrenQuery.refetch()}
        />
      )}

      <Dialog
        open={isDeleteModalOpen}
        onOpenChange={(open) => {
          if (!deleteFilePending) setIsDeleteModalOpen(open);
        }}
      >
        <ConfirmationModal
          data={{
            dialogTitle: "Delete File",
            dialogSubtitle: "Are you sure you want to delete this file?",
          }}
          onConfirm={async () => {
            if (selectedFileId) {
              await handleDeleteFile(selectedFileId);
              setSelectedFileId(null);
              setIsDeleteModalOpen(false);
            }
          }}
          onCancel={() => {
            if (!deleteFilePending) {
              setIsDeleteModalOpen(false);
              setSelectedFileId(null);
            }
          }}
          buttonState={{ confirm: { disable: deleteFilePending } }}
        />
      </Dialog>

      <Dialog
        open={isDeleteDirectoryModalOpen}
        onOpenChange={(open) => {
          if (!deleteDirectoryPending) setIsDeleteDirectoryModalOpen(open);
        }}
      >
        <ConfirmationModal
          data={{
            dialogTitle: "Delete Directory",
            dialogSubtitle:
              "Are you sure you want to delete this directory? All the files inside this directory will be deleted for this action.",
          }}
          onConfirm={async () => {
            if (selectedDirectoryId) {
              await handleDeleteDirectory(selectedDirectoryId);
              setSelectedDirectoryId(null);
              setIsDeleteDirectoryModalOpen(false);
            }
          }}
          onCancel={() => {
            if (!deleteDirectoryPending) {
              setIsDeleteDirectoryModalOpen(false);
              setSelectedDirectoryId(null);
            }
          }}
          buttonState={{ confirm: { disable: deleteDirectoryPending } }}
        />
      </Dialog>

      {/* File Preview Modal */}
      {selectedFile && (
        <FilePreviewModal
          open={isPreviewModalOpen}
          onOpenChange={setIsPreviewModalOpen}
          fileUrl={filePreviewUrl}
          fileName={selectedFile.name}
          fileExtension={selectedFile.extension}
          isLoading={isLoadingPreview}
        />
      )}
    </main>
  );
}

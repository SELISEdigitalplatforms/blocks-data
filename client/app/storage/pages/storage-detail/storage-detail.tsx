"use client";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import {
  FilterChangeHandler,
  FilterToolbar,
} from "@/components/filter-toolbar";
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
import { CreateDmsNewFolder } from "@/storage/components/create-new-folder-modal/create-dms-new-folder";
import { FilePreviewModal } from "@/storage/components/file-preview-modal";
import { UploadDmsFileModal } from "@/storage/components/upload-dms-file-modal";
import { useDeleteFile, useLazyGetFile } from "@/storage/hooks/use-storage-file";
import {
  useDeleteDmsFolder,
  useDmsChildren,
  useDmsFolder,
} from "@/storage/hooks/use-dms";
import { FileVersionsDrawer } from "@/storage/components/file-versions-drawer/file-versions-drawer";
import { ManageAccessModal } from "@/storage/components/manage-access-modal/manage-access-modal";
import {
  MoveCopyDialog,
  MoveCopyMode,
} from "@/storage/components/move-copy-dialog/move-copy-dialog";
import { RenameFolderDialog } from "@/storage/components/rename-folder-dialog";
import {
  DmsFileItem,
  DmsFolderItem,
  DmsItem,
  DmsPermissionFlags,
} from "@/storage/models/dms.model";
import { canAddToFolder, itemActions } from "@/storage/utils/permission-actions";
import {
  DmsItemType,
  IDmsFileAndFolderInfo,
} from "@/storage/models/storage.model";
import { useProjectStore } from "@seliseblocks/genesis-os";

import {
  FileText,
  Folder,
  FolderPlus,
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
  FolderGridSkeleton,
  FolderListSkeleton,
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
type ListRow = IDmsFileAndFolderInfo & { permissions?: DmsPermissionFlags };

const toRow = (item: DmsItem): ListRow => ({
  parentId: item.parentDirectoryId ?? "",
  type: item.type === "folder" ? DmsItemType.Folder : DmsItemType.File,
  name: item.name,
  fileStorageId: item.itemId,
  extension: (item as DmsFileItem).extension ?? "",
  sizeInBytes: String((item as DmsFileItem).sizeInBytes ?? ""),
  version: (item as DmsFileItem).currentVersion ?? 0,
  description: (item as DmsFolderItem).description ?? "",
  itemId: item.itemId,
  lastUpdatedDate: item.lastUpdatedDate ?? "",
  permissions: item.permissions,
});

export function StorageDetail() {
  const navigate = useNavigate();
  const storagePath = useStoragePath();
  const params = new URLSearchParams(window.location.search);
  const storageId = params.get("id") as string;
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] =
    useState<boolean>(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Derive folder navigation state from URL
  const currentParentId = params.get("folderId") || "";
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
  const [renameFolder, setRenameFolder] = useState<DmsFolderItem | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] =
    useState<IDmsFileAndFolderInfo | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data: configurations, isLoading } = useGetStorageConfigurations();

  // Cursor pagination: pages are followed while the server reports hasMore,
  // and the search term is passed down rather than filtered on the client, so a
  // folder with more items than one page still searches its whole contents.
  const childrenQuery = useDmsChildren(currentParentId || undefined, {
    search: filters.search || undefined,
  });
  const isDmsLoading = childrenQuery.isLoading;

  const { data: currentFolder } = useDmsFolder(currentParentId || undefined);
  const { mutateAsync: deleteFolderItem, isPending: deleteFolderPending } =
    useDeleteDmsFolder();
  // Files are removed through the file endpoint, not the folder one. Routing a
  // file id at DeleteFolder would simply not find a folder with that id.
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
  const canAddHere = canAddToFolder(currentFolder ?? undefined);

  const storage = useMemo(() => {
    if (!Array.isArray(configurations)) {
      return undefined;
    }
    return configurations.find((config) => config.itemId === storageId);
  }, [configurations, storageId]);

  // Helper to build URL with folder navigation params
  const buildFolderUrl = useCallback(
    (folderId: string, path: BreadcrumbItem[]) => {
      const params = new URLSearchParams(window.location.search);
      if (folderId) {
        params.set("folderId", folderId);
        params.set("path", encodeURIComponent(JSON.stringify(path)));
      } else {
        params.delete("folderId");
        params.delete("path");
      }
      return `?${params.toString()}`;
    },
    [],
  );

  // Handle folder click - navigate into folder using URL
  const handleFolderClick = (folder: IDmsFileAndFolderInfo) => {
    const newPath = [
      ...breadcrumbPath,
      { id: folder.itemId, name: folder.name },
    ];
    navigate(buildFolderUrl(folder.itemId, newPath));
  };

  // Handle breadcrumb click - navigate to specific folder level
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Clicked on root (storage name)
      navigate(buildFolderUrl("", []));
    } else {
      // Clicked on a folder in the path
      const newPath = breadcrumbPath.slice(0, index + 1);
      navigate(buildFolderUrl(newPath[newPath.length - 1].id, newPath));
    }
  };

  // Handle file preview
  const handleFileClick = async (file: IDmsFileAndFolderInfo) => {
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

  const { folders, files } = useMemo(() => {
    const foldersData: ListRow[] = [];
    const filesData: ListRow[] = [];

    rows.forEach((item) => {
      if (item.type === DmsItemType.Folder) {
        foldersData.push(item);
      } else {
        filesData.push(item);
      }
    });

    return { folders: foldersData, files: filesData };
  }, [rows]);

  // The name search is applied server side now, so only the extension filter is
  // still narrowed here. Re-filtering by name locally would hide results the
  // server had already matched on a later page.
  const filteredFolders = folders;

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

  // Folders are soft-deleted: the folder moves to the trash and can be restored
  // from there, so the hook invalidates both the children and trash listings.
  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteFolderItem({ folderId: id });
      showSuccessToast({ description: "Folder Deleted successfully" });
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  /**
   * The actions offered on one row, gated by the flags the listing returned.
   *
   * Rendered from a single place rather than repeated in each of the four menus
   * (folder and file, grid and list), so a permission rule cannot end up
   * enforced in three of them and forgotten in the fourth.
   */
  const renderRowMenu = (row: ListRow) => {
    const dmsItem = dmsItemsById.get(row.itemId);
    const actions = itemActions(row);
    const isFolderRow = row.type === DmsItemType.Folder;

    return (
      <>
        {dmsItem && !isFolderRow && actions.canViewVersions && (
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
        {dmsItem && actions.canMove && (
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
        {dmsItem && !isFolderRow && actions.canCopy && (
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
        {dmsItem && isFolderRow && actions.canRename && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setRenameFolder(dmsItem as DmsFolderItem);
            }}
            className="cursor-pointer"
          >
            Rename
          </DropdownMenuItem>
        )}
        {actions.canDelete && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              if (isFolderRow) {
                setSelectedFolderId(row.itemId);
                setIsDeleteFolderModalOpen(true);
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
          <p className="text-muted-foreground">
            Storage configuration not found.
          </p>
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
              <span className="text-foreground hover:text-foreground">
                Storage
              </span>
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
                  <BreadcrumbPage className="text-low-emphasis">
                    {item.name}
                  </BreadcrumbPage>
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
              window.open(
                `${getRuntimeEnv("BLOCKS_DATA_BASE_URL")}/swagger/index.html`,
                "_blank",
              )
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
                onClick={() => setIsCreateFolderModalOpen(true)}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                Create new folder
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
          {/* Folders Section */}
          <div className="mb-8">
            {filteredFolders.length > 0 && (
              <h2 className="mb-4 text-base font-semibold">Folders</h2>
            )}

            {isDmsLoading ? (
              viewMode === "grid" ? (
                <FolderGridSkeleton />
              ) : (
                <FolderListSkeleton />
              )
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredFolders.map((folder, index) => (
                  <div
                    key={`folder-${folder.fileStorageId}-${index}`}
                    role="button"
                    tabIndex={0}
                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
                    onClick={() => handleFolderClick(folder)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleFolderClick(folder);
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Folder className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                      <span
                        className="truncate text-sm font-medium"
                        title={folder.name}
                      >
                        {folder.name}
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
                          <DropdownMenuContent
                            align="end"
                            className="rounded-none"
                          >
                            {renderRowMenu(folder)}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={`rounded-lg ${folders.length > 0 && "border"} overflow-hidden`}
              >
                <Table className="w-full bg-background">
                  {filteredFolders.length > 0 && (
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
                    {filteredFolders.map((folder, index) => (
                      <TableRow
                        key={`folder-list-${folder.fileStorageId}-${index}`}
                        className="group cursor-pointer hover:bg-accent"
                        onClick={() => handleFolderClick(folder)}
                      >
                        {/* Folder Name */}
                        <TableCell className="flex items-center gap-3 min-w-0">
                          <Folder className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                          <span className="font-medium truncate max-w-[200px] min-w-0">
                            {folder.name}
                          </span>
                        </TableCell>

                        {/* Folder Type */}
                        <TableCell className="text-muted-foreground">
                          Folder
                        </TableCell>

                        {/* Last Modified */}
                        <TableCell className="text-muted-foreground">
                          {folder.lastUpdatedDate
                            ? new Date(
                                folder.lastUpdatedDate,
                              ).toLocaleDateString()
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
                                <DropdownMenuContent
                                  align="end"
                                  className="rounded-none"
                                >
                                  {renderRowMenu(folder)}
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
            {filteredFiles.length > 0 && (
              <h2 className="mb-4 text-base font-semibold">Files</h2>
            )}
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
                      {[
                        ".jpg",
                        ".jpeg",
                        ".png",
                        ".gif",
                        ".svg",
                        ".webp",
                      ].includes(file?.extension?.toLowerCase() || "") ? (
                        <div className="flex flex-col items-center justify-center space-y-2">
                          {getFileIcon(file.extension)}
                          <span className="text-xs text-muted-foreground">
                            {file.extension}
                          </span>
                        </div>
                      ) : file?.extension?.toLowerCase() === ".pdf" ? (
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <FileText className="h-12 w-12 text-blue-500" />
                          <span className="text-xs text-muted-foreground">
                            PDF
                          </span>
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
                          <span
                            className="truncate text-sm font-medium min-w-0"
                            title={file.name}
                          >
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
                            <DropdownMenuContent
                              align="end"
                              className="rounded-none"
                            >
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
              <div
                className={`rounded-lg ${files.length > 0 && "border"} overflow-hidden`}
              >
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
                            ? new Date(
                                file.lastUpdatedDate,
                              ).toLocaleDateString()
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
                              <DropdownMenuContent
                                align="end"
                                className="rounded-none"
                              >
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
            <p className="text-muted-foreground">No folders and files found</p>
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
          startFolderId={currentParentId || undefined}
        />
      )}

      <RenameFolderDialog
        open={!!renameFolder}
        onOpenChange={(open) => !open && setRenameFolder(null)}
        folder={renameFolder}
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
        <CreateDmsNewFolder
          open={isCreateFolderModalOpen}
          onOpenChange={setIsCreateFolderModalOpen}
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
        open={isDeleteFolderModalOpen}
        onOpenChange={(open) => {
          if (!deleteFolderPending) setIsDeleteFolderModalOpen(open);
        }}
      >
        <ConfirmationModal
          data={{
            dialogTitle: "Delete Folder",
            dialogSubtitle:
              "Are you sure you want to delete this folder? All the files inside this folder will be deleted for this action.",
          }}
          onConfirm={async () => {
            if (selectedFolderId) {
              await handleDeleteFolder(selectedFolderId);
              setSelectedFolderId(null);
              setIsDeleteFolderModalOpen(false);
            }
          }}
          onCancel={() => {
            if (!deleteFolderPending) {
              setIsDeleteFolderModalOpen(false);
              setSelectedFolderId(null);
            }
          }}
          buttonState={{ confirm: { disable: deleteFolderPending } }}
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

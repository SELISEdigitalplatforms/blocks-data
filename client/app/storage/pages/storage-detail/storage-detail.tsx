"use client";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Folder,
  Info,
  LayoutGrid,
  List,
  Plus,
  Upload,
  FolderPlus,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import { useGetStorageConfigurations } from "../../hooks/use-storage-configuration";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Button } from "@/components/ui-kits/button/button";
import { FilterChangeHandler, FilterToolbar } from "@/components/filter-toolbar";
import { LogMenu } from "@/service-logs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui-kits/breadcrumb/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { useDeleteFile, useDeleteFolder, useGetDmsFileAndFolder, useLazyGetFile } from "@/storage/hooks/use-storage-file";
import {
  IGetDmsFileAndFolderResponse,
  IDmsFileAndFolderInfo,
  DmsItemType,
} from "@/storage/models/storage.model";
import { UploadDmsFileModal } from "@/storage/components/upload-dms-file-modal";
import { FilePreviewModal } from "@/storage/components/file-preview-modal";
import {
  FolderGridSkeleton,
  FolderListSkeleton,
  FileGridSkeleton,
  FileListSkeleton,
} from "./storage-detail-skeleton";
import { CreateDmsNewFolder } from "@/storage/components/create-new-folder-modal/create-dms-new-folder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { ScrollArea } from "@/components/ui-kits/scroll-area/scroll-area";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { useProjectStore } from "@/store/useProjectStore";

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

export function StorageDetail() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const storageId = params.get("id") as string;
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = useState<boolean>(false);
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
  const [dmsData, setDmsData] = useState<IGetDmsFileAndFolderResponse | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IDmsFileAndFolderInfo | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data: configurations, isLoading } = useGetStorageConfigurations();

  const { mutate: getDmsFileAndFolder, isPending: isDmsLoading } = useGetDmsFileAndFolder();
  const { mutateAsync: deleteFile, isPending: deleteFilePending } = useDeleteFile();
  const { mutateAsync: deleteFolder, isPending: deleteFolderPending } = useDeleteFolder();
  const { fetchFile } = useLazyGetFile();

  const storage = useMemo(() => {
    if (!Array.isArray(configurations)) {
      return undefined;
    }
    return configurations.find((config) => config.itemId === storageId);
  }, [configurations, storageId]);

  // Function to fetch DMS data
  const fetchDmsData = (parentId?: string) => {
    if (storage && projectKey) {
      const payload = {
        configurationName: storage.storageStrategy,
        projectKey: projectKey,
        skip: 0,
        take: 20,
        parentId,
        searchKey: filters.search || undefined,
      };

      getDmsFileAndFolder(payload, {
        onSuccess: (data) => {
          setDmsData(data);
        },
        onError: (error) => {
          return showErrorToast({ errors: error });
        },
      });
    }
  };

  // Call the API when storage configuration is loaded or parentId changes
  useEffect(() => {
    fetchDmsData(currentParentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, projectKey, filters.search, currentParentId]);

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
    const newPath = [...breadcrumbPath, { id: folder.itemId, name: folder.name }];
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

  // Separate folders and files from API data
  const { folders, files } = useMemo(() => {
    if (!dmsData?.dmsFileAndFolderInfos) {
      return { folders: [], files: [] };
    }

    const foldersData: IDmsFileAndFolderInfo[] = [];
    const filesData: IDmsFileAndFolderInfo[] = [];

    dmsData.dmsFileAndFolderInfos.forEach((item) => {
      if (item.type === DmsItemType.Folder) {
        foldersData.push(item);
      } else if (item.type === DmsItemType.File) {
        filesData.push(item);
      }
    });

    return { folders: foldersData, files: filesData };
  }, [dmsData]);

  // Filter folders based on search
  const filteredFolders = useMemo(() => {
    return folders.filter((folder) =>
      folder.name.toLowerCase().includes(filters.search.toLowerCase()),
    );
  }, [folders, filters.search]);

  // Filter files based on search and file type
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const matchesSearch = file?.name.toLowerCase().includes(filters.search.toLowerCase());
      // Map file extensions to file types for filtering
      const fileType = file?.extension?.toLowerCase() || "";
      const matchesFileType =
        filters.fileType.length === 0 || filters.fileType.some((type) => fileType.includes(type));
      return matchesSearch && matchesFileType;
    });
  }, [files, filters.search, filters.fileType]);

  const handleDeleteFile = async (id: string) => {
    const payload = {
      fileId: id,
      configurationName: storage?.name,
      projectKey: projectKey,
    };

    try {
      const res = await deleteFile(payload);
      if (res.isSuccess) {
        showSuccessToast({ description: "File Deleted successfully" });
        fetchDmsData(currentParentId);
      } else {
        showErrorToast({ errors: "Something went wrong" });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }
  };

  const handleDeleteFolder = async (id: string) => {
    const payload = {
      folderId: id,
      configurationName: storage?.name,
      projectKey: projectKey,
    };

    try {
      const res = await deleteFolder(payload);
      if (res.isSuccess) {
        showSuccessToast({ description: "Folder Deleted successfully" });
        fetchDmsData(currentParentId);
      } else {
        showErrorToast({ errors: "Something went wrong" });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }
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
              onClick={() => navigate("/services/storage")}
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
          <Button variant="ghost" size="icon" className="h-5 w-5">
            <Info className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `${process.env.NEXT_PUBLIC_API_BASE_URL}/storage/v1/swagger/index.html`,
                "_blank",
              )
            }
          >
            API Docs
          </Button> */}
          <LogMenu link="/services/storage/logs" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {currentParentId && (
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
        {((dmsData && dmsData.totalCount > 0) || filters.search) && (
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
              {dmsData && dmsData?.totalCount > 0 && (
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
                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
                    onClick={() => handleFolderClick(folder)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Folder className="h-5 w-5 flex-shrink-0 text-yellow-500" />
                      <span className="truncate text-sm font-medium" title={folder.name}>
                        {folder.name}
                      </span>
                    </div>
                    {folder.description === "Folder creation" && (
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
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFolderId(folder.itemId)
                              setIsDeleteFolderModalOpen(true)
                            }} className="cursor-pointer text-red-500">
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`rounded-lg ${folders.length > 0 && "border"} overflow-hidden`}>
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
                        <TableCell className="text-muted-foreground">Folder</TableCell>

                        {/* Last Modified */}
                        <TableCell className="text-muted-foreground">
                          {folder.lastUpdatedDate
                            ? new Date(folder.lastUpdatedDate).toLocaleDateString()
                            : "-"}
                        </TableCell>

                        {/* Dropdown Icon*/}
                        <TableCell className="w-px">
                          {folder.description === "Folder creation" && (
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
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedFolderId(folder.itemId);
                                      setIsDeleteFolderModalOpen(true);
                                    }}
                                    className="cursor-pointer text-red-500"
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
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
                    className="group flex cursor-pointer flex-col rounded-lg border bg-background transition-colors hover:bg-accent"
                    onClick={() => handleFileClick(file)}
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
                          <span
                            className="truncate text-sm font-medium min-w-0"
                            title={file.name}>
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
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFileId(file.fileStorageId);
                                setIsDeleteModalOpen(true);
                              }} className="cursor-pointer text-red-500">
                                Delete
                              </DropdownMenuItem>
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
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFileId(file.fileStorageId);
                                    setIsDeleteModalOpen(true);
                                  }}
                                  className="cursor-pointer text-red-500"
                                >
                                  Delete
                                </DropdownMenuItem>
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
        {!isDmsLoading && dmsData?.totalCount === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">No folders and files found</p>
          </div>
        )}
      </div>

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
          onUploadSuccess={() => fetchDmsData(currentParentId)}
        />
      )}

      {storage && (
        <CreateDmsNewFolder
          open={isCreateFolderModalOpen}
          onOpenChange={setIsCreateFolderModalOpen}
          parentId={currentParentId}
          configurationName={storage.storageStrategy}
          onSuccess={() => fetchDmsData(currentParentId)}
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
            dialogSubtitle: "Are you sure you want to delete this folder? All the files inside this folder will be deleted for this action.",
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
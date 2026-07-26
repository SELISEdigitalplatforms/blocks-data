# l3-nextjs-blocks-storage

A submodule of the Blocks platform that provides **cloud storage configuration**, **file management**, and **document management system (DMS)** capabilities for Next.js applications. It supports multiple cloud storage back-ends through a unified API surface.

> This module is part of an open-source initiative. Contributions, issues, and feedback are welcome.

---

## Table of Contents

- [Overview](#overview)
- [Module Architecture](#module-architecture)
- [Features](#features)
- [Key Concepts & Patterns](#key-concepts--patterns)
- [Services Reference](#services-reference)
- [Hooks Reference](#hooks-reference)
- [Running Tests](#running-tests)

---

## Overview

The `storage` submodule abstracts away the differences between cloud storage providers. Application code interacts with a single `StorageService` facade; the underlying provider (AWS S3, Azure Blob Storage, SFTP, or any S3-compatible service) is determined by the configuration stored on the platform, with no code changes required.

The module is split into three service classes that can be used independently or via the composed `StorageService` singleton:

| Service                | Responsibility                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageConfiguration` | CRUD for named storage backend configurations                                                                                                  |
| `StorageFile`          | Low-level file operations: pre-signed upload URLs, file metadata, file deletion                                                                |
| `StorageService`       | Facade that composes the above two and adds DMS (folder/file management), direct cloud uploads, local storage uploads, and certificate uploads |

---

## Module Architecture

```
storage/
├── components/
│   ├── create-new-folder-modal/   # Modal to create a new DMS folder
│   ├── file-preview-modal/        # Modal for previewing stored files
│   └── upload-dms-file-modal/     # Modal for uploading files to the DMS
│
├── constant/
│   └── endpoint.constant.ts       # All REST endpoint paths grouped by service
│
├── hooks/
│   ├── use-storage-configuration.ts        # TanStack Query hooks for configuration CRUD
│   ├── use-storage-configuration.test.ts
│   ├── use-storage-file.ts                 # TanStack Query hooks for all file operations
│   └── use-storage-file.test.ts
│
├── models/
│   └── storage.model.ts           # All TypeScript interfaces, types, and enums
│
├── pages/
│   ├── storage/                   # Storage list page
│   ├── storage-detail/            # File/folder detail page
│   ├── storage-configuration/     # Configuration management page
│   ├── logs/                      # Storage operation logs page
│   └── index.ts                   # Public page re-exports
│
├── services/
│   ├── storage.service.ts                    # Facade: composes Configuration + File + DMS ops
│   ├── storage.service.test.ts
│   ├── storage-configuration.service.ts      # Storage backend configuration management
│   ├── storage-configuration.service.test.ts
│   ├── storage-file.service.ts               # File-level REST operations
│   └── storage-file.service.test.ts
│
└── test-utils/                    # Shared test helpers and MSW handlers
```

---

## Features

### Storage Configuration

- **Multi-provider support**: Configure storage backends for four provider types, each with its own credential fields:

  | Strategy       | Provider                                                                      |
  | -------------- | ----------------------------------------------------------------------------- |
  | `Amazon`       | AWS S3 (access key, secret key, region endpoint)                              |
  | `Azure`        | Azure Blob Storage (connection string)                                        |
  | `SftpStorage`  | SFTP server (host, port, username, password, remote base path)                |
  | `S3Compatible` | Any S3-compatible service e.g. MinIO (access key, secret key, host, endpoint) |

- **Named configurations**: Multiple configurations can coexist under a project key, allowing different parts of an application to use different storage backends.
- **Smart save**: When saving, the service automatically clears fields that are irrelevant to the chosen strategy to avoid stale credentials being persisted.

### File Management

- **Pre-signed upload URLs**: Obtain a short-lived cloud upload URL without exposing credentials to the client. After receiving the URL, the file is uploaded directly to the cloud provider.
- **Direct cloud upload**: Stream a `File` or `Blob` object directly to a pre-signed URL with the correct `Content-Type` and Azure Blob headers where required.
- **Local storage upload**: Upload files to the platform's own local storage using multipart form data.
- **File metadata**: Retrieve full metadata for any stored file including access modifier, tags, MIME type, size, creator, and language.
- **Bulk file info**: Fetch metadata for multiple files in a single request.
- **Update additional info**: Patch a file's metadata and additional properties after upload.
- **File deletion**: Soft-delete a file by ID and project key.
- **Download URLs**: Resolve a download URL for any accessible file.

### Document Management System (DMS)

- **Folder & file browser**: List files and sub-folders at any level of the DMS hierarchy.
- **Folder creation**: Create named folders at any path in the DMS tree.
- **DMS file upload**: Upload files into a specific DMS folder with metadata, tags, access modifiers, and optional agent association.

### Additional Capabilities

- **Public certificate upload**: Upload PFX certificate files for third-party TLS/mTLS use cases.
- **Lazy file fetching**: `useLazyGetFile` enables on-demand fetching outside of the React render cycle using `queryClient.fetchQuery`.

---

## Key Concepts & Patterns

### Composite Service via the Facade Pattern

`StorageService` is composed of `StorageConfiguration` and `StorageFile` instances injected through its constructor. A singleton is exported for use across the app:

```typescript
export const storageService = new StorageService(new StorageConfiguration(), new StorageFile());
```

This means you can access all sub-service methods through the single import:

```typescript
import { storageService } from "@/storage/services/storage.service";

// Configuration methods
storageService.configuration.gets(projectKey);
storageService.configuration.save(payload);

// File methods
storageService.file.getPreSignedUrlForUpload(payload);
storageService.file.getFileByFileId(payload);

// Facade / DMS methods
storageService.uploadFile(payload);
storageService.getFilesAndFolders(payload);
storageService.createDmsFolder(payload);
```

### Two-Step Upload Flow

Uploading a file to cloud storage always follows this two-step pattern to avoid exposing credentials:

```
1. POST  /Files/GetPreSignedUrlForUpload  →  { uploadUrl, fileId }
2. PUT   <uploadUrl>                       →  file bytes streamed directly to cloud
```

Step 1 is handled by `storageService.file.getPreSignedUrlForUpload()` and step 2 by `storageService.uploadFile()`. The hooks `useGetPreSignedUrlForUpload` and `useUploadFile` map directly to these two steps.

### Layered Architecture

Every interaction follows the same three-layer pattern:

```
Service  →  Hook  →  Component
```

1. **Service**: A plain TypeScript class using the shared `http` client. No React dependency; fully unit-testable in isolation.
2. **Hook**: A TanStack Query (`useQuery` / `useMutation`) wrapper. Owns caching, invalidation, and loading/error state.
3. **Component / Page**: Consumes hooks only. Contains no direct API calls.

### Environment Variables

| Variable                   | Used by                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Root URL from which `API_BASES.CLOUD_CONFIGURATION` and `API_BASES.UDS` are derived |
| `NEXT_PUBLIC_X_BLOCKS_KEY` | Blocks project key sent in requests                                                 |

---

## Services Reference

### `StorageConfiguration` (`services/storage-configuration.service.ts`)

| Method             | Description                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `gets(projectKey)` | Fetch all storage configurations for a project                                                                       |
| `save(payload)`    | Create or update a storage configuration; automatically clears unused credential fields based on the chosen strategy |
| `delete(payload)`  | Delete a named configuration by project key and configuration name                                                   |

### `StorageFile` (`services/storage-file.service.ts`)

| Method                              | Description                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `getPreSignedUrlForUpload(payload)` | Request a pre-signed URL and register the file record; returns `{ fileId, uploadUrl }` |
| `getFileByFileId(payload)`          | Fetch full file metadata by file ID                                                    |
| `deleteFileByFileId(payload)`       | Delete a file record by ID                                                             |
| `getFilesInfoUrlForUpload(payload)` | Batch-fetch metadata for multiple files                                                |
| `updateFileAdditionalInfo(payload)` | Patch a file's metadata/additional properties                                          |
| `getFilesDownloadUrl(meta)`         | Resolve the download URL for a file                                                    |

### `StorageService` (`services/storage.service.ts`)

Inherits all methods of `StorageConfiguration` (via `this.configuration`) and `StorageFile` (via `this.file`), and adds:

| Method                                 | Description                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `uploadFile(payload)`                  | Stream a file directly to a pre-signed cloud URL (step 2 of the two-step upload) |
| `uploadFileToLocalStorage(payload)`    | Upload a file to the platform's local storage via multipart form data            |
| `uploadPublicCertificateFile(payload)` | Upload a PFX certificate file for third-party TLS use                            |
| `getFilesAndFolders(payload)`          | List DMS files and sub-folders at a given path                                   |
| `uploadDmsFile(payload)`               | Upload a file into a specific DMS folder                                         |
| `createDmsFolder(payload)`             | Create a new folder in the DMS hierarchy                                         |

---

## Hooks Reference

### Configuration Hooks (`hooks/use-storage-configuration.ts`)

| Hook                              | Type     | Description                                                                     |
| --------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `useGetStorageConfigurations()`   | Query    | Fetch all storage configurations for the current project; keyed by tenant ID    |
| `useSaveStorageConfiguration()`   | Mutation | Create or update a configuration; invalidates the configuration list on success |
| `useDeleteStorageConfiguration()` | Mutation | Delete a configuration; invalidates the configuration list on success           |

### File Hooks (`hooks/use-storage-file.ts`)

| Hook                                 | Type     | Description                                                                     |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------- |
| `useGetPreSignedUrlForUpload()`      | Mutation | Request a pre-signed upload URL; invalidates the files-info cache on success    |
| `useUploadFile()`                    | Mutation | Stream a file to a pre-signed URL (step 2 of the two-step upload)               |
| `useUploadFileToLocalStorage()`      | Mutation | Upload a file to platform local storage                                         |
| `useGetFile(option)`                 | Query    | Reactively fetch file metadata by ID, bound to the component lifecycle          |
| `useLazyGetFile()`                   | Custom   | Returns a `fetchFile(option)` function for on-demand fetching outside of render |
| `useDeleteFile()`                    | Mutation | Delete a file; invalidates the files-info cache on success                      |
| `useGetFilesInfo(options)`           | Query    | Batch-fetch metadata for multiple files                                         |
| `useGetFilesDownload(meta, options)` | Query    | Resolve a download URL; supports `enabled` flag for deferred fetching           |
| `usePublicCertificateFile()`         | Mutation | Upload a public PFX certificate                                                 |
| `useGetDmsFileAndFolder()`           | Mutation | List DMS files and folders at a path                                            |
| `useUploadDmsFile()`                 | Mutation | Upload a file to a DMS folder; invalidates the DMS file/folder cache on success |
| `useCreateDmsFolder()`               | Mutation | Create a DMS folder; invalidates the DMS file/folder cache on success           |

---

## Running Tests

Tests are written with **Vitest** and **React Testing Library**. MSW (Mock Service Worker) is used for API mocking.

Run all tests for this submodule from the **repo root**:

```bash
npm run test:storage
```

Or from inside the submodule directory:

```bash
npm test
```

To run in watch mode:

```bash
npx vitest --watch --project storage
```

Test files live alongside the code they test (e.g. `storage-file.service.test.ts` next to `storage-file.service.ts`) and share helpers from the `test-utils/` folder.

# SeliseBlocks.StorageDriver

## Overview

`SeliseBlocks.StorageDriver` is a powerful and flexible storage driver designed to seamlessly integrate with your application. It provides a standardized way to manage storage operations efficiently.

## Installation

To install `SeliseBlocks.StorageDriver`, add the NuGet package to your project:

```sh
dotnet add package SeliseBlocks.StorageDriver
```

## Usage

### Register Dependencies

Before using `SeliseBlocks.StorageDriver`, ensure that all required dependencies are registered in your application's dependency injection container. Add the following line in your `Program.cs`:

```csharp
builder.Services.RegisterStorageDriverApplicationServices();
```

This method will configure and register all necessary services required for the storage driver to function properly.

## Features

- Generates pre-signed URLs for secure file uploads
  - **Request:**
    ```json
    {
      "itemId": "string",
      "metaData": "string",
      "name": "string",
      "parentDirectoryId": "string",
      "tags": "string",
      "accessModifier": "string"
    }
    ```
  - **Response:**
    ```json
    {
       "uploadUrl": "string",
       "fileId": "string"
    }
    ```
- Supports secure file downloads
  - **Request:**
    ```json
    {
       "url": "string",
       "accessModifier": 0,
       "itemId": "string",
       "tags": ["string"],
       "metaData": {
               "additionalProp1": {
               "type": "string",
               "value": "string"}},
         "name": "string",
         "parentDirectoryID": "string",
         "systemName": "string",
         "type": 0,
         "typeString": "string",
         "createDate": "2025-02-19T09:29:35.513Z",
         "createdBy": "string",
         "language": "string",
         "tenantId": "string",
         "sizeInBytes": 0
    }
    ```
  - **Response:**
    ```json
    {
      "DownloadUrl": "string"
    }
    ```
- Efficient file deletion and management
  - **Request:**
    ```json
    {
      "FileId": "string"
    }
    ```
  - **Response:**
    ```json
    {
      "Success": true,
      "Message": "File deleted successfully"
    }
    ```


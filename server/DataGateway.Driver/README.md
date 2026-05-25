# DataGateway.Driver

The DataGateway.Driver is a NuGet package that provides a high-level interface for managing Data Gateway schema definitions and configurations in the Selise Blocks ecosystem.

## Package Information

- **Package ID**: `SeliseBlocks.DataGatewayDriver`
- **Version**: `9.0.0-preview.1`
- **Target Framework**: `.NET 9.0`
- **License**: MIT

## Installation

Install the package via NuGet Package Manager:

```bash
dotnet add package SeliseBlocks.DataGatewayDriver
```

Or via Package Manager Console:

```powershell
Install-Package SeliseBlocks.DataGatewayDriver
```

## Dependency Registration

### Using the Extension Method (Recommended)

The driver provides a convenient extension method for registering all required services:

```csharp
using Blocks.Extension.DependencyInjection;
using Microsoft.Extensions.DependencyInjection;

public void ConfigureServices(IServiceCollection services)
{
    // Register all DataGateway services including the driver
    services.RegisterBlocksDataGateway();
    
    // Add other services...
}
```

### Injecting the Service

```csharp
using DataGateway.Driver;

public class YourClass
{
    private readonly IDataGatewayDriverService _dataGatewayDriver;

    public YourClass(IDataGatewayDriverService dataGatewayDriver)
    {
        _dataGatewayDriver = dataGatewayDriver;
    }
}
```

## Function Reference

The `IDataGatewayDriverService` interface provides the following methods:

### Schema Management

#### `CreateSchemaAsync(CreateSchemaRequest request)`

Creates a new schema in the system.

**Parameters:**

`CreateSchemaRequest` contains:

- `CollectionName` (string): The name of the database collection/table
- `SchemaName` (string): The display name of the schema
- `ProjectKey` (string): The unique key identifying the project
- `SchemaType` (SchemaType enum): Type of schema - `Entity` (1) or `Dto` (2)

**Returns:** `Task<ServiceResponse<ActionResponse>>`

**Example:**

```csharp
var createRequest = new CreateSchemaRequest
{
    CollectionName = "Users",
    SchemaName = "User",
    ProjectKey = "guid",
    SchemaType = SchemaType.Entity
};

var result = await _dataGatewayDriver.CreateSchemaAsync(createRequest);
if (result.IsSuccess)
{
    Console.WriteLine($"Schema created with ID: {result.Data.Id}");
}
```

#### `UpdateSchemaAsync(UpdateSchemaRequest request)`

Updates an existing schema.

**Parameters:**

`UpdateSchemaRequest` extends `CreateSchemaRequest` and contains:

- `ItemId` (string): The unique identifier of the schema to update
- `CollectionName` (string): The name of the database collection/table
- `SchemaName` (string): The display name of the schema
- `ProjectKey` (string): The unique key identifying the project
- `SchemaType` (SchemaType enum): Type of schema - `Entity` (1) or `Dto` (2)

**Returns:** `Task<ServiceResponse<ActionResponse>>`

**Example:**

```csharp
var updateRequest = new UpdateSchemaRequest
{
    ItemId = "guid",
    CollectionName = "Users",
    SchemaName = "User",
    ProjectKey = "guid",
    SchemaType = SchemaType.Entity
};

var result = await _dataGatewayDriver.UpdateSchemaAsync(updateRequest);
```

#### `DeleteSchemaAsync(string id)`

Deletes a schema by its ID.

**Parameters:**

- `id`: The unique identifier of the schema to delete

**Returns:** `Task<ServiceResponse<ActionResponse>>`

### Schema Definition Management

#### `CreateSchemaDefinitionAsync(CreateSchemaDefinitionRequest request)`

Creates a new schema definition with field specifications.

**Parameters:**

`CreateSchemaDefinitionRequest` extends `CreateSchemaRequest` and contains:

- `CollectionName` (string): The name of the database collection/table
- `SchemaName` (string): The display name of the schema
- `ProjectKey` (string): The unique key identifying the project
- `SchemaType` (SchemaType enum): Type of schema - `Entity` (1) or `Dto` (2)
- `ProjectShortKey` (string): Short identifier for the project
- `Fields` (List<FieldDefinitionRequest>): Collection of field definitions

`FieldDefinitionRequest` contains:

- `Name` (string): The name of the field
- `Type` (string): The data type of the field (String, Int, Long, Float, Boolean, DateTime, ID)
- `IsArray` (bool): Whether the field is an array/list type

**Returns:** `Task<ServiceResponse<ActionResponse>>`

**Example:**

```csharp
var createDefinitionRequest = new CreateSchemaDefinitionRequest
{
    CollectionName = "Users",
    SchemaName = "User",
    ProjectKey = "guid",
    SchemaType = SchemaType.Entity,
    ProjectShortKey = "djs7tf",
    Fields = new List<FieldDefinitionRequest>
    {
        new() { Name = "Id", Type = "String", IsArray = false },
        new() { Name = "Name", Type = "String", IsArray = false },
        new() { Name = "Email", Type = "String", IsArray = false },
        new() { Name = "Age", Type = "Int", IsArray = false },
        new() { Name = "Tags", Type = "String", IsArray = true }
    }
};

var result = await _dataGatewayDriver.CreateSchemaDefinitionAsync(createDefinitionRequest);
```

#### `UpdateSchemaDefinitionAsync(UpdateSchemaDefinitionRequest request)`

Updates an existing schema definition.

**Parameters:**

`UpdateSchemaDefinitionRequest` extends `CreateSchemaDefinitionRequest` and contains:

- `ItemId` (string): The unique identifier of the schema definition to update
- `CollectionName` (string): The name of the database collection/table
- `SchemaName` (string): The display name of the schema
- `ProjectKey` (string): The unique key identifying the project
- `SchemaType` (SchemaType enum): Type of schema - `Entity` (1) or `Dto` (2)
- `ProjectShortKey` (string): Short identifier for the project
- `Fields` (List<FieldDefinitionRequest>): Updated collection of field definitions

**Returns:** `Task<ServiceResponse<ActionResponse>>`

**Example:**

```csharp
var updateDefinitionRequest = new UpdateSchemaDefinitionRequest
{
    ItemId = "guid",
    CollectionName = "Users",
    SchemaName = "User",
    ProjectKey = "guid",
    SchemaType = SchemaType.Entity,
    ProjectShortKey = "djs7tf",
    Fields = new List<FieldDefinitionRequest>
    {
        new() { Name = "Id", Type = "String", IsArray = false },
        new() { Name = "FullName", Type = "String", IsArray = false }, // Updated field
        new() { Name = "Email", Type = "String", IsArray = false },
        new() { Name = "Age", Type = "Int", IsArray = false }
    }
};

var result = await _dataGatewayDriver.UpdateSchemaDefinitionAsync(updateDefinitionRequest);
```

#### `SaveFieldDefinitionAsync(SaveFieldDefinitionRequest request)`

Saves or updates field definitions for an existing schema, with support for field deletion.

**Parameters:**

`SaveFieldDefinitionRequest` contains:

- `SchemaDefinitionItemId` (string): The ID of the schema definition to modify
- `ProjectShortKey` (string): Short identifier for the project
- `Fields` (List<FieldDefinitionRequest>): New or updated field definitions
- `DeletableFieldNames` (string[]): Names of fields to be deleted from the schema

**Returns:** `Task<ServiceResponse<ActionResponse>>`

**Example:**

```csharp
var saveFieldRequest = new SaveFieldDefinitionRequest
{
    SchemaDefinitionItemId = "guid",
    ProjectShortKey = "djs7tf",
    DeletableFieldNames = new[] { "OldField", "UnusedField" }, // Fields to remove
    Fields = new List<FieldDefinitionRequest>
    {
        new() { Name = "NewField", Type = "String", IsArray = false },
        new() { Name = "UpdatedField", Type = "DateTime", IsArray = false }
    }
};

var result = await _dataGatewayDriver.SaveFieldDefinitionAsync(saveFieldRequest);
```

### Schema Retrieval

#### `GetSchemaByIdAsync(string id)`

Retrieves a specific schema by its ID.

**Parameters:**

- `id`: The unique identifier of the schema

**Returns:** `Task<ServiceResponse<SchemaDefinitionResponse>>`

**Example:**

```csharp
var schema = await _dataGatewayDriver.GetSchemaByIdAsync("guid");
if (schema.IsSuccess)
{
    Console.WriteLine($"Schema Name: {schema.Data.Name}");
    Console.WriteLine($"Field Count: {schema.Data.Fields.Count}");
}
```

#### `GetAllSchemasAsync(GetSchemaDefinitionListRequest request)`

Retrieves a paginated list of all schemas with filtering and sorting capabilities.

**Parameters:**

`GetSchemaDefinitionListRequest` extends `BasePaginationRequest` and contains:

**Pagination Properties (from BasePaginationRequest):**

- `PageNo` (int): Page number (default: 1)
- `PageSize` (int): Number of items per page (default: 10)
- `SortBy` (string): Field to sort by (default: "Id")
- `SortDescending` (bool): Sort in descending order (default: false)

**Filter Properties:**

- `Keyword` (string, optional): Search keyword for general search
- `SchemaName` (string, optional): Filter by specific schema name
- `CollectionName` (string, optional): Filter by database collection name
- `ProjectKey` (string, optional): Filter by project key
- `SchemaType` (SchemaType, optional): Filter by schema type - `Entity` (1) or `Dto` (2)

**Returns:** `Task<ServiceResponse<PaginationResponse<SchemaDefinitionResponse>>>`

**Example:**

```csharp
var listRequest = new GetSchemaDefinitionListRequest
{
    PageNo = 1,
    PageSize = 20,
    SortBy = "SchemaName",
    SortDescending = false,
    Keyword = "user",
    SchemaType = SchemaType.Entity,
    ProjectKey = "guid"
};

var schemas = await _dataGatewayDriver.GetAllSchemasAsync(listRequest);
if (schemas.IsSuccess)
{
    Console.WriteLine($"Total: {schemas.Data.TotalCount}");
    Console.WriteLine($"Pages: {schemas.Data.TotalPages}");
    
    foreach (var schema in schemas.Data.Items)
    {
        Console.WriteLine($"Schema: {schema.Name} (Type: {schema.SchemaType})");
    }
}
```

## Error Handling

All methods return a `ServiceResponse<T>` which includes:

- `IsSuccess`: Boolean indicating if the operation was successful
- `Message`: Error or success message
- `Data`: The actual response data (if successful)
- `Errors`: Collection of validation or processing errors

Example error handling:

```csharp
var result = await _dataGatewayDriver.CreateSchemaAsync(request);

if (!result.IsSuccess)
{
    Console.WriteLine($"Error: {result.Message}");
    
    if (result.Errors?.Any() == true)
    {
        foreach (var error in result.Errors)
        {
            Console.WriteLine($"- {error}");
        }
    }
}
```

## Best Practices

1. **Dependency Injection**: Always use dependency injection to obtain the service instance
2. **Error Handling**: Check `IsSuccess` before accessing the `Data` property
3. **Async/Await**: Use async/await pattern for all method calls
4. **Validation**: Validate request objects before passing them to the driver methods
5. **Logging**: Implement proper logging around driver calls for debugging and monitoring

## Available Data Types

When defining fields in `FieldDefinitionRequest`, use these supported data types:

- `String`: Text data
- `Int`: 32-bit integer
- `Long`: 64-bit integer  
- `Float`: Floating-point number
- `Boolean`: True/false value
- `DateTime`: Date and time value

## Dependencies

This package depends on:

- `DataGateway.DomainService`: Core domain services and models
- `.NET 9.0`: Runtime framework

The extension method automatically registers all required dependencies.

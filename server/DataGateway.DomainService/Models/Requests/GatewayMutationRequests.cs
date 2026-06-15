namespace DataGateway.DomainService.Models.Requests;

public class GatewayInsertRequest
{
    public Dictionary<string, object?> Input { get; set; } = new();
}

public class GatewayUpdateRequest
{
    public Dictionary<string, object?> Input { get; set; } = new();
}

public class GatewayDeleteRequest
{
    public bool HardDelete { get; set; }
}

public class GatewayBulkInsertRequest
{
    public List<Dictionary<string, object?>> Items { get; set; } = new();
}

public class GatewayBulkUpdateRequest
{
    public object? Where { get; set; }
    public string? Filter { get; set; }
    public Dictionary<string, object?> Input { get; set; } = new();
}

public class GatewayBulkDeleteRequest
{
    public object? Where { get; set; }
    public string? Filter { get; set; }
    public bool HardDelete { get; set; }
}

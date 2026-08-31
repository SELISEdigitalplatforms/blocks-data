namespace DataGateway.DomainService.Models.Responses;

/// <summary>One time bucket (day or week) of GraphQL request counts, split by outcome.</summary>
public class GraphLogRequestsOverTimeBucket
{
    public DateTime Date { get; set; }
    public int Success { get; set; }
    public int Failed { get; set; }
}

namespace DataGateway.DomainService.Models.Responses;

/// <summary>One time bucket of GraphQL request counts, split by outcome.</summary>
public class GraphLogRequestsOverTimeBucket
{
    public DateTime Date { get; set; }
    public int Success { get; set; }

    /// <summary>
    /// Refused on purpose — authentication, authorization or validation. Split out from
    /// <see cref="Errored"/> because the two mean different things and go to different people.
    /// </summary>
    public int Denied { get; set; }

    /// <summary>Failed because something broke: a bad request, an unhandled error, or unclassified.</summary>
    public int Errored { get; set; }
}

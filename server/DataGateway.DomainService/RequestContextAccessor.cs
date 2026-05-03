namespace DataGateway.DomainService;

public sealed class RequestContextAccessor
{
    private static readonly AsyncLocal<RequestContext?> _current = new();

    public static RequestContext Current
    {
        get
        {
            return _current.Value ?? new RequestContext();
        }
        set
        {
            _current.Value = value;
        }
    }

    public static void Clear()
    {
        _current.Value = null;
    }
}


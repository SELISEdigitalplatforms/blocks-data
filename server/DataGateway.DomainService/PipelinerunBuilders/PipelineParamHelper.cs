namespace DataGateway.DomainService.PipelinerunBuilders;

internal static class PipelineParamHelper
{
    internal static void ApplyParam(IDictionary<string, object> root, string key, string value)
    {
        var paramList = GetParamList(root);
        foreach (var item in paramList.OfType<IDictionary<object, object>>())
        {
            if (item.TryGetValue("name", out var nameObj) &&
                nameObj?.ToString() == key)
            {
                item["value"] = value;
                return;
            }
        }
        throw new InvalidDataException("Parameter " + key + " not found.");
    }

    internal static string? ExtractParamValue(IDictionary<string, object> root, string key)
    {
        if (!TryGetParamList(root, out var paramList))
            return null;

        foreach (var item in paramList!.OfType<IDictionary<object, object>>())
        {
            if (item.TryGetValue("name", out var nameObj) && nameObj?.ToString() == key)
                return item.TryGetValue("value", out var valObj) ? valObj?.ToString() : null;
        }

        return null;
    }

    private static IList<object> GetParamList(IDictionary<string, object> root)
    {
        if (!TryGetParamList(root, out var paramList))
            throw new InvalidDataException("YAML has no spec.params list.");

        return paramList!;
    }

    private static bool TryGetParamList(IDictionary<string, object> root, out IList<object>? paramList)
    {
        paramList = null;

        if (!root.TryGetValue("spec", out var specObj) ||
            specObj is not IDictionary<object, object> spec)
            return false;

        if (!spec.TryGetValue("params", out var listObj) ||
            listObj is not IList<object> list)
            return false;

        paramList = list;
        return true;
    }
}

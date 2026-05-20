using YamlDotNet.Serialization;

namespace DataGateway.DomainService.PipelinerunBuilders;

public class DataGatewayPipelineBuilder
{
    private readonly IDictionary<string, object> _dictionary;
    private static readonly IDeserializer _deser = new DeserializerBuilder()
        .WithAttemptingUnquotedStringTypeDeserialization().Build();
    private string? _metadataName;
    private string? _projectKey;
    private string? _version;
    private string? _clusterNames;
    private string? _repoUrl;
    private string? _revision;
    private string? _tenantId;

    public DataGatewayPipelineBuilder(IDictionary<string, object> root) => _dictionary = root;

    public IDictionary<string, object> Build()
    {
        ApplyMetadataName();
        ApplyProjectKey();
        ApplyVersion();
        ApplyClusterNames();
        ApplyRepoUrl();
        ApplyRevision();
        ApplyTenantId();
        return _dictionary;
    }

    public DataGatewayPipelineBuilder SetMetadataName(string name) { _metadataName = name; return this; }
    public DataGatewayPipelineBuilder SetProjectKey(string projectKey) { _projectKey = projectKey; return this; }
    public DataGatewayPipelineBuilder SetVersion(string version) { _version = version; return this; }
    public DataGatewayPipelineBuilder SetClusterNames(string clusterNames) { _clusterNames = clusterNames; return this; }
    public DataGatewayPipelineBuilder SetRevision(string revision) { _revision = revision; return this; }
    public DataGatewayPipelineBuilder SetTenantId(string tenantId) { _tenantId = tenantId; return this; }

    public DataGatewayPipelineBuilder SetRepoUrl(string accessToken)
    {
        var repoUrl = PipelineParamHelper.ExtractParamValue(_dictionary, "repo-url");
        if (repoUrl != null)
        {
            var prefix = repoUrl.StartsWith("http://") ? "http://" : "https://";
            _repoUrl = prefix + accessToken + repoUrl[prefix.Length..];
        }
        return this;
    }

    public static DataGatewayPipelineBuilder FromYamlFile(string path) =>
        new(_deser.Deserialize<IDictionary<string, object>>(File.ReadAllText(path)));

    private void ApplyMetadataName()
    {
        if (_metadataName == null) return;
        if (_dictionary["metadata"] is Dictionary<object, object> metadata)
            metadata["name"] = _metadataName;
    }

    private void ApplyProjectKey() { if (_projectKey != null) ApplyParam("project-key", _projectKey); }
    private void ApplyVersion() { if (_version != null) ApplyParam("version", _version); }
    private void ApplyClusterNames() { if (_clusterNames != null) ApplyParam("cluster-names", _clusterNames); }
    private void ApplyRepoUrl() { if (_repoUrl != null) ApplyParam("repo-url", _repoUrl); }
    private void ApplyRevision() { if (_revision != null) ApplyParam("revision", _revision); }
    private void ApplyTenantId() { if (_tenantId != null) ApplyParam("tenant-id", _tenantId); }

    private void ApplyParam(string key, string value) => PipelineParamHelper.ApplyParam(_dictionary, key, value);
}

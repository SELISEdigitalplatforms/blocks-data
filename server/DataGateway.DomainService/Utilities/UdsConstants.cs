using Path = System.IO.Path;

namespace DataGateway.DomainService.Utilities;

public static class UdsConstants
{
    public static readonly string NAMESPACE_NAME = "tekton-pipelines";
    public static readonly string DATAGETWAY_YAML_PATH = Path.Combine(AppContext.BaseDirectory, "Assets", "pipeline_run_uds.yaml");
}

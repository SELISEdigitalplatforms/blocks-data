namespace XUnitTest.DataGateway;

/// <summary>
/// Tests that mutate ambient BlocksContext / RequestContext or global statics share this
/// collection so xUnit runs them serially, avoiding cross-test interference.
/// </summary>
[CollectionDefinition("ContextSerial", DisableParallelization = true)]
public class ContextSerialCollection
{
}

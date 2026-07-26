using EphemeralMongo;
using MongoDB.Driver;

namespace XUnitTest.Infrastructure;

/// <summary>
/// Spins up a throwaway mongod (downloaded/managed by EphemeralMongo) once for
/// the whole test run and exposes a MongoClient against it. Each caller should
/// use a unique database name so tests stay isolated.
/// </summary>
public sealed class MongoFixture : IDisposable
{
    private readonly IMongoRunner _runner;
    public IMongoClient Client { get; }

    public MongoFixture()
    {
        var options = new MongoRunnerOptions
        {
            UseSingleNodeReplicaSet = false,
        };

        _runner = MongoRunner.Run(options);
        Client = new MongoClient(_runner.ConnectionString);
    }

    public IMongoDatabase CreateDatabase() =>
        Client.GetDatabase("db_" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try
        {
            _runner?.Dispose();
        }
        catch
        {
            // best effort teardown
        }
    }
}

[CollectionDefinition("Mongo")]
public sealed class MongoCollection : ICollectionFixture<MongoFixture>
{
}
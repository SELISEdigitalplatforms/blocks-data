using System.Diagnostics;
using MongoDB.Bson;
using MongoDB.Driver;

namespace XUnitTest.Infrastructure;

/// <summary>
/// Boots a throwaway mongod process once for the whole test run and exposes a
/// MongoClient against it. Each caller should use a unique database name so
/// tests stay isolated.
/// </summary>
public sealed class MongoFixture : IDisposable
{
    private readonly Process? _process;
    private readonly string _dbPath;
    public IMongoClient Client { get; }
    public int Port { get; }

    public MongoFixture()
    {
        Port = GetFreePort();
        _dbPath = Path.Combine(Path.GetTempPath(), "xunit-mongo-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dbPath);

        var psi = new ProcessStartInfo
        {
            FileName = "mongod",
            Arguments = $"--dbpath \"{_dbPath}\" --port {Port} --nounixsocket --bind_ip 127.0.0.1 --setParameter enableTestCommands=1",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        _process = Process.Start(psi);

        Client = new MongoClient($"mongodb://127.0.0.1:{Port}/?connectTimeoutMS=2000&serverSelectionTimeoutMS=2000");
        WaitForReady();
    }

    public IMongoDatabase CreateDatabase() =>
        Client.GetDatabase("db_" + Guid.NewGuid().ToString("N"));

    private void WaitForReady()
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        Exception? last = null;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var admin = Client.GetDatabase("admin");
                admin.RunCommand<BsonDocument>(new BsonDocument("ping", 1));
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                Thread.Sleep(200);
            }
        }
        throw new InvalidOperationException("mongod did not become ready in time.", last);
    }

    private static int GetFreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public void Dispose()
    {
        try
        {
            if (_process is { HasExited: false })
            {
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(5000);
            }
        }
        catch
        {
            // best effort teardown
        }
        finally
        {
            _process?.Dispose();
            try { Directory.Delete(_dbPath, recursive: true); } catch { /* best effort */ }
        }
    }
}

[CollectionDefinition("Mongo")]
public sealed class MongoCollection : ICollectionFixture<MongoFixture>
{
}

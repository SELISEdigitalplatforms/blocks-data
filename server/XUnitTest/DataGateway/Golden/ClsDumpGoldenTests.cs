using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Blocks.Genesis;
using DataGateway.DomainService;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Helpers;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using FluentAssertions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using Xunit.Abstractions;

namespace XUnitTest.DataGateway.Golden;

/// <summary>
/// Runs read masking over a real tenant export (a mongoexport of SchemaDefinitions,
/// DataAccessPolicys, DataValidations and data collections) and checks that the masking the
/// gateway serves gives exactly what the plain, unoptimized evaluation gives, for a spread of
/// callers. Prints a fingerprint and timings per caller, so runs before and after a change can be
/// compared.
///
/// Tenant exports hold customer data and are never committed (db-scripts/ is git-ignored), so this
/// only runs where one is present: set DATA_GATEWAY_GOLDEN_DUMP to its folder, or keep it at
/// db-scripts/almora/dg. Without one the test does nothing.
/// </summary>
[Collection("ContextSerial")]
public class ClsDumpGoldenTests
{
    private const string DumpDirVariable = "DATA_GATEWAY_GOLDEN_DUMP";
    private const string FingerprintOutVariable = "DATA_GATEWAY_GOLDEN_OUT";

    private readonly ITestOutputHelper _output;

    public ClsDumpGoldenTests(ITestOutputHelper output) => _output = output;

    [Fact]
    [Trait("Category", "LocalDump")]
    public void ServedMasking_MatchesPlainEvaluation_ForEveryCaller()
    {
        var dumpDir = FindDumpDir();
        if (dumpDir is null)
        {
            _output.WriteLine($"No tenant export found; set {DumpDirVariable} to run this test.");
            return;
        }

        var (schemas, dataFiles, prefix) = LoadDump(dumpDir);

        var fingerprints = new StringBuilder();
        foreach (var dataFile in dataFiles)
        {
            var collectionName = Path.GetFileNameWithoutExtension(dataFile)[(Path.GetFileName(prefix).Length)..];
            var schema = schemas.SingleOrDefault(s => s.CollectionName == collectionName);
            if (schema is null)
            {
                _output.WriteLine($"{collectionName}: no schema, skipped");
                continue;
            }

            var documents = BsonSerializer.Deserialize<BsonArray>(File.ReadAllText(dataFile))
                .Select(v => v.AsBsonDocument).ToList();
            var clsPolicies = schema.Policies
                .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
                .ToList();
            _output.WriteLine($"{collectionName}: {documents.Count} rows, {schema.Fields.Count} fields, {clsPolicies.Count} READ CLS policies");
            documents.Select(BsonSize.Of).Should().Equal(documents.Select(d => d.ToBson().Length), "the logged response size must not change");

            foreach (var caller in Callers(documents))
            {
                TestSupport.ClearContext();
                TestSupport.SetBlocksCloud(false);
                caller.Apply();
                try
                {
                    var plainWatch = Stopwatch.StartNew();
                    var plain = documents
                        .Select(doc => QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                            doc.ToDictionary(), schema, clsPolicies, [], QueryPolicyRuleEvaluator.RowSatisfiesPolicy))
                        .ToList();
                    plainWatch.Stop();

                    var servedWatch = Stopwatch.StartNew();
                    var served = QueryService.BuildResultItems(documents, schema, []);
                    servedWatch.Stop();

                    var plainJson = plain.Select(ToCanonicalJson).ToList();
                    var servedJson = served.Select(ToCanonicalJson).ToList();
                    servedJson.Should().Equal(plainJson, $"{collectionName} as {caller.Name} must mask identically");

                    var fingerprint = Fingerprint(servedJson);
                    var visibleFields = served.Sum(row => row.Count(kv => kv.Value is not null));
                    fingerprints.AppendLine($"{collectionName}\t{caller.Name}\t{fingerprint}");
                    _output.WriteLine(
                        $"  {caller.Name,-28} plain {plainWatch.ElapsedMilliseconds,6} ms   served {servedWatch.ElapsedMilliseconds,6} ms   visible values {visibleFields,6}   {fingerprint}");
                }
                finally
                {
                    TestSupport.ClearContext();
                }
            }
        }

        var outFile = Environment.GetEnvironmentVariable(FingerprintOutVariable);
        if (!string.IsNullOrWhiteSpace(outFile))
            File.WriteAllText(outFile, fingerprints.ToString());
    }

    /// <summary>
    /// The same comparison with the caller carried the way a real gateway request carries it: a
    /// token's claims on the HTTP context (role-derived permissions included), and no context
    /// pinned in AsyncLocal, so every policy check reads the caller from the request. This is where
    /// the per-row cost is in production, so the timings here are the ones to compare.
    /// </summary>
    [Theory]
    [Trait("Category", "LocalDump")]
    [InlineData("lawyer", 50)]
    [InlineData("firmadmin", 50)]
    [InlineData("assistant", 50)]
    public void ServedMasking_MatchesPlainEvaluation_ForATokenOnTheRequest(string role, int rows)
    {
        var dumpDir = FindDumpDir();
        if (dumpDir is null)
        {
            _output.WriteLine($"No tenant export found; set {DumpDirVariable} to run this test.");
            return;
        }

        var (schemas, dataFiles, prefix) = LoadDump(dumpDir);
        const int permissionClaims = 250;

        foreach (var dataFile in dataFiles)
        {
            var collectionName = Path.GetFileNameWithoutExtension(dataFile)[(Path.GetFileName(prefix).Length)..];
            var schema = schemas.SingleOrDefault(s => s.CollectionName == collectionName);
            if (schema is null)
                continue;

            var documents = BsonSerializer.Deserialize<BsonArray>(File.ReadAllText(dataFile))
                .Select(v => v.AsBsonDocument).Take(rows).ToList();
            var clsPolicies = schema.Policies
                .Where(p => p.PolicyType == PolicyType.CLS && p.Operation == PolicyOperation.READ)
                .ToList();
            var organizationId = documents
                .Select(d => d.GetValue("OrganizationId", BsonNull.Value))
                .Where(v => v.IsString).Select(v => v.AsString)
                .GroupBy(v => v).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "org";
            var userId = documents
                .Select(d => d.GetValue("CreatedBy", BsonNull.Value))
                .Where(v => v.IsString).Select(v => v.AsString)
                .GroupBy(v => v).OrderByDescending(g => g.Count()).Select(g => g.Key).FirstOrDefault() ?? "user";

            var claims = new List<System.Security.Claims.Claim>
            {
                new(BlocksContext.TENANT_ID_CLAIM, "tenant-1"),
                new(BlocksContext.USER_ID_CLAIM, userId),
                new(BlocksContext.ORGANIZATION_ID_CLAIM, organizationId),
                new(BlocksContext.EMAIL_CLAIM, "user@example.com"),
                new(BlocksContext.ROLES_CLAIM, role),
                new(BlocksContext.PERMISSION_CLAIM, "fe::clients"),
                new(BlocksContext.PERMISSION_CLAIM, "fe::cases"),
            };
            claims.AddRange(Enumerable.Range(0, permissionClaims - 2)
                .Select(i => new System.Security.Claims.Claim(BlocksContext.PERMISSION_CLAIM, $"permission::{i}")));
            var identity = new System.Security.Claims.ClaimsIdentity(
                claims, "Bearer", BlocksContext.USER_NAME_CLAIM, BlocksContext.ROLES_CLAIM);

            var httpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext
            {
                User = new System.Security.Claims.ClaimsPrincipal(identity),
            };
            httpContext.Request.Headers["x-blocks-key"] = "tenant-1";

            var previousAccessor = BlocksHttpContextAccessor.Instance;
            TestSupport.ClearContext();
            TestSupport.SetBlocksCloud(false);
            BlocksHttpContextAccessor.Instance = new Microsoft.AspNetCore.Http.HttpContextAccessor { HttpContext = httpContext };
            try
            {
                BlocksContext.GetContext()!.Roles.Should().Equal(role);

                var plainWatch = Stopwatch.StartNew();
                var plain = documents
                    .Select(doc => QueryClsRowMaskingHelper.MaskRowByClsPolicies(
                        doc.ToDictionary(), schema, clsPolicies, [], QueryPolicyRuleEvaluator.RowSatisfiesPolicy))
                    .Select(ToCanonicalJson)
                    .ToList();
                plainWatch.Stop();

                var servedWatch = Stopwatch.StartNew();
                var served = QueryService.BuildResultItems(documents, schema, []).Select(ToCanonicalJson).ToList();
                servedWatch.Stop();

                served.Should().Equal(plain, $"{collectionName} as {role} must mask identically");
                _output.WriteLine(
                    $"{collectionName,-22} {role,-10} {documents.Count} rows, {clsPolicies.Count} CLS policies, {permissionClaims} permission claims: " +
                    $"plain {plainWatch.ElapsedMilliseconds} ms, served {servedWatch.ElapsedMilliseconds} ms, {Fingerprint(served)}");
            }
            finally
            {
                BlocksHttpContextAccessor.Instance = previousAccessor;
                TestSupport.ClearContext();
            }
        }
    }

    private static (List<SchemaDefinitionExtended> Schemas, List<string> DataFiles, string Prefix) LoadDump(string dumpDir)
    {
        var prefix = Directory.GetFiles(dumpDir, "*.SchemaDefinitions.json").Single();
        prefix = prefix[..^"SchemaDefinitions.json".Length];

        var schemas = GraphqlSchemaBuilder.Assemble(new SchemaSource
        {
            SchemaDefinitions = Load<SchemaDefinition>(prefix + "SchemaDefinitions.json")
                .Where(s => !s.IsDeleted && s.Fields is { Count: > 0 }).ToList(),
            DataValidations = Load<DataValidation>(prefix + "DataValidations.json").Where(v => !v.IsDeleted).ToList(),
            DataAccessPolicies = Load<DataAccessPolicy>(prefix + "DataAccessPolicys.json").Where(p => !p.IsDeleted).ToList(),
        });
        var dataFiles = Directory.GetFiles(dumpDir, "*.json").Where(f => !IsMetadataFile(f)).Order().ToList();
        return (schemas, dataFiles, prefix);
    }

    private sealed record Caller(string Name, Action Apply);

    /// <summary>
    /// One caller per kind of policy the tenant has: each role, owners, assignees, someone with the
    /// role but not the permission, a stranger, and an anonymous request. The ids come from the
    /// data itself so that the schema-field rules (CreatedBy, lawyerIds, assistantIds) match rows.
    /// </summary>
    private static IEnumerable<Caller> Callers(List<BsonDocument> documents)
    {
        string? MostCommon(Func<BsonDocument, IEnumerable<string>> values) => documents
            .SelectMany(values)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .GroupBy(v => v)
            .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => g.Key)
            .FirstOrDefault();

        IEnumerable<string> Strings(BsonDocument doc, string field) =>
            doc.TryGetValue(field, out var value) switch
            {
                false => [],
                _ when value.IsString => [value.AsString],
                _ when value.IsBsonArray => value.AsBsonArray.Where(v => v.IsString).Select(v => v.AsString),
                _ => [],
            };

        var organizationId = MostCommon(d => Strings(d, "OrganizationId")) ?? "org";
        var inOrganization = documents.Where(d => Strings(d, "OrganizationId").Contains(organizationId)).ToList();
        string Pick(string field) =>
            inOrganization.SelectMany(d => Strings(d, field)).GroupBy(v => v)
                .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal)
                .Select(g => g.Key).FirstOrDefault() ?? "nobody";

        var creator = Pick("CreatedBy");
        var lawyer = Pick("lawyerIds");
        var assistant = Pick("assistantIds");
        string[] permissions = ["fe::clients", "fe::cases"];

        Caller As(string name, string userId, string[] roles, string[]? perms = null, string? organization = null) =>
            new(name, () => TestSupport.SetContext(
                userId: userId,
                roles: roles,
                permissions: perms ?? permissions,
                organizationId: organization ?? organizationId));

        yield return As("firmadmin", "admin-user", ["firmadmin"]);
        yield return As("auditor", "auditor-user", ["auditor"]);
        yield return As("compliance", "compliance-user", ["compliance"]);
        yield return As("lawyer (creator)", creator, ["lawyer"]);
        yield return As("lawyer (assigned)", lawyer, ["lawyer"]);
        yield return As("lawyer (no rows)", "unknown-user", ["lawyer"]);
        yield return As("lawyer (role holds creator)", "other-user", ["lawyer", creator]);
        yield return As("lawyer (role holds assistant)", "other-user", ["lawyer", assistant]);
        yield return As("assistant (creator)", creator, ["assistant"]);
        yield return As("assistant (assigned)", assistant, ["assistant"]);
        yield return As("assistant (role holds lawyer)", "other-user", ["assistant", lawyer]);
        yield return As("lawyer without permission", creator, ["lawyer"], perms: []);
        yield return As("firmadmin other org", "admin-user", ["firmadmin"], organization: "another-org");
        yield return As("clouduser", "cloud-user", ["clouduser"]);
        yield return As("systemadmin", "system-user", ["systemadmin"]);
        yield return As("no roles", "plain-user", []);
        yield return new Caller("anonymous", () => TestSupport.SetContext(isAuthenticated: false, userId: "", roles: [], permissions: [], organizationId: ""));
    }

    private static string ToCanonicalJson(Dictionary<string, object> row) =>
        new BsonDocument(row).ToJson(new MongoDB.Bson.IO.JsonWriterSettings { OutputMode = MongoDB.Bson.IO.JsonOutputMode.CanonicalExtendedJson });

    private static string Fingerprint(IEnumerable<string> rows)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", rows)));
        return Convert.ToHexString(hash)[..16];
    }

    private static List<T> Load<T>(string path) =>
        BsonSerializer.Deserialize<BsonArray>(File.ReadAllText(path))
            .Select(v => BsonSerializer.Deserialize<T>(v.AsBsonDocument))
            .ToList();

    private static bool IsMetadataFile(string path)
    {
        var name = Path.GetFileName(path);
        return name.EndsWith(".SchemaDefinitions.json", StringComparison.Ordinal)
            || name.EndsWith(".DataAccessPolicys.json", StringComparison.Ordinal)
            || name.EndsWith(".DataValidations.json", StringComparison.Ordinal)
            || name.EndsWith(".SchemaIndexDefinitions.json", StringComparison.Ordinal);
    }

    private static string? FindDumpDir()
    {
        var configured = Environment.GetEnvironmentVariable(DumpDirVariable);
        if (!string.IsNullOrWhiteSpace(configured))
            return Directory.Exists(configured) ? configured : null;

        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "db-scripts", "almora", "dg");
            if (Directory.Exists(candidate))
                return candidate;
        }
        return null;
    }
}

using System.Runtime.CompilerServices;
using Xunit.Sdk;

namespace XUnitTest.Infrastructure;

/// <summary>
/// Compares a produced text with a checked-in golden file. The file lives in a <c>Golden</c> folder next to the
/// calling test source file, as <c>Golden/{name}.json</c>. Run with <c>UPDATE_GOLDEN=1</c> to (re)write the files
/// instead of comparing, then read the diff before committing.
/// </summary>
public static class GoldenFile
{
    public const string UpdateVariable = "UPDATE_GOLDEN";

    public static void Match(string name, string actual, [CallerFilePath] string callerPath = "")
    {
        var directory = Path.Combine(Path.GetDirectoryName(callerPath)!, "Golden");
        var path = Path.Combine(directory, name + ".json");

        if (Environment.GetEnvironmentVariable(UpdateVariable) == "1")
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(path, EnsureTrailingNewline(actual));
            return;
        }

        if (!File.Exists(path))
            throw new XunitException($"golden file missing; run with {UpdateVariable}=1 ({path})");

        var expected = Normalise(File.ReadAllText(path));
        var produced = Normalise(actual);
        if (expected != produced)
            throw new XunitException(
                $"golden file {name}.json differs ({path}). Run with {UpdateVariable}=1 to accept the change, then review the diff.{Environment.NewLine}" +
                $"--- expected{Environment.NewLine}{expected}{Environment.NewLine}--- actual{Environment.NewLine}{produced}");
    }

    private static string EnsureTrailingNewline(string text) => text.EndsWith('\n') ? text : text + "\n";

    private static string Normalise(string text) => text.Replace("\r\n", "\n").TrimEnd('\n');
}

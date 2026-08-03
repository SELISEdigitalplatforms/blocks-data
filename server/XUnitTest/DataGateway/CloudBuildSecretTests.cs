using Blocks.Genesis;
using FluentAssertions;

namespace XUnitTest.DataGateway;

public class CloudBuildSecretTests
{
    private sealed class Target
    {
        public string? Text { get; set; }
        public int Number { get; set; }
        public string? ReadOnlyValue { get; }
    }

    [Fact]
    public void ConvertValue_ReturnsStringsUnchanged()
    {
        CloudBuildSecret.ConvertValue("hello", typeof(string)).Should().Be("hello");
    }

    [Fact]
    public void ConvertValue_ConvertsToTheTargetType()
    {
        CloudBuildSecret.ConvertValue("42", typeof(int)).Should().Be(42);
        CloudBuildSecret.ConvertValue("true", typeof(bool)).Should().Be(true);
    }

    [Fact]
    public void ConvertValue_FallsBackToTheRawStringWhenConversionFails()
    {
        // Convert.ChangeType throws for a non-numeric string, and the raw value is returned.
        CloudBuildSecret.ConvertValue("not-a-number", typeof(int)).Should().Be("not-a-number");
    }

    [Fact]
    public void UpdateProperty_SetsAWritableProperty()
    {
        var target = new Target();

        CloudBuildSecret.UpdateProperty(target, nameof(Target.Text), "written");

        target.Text.Should().Be("written");
    }

    [Fact]
    public void UpdateProperty_IgnoresAnUnknownProperty()
    {
        var target = new Target();

        var act = () => CloudBuildSecret.UpdateProperty(target, "NoSuchProperty", "value");

        act.Should().NotThrow();
        target.Text.Should().BeNull();
    }

    [Fact]
    public void UpdateProperty_IgnoresAReadOnlyProperty()
    {
        var target = new Target();

        var act = () => CloudBuildSecret.UpdateProperty(target, nameof(Target.ReadOnlyValue), "value");

        act.Should().NotThrow();
        target.ReadOnlyValue.Should().BeNull();
    }

    [Fact]
    public void UpdateProperty_RoundTripsAConvertedValue()
    {
        var target = new Target();

        var converted = CloudBuildSecret.ConvertValue("7", typeof(int));
        CloudBuildSecret.UpdateProperty(target, nameof(Target.Number), converted);

        target.Number.Should().Be(7);
    }

    [Fact]
    public void SecretPropertiesDefaultToNullBeforeTheVaultIsRead()
    {
        var secret = new CloudBuildSecret();

        secret.ChatGptEncryptedSecret.Should().BeNull();
        secret.ChatGptEncryptionKey.Should().BeNull();
    }
}

using System.Reflection;
using Api.Controllers;
using Blocks.Data.Api.Filters;
using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Storage.DomainService.Utilities;

namespace XUnitTest.Api;

/// <summary>
/// Nothing in the pipeline runs request validators on its own, so a registered Storage
/// validator only takes effect on an action that carries <see cref="ValidateRequestAttribute"/>.
/// This fails when an endpoint takes a validated request without opting in.
/// </summary>
public class RequestValidationCoverageTests
{
    // These run their validator inside the service and report failures in their own
    // response shape, so the filter would change what clients already receive.
    private static readonly string[] ValidatedInService =
    [
        $"{nameof(ObjectController)}.{nameof(ObjectController.ShareObjects)}",
        $"{nameof(FileController)}.{nameof(FileController.GetPreSignedUrlForUpload)}",
        $"{nameof(FileController)}.{nameof(FileController.UploadFileToLocalStorage)}",
        $"{nameof(FileController)}.{nameof(FileController.UpdateFileAdditionalInfo)}",
    ];

    private static HashSet<Type> StorageValidatedTypes()
    {
        var services = new ServiceCollection();
        services.AddStorageDomainServices();

        return services
            .Where(d => d.ServiceType.IsGenericType && d.ServiceType.GetGenericTypeDefinition() == typeof(IValidator<>))
            .Select(d => d.ServiceType.GetGenericArguments()[0])
            .ToHashSet();
    }

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(ObjectController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            .Where(m => m.GetCustomAttribute<NonActionAttribute>() is null);

    private static string Name(MethodInfo action) => $"{action.DeclaringType!.Name}.{action.Name}";

    [Fact]
    public void Every_action_taking_a_validated_storage_request_runs_its_validator()
    {
        var validated = StorageValidatedTypes();
        var actions = Actions().ToList();

        var expected = actions
            .Where(a => a.GetParameters().Any(p => validated.Contains(p.ParameterType)))
            .Select(Name)
            .Except(ValidatedInService)
            .Order();
        var decorated = actions
            .Where(a => a.GetCustomAttribute<ValidateRequestAttribute>() is not null)
            .Select(Name)
            .Order();

        decorated.Should().Equal(expected);
    }
}

using System;
using Blocks.Genesis;

namespace DataGateway.DomainService.Models;

public class ProjectKeyModel : IProjectKey
{
    public string ProjectKey { get; set; } = string.Empty;
}

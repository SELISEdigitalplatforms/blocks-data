using System;
using Blocks.Genesis;

namespace DataGateway.DomainService.Entities;

public class GraphQlBaseEntity : BaseEntity
{
    public DateTime? DeletedDate { get; set; }
    public bool IsDeleted { get; set; }

}

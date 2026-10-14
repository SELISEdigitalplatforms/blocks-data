using System;
using Blocks.Genesis;

namespace Blocks.DataAccess.Entities;

public class GraphQlBaseEntity : BaseEntity
{
    public DateTime? DeletedDate { get; set; }
    public bool IsDeleted { get; set; }

}

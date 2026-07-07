using Blocks.Genesis;
using Storage.DomainService.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Storage.DomainService.Storage
{

    public class GetFilesInfoRequest : BaseGetsRequest<GetFilesInfoFilter>
    {
    }

    public class GetFilesInfoResponse : BaseQueryListResponse<IQueryable<GetFile>>
    {

    }
}

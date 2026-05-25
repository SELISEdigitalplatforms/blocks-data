using Blocks.Genesis;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DomainService.Storage
{
    public class GetPreSignedUrlForUploadResponse: BaseResponse
    {
        public string UploadUrl { get; set; } = string.Empty;
        public string FileId { get; set; } = string.Empty;
    }
}

using Blocks.Genesis;
using Storage.DomainService.Enums;
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

        #region Phase1UploadSecurity

        /// <summary>Identifier of the file version created for this upload.</summary>
        public string? FileVersionId { get; set; }

        /// <summary>Identifier correlating this upload's URL issuance with its later completion call.</summary>
        public string? UploadSessionId { get; set; }

        /// <summary>UTC instant at which <see cref="UploadUrl"/> expires.</summary>
        public DateTime? UploadUrlExpiresAtUtc { get; set; }

        /// <summary>Headers the client must send with the provider upload request (e.g. content-type, blob type).</summary>
        public Dictionary<string, string>? RequiredHeaders { get; set; }

        /// <summary>True when the client must call <c>POST /files/complete-upload</c> before the file is readable.</summary>
        public bool UploadCompletionRequired { get; set; }

        /// <summary>Verification status recorded for this version at the time the upload URL was issued.</summary>
        public FileVerificationStatus VerificationStatus { get; set; } = FileVerificationStatus.Unverified;

        #endregion
    }
}

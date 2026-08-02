using DomainService.Storage.Dms;
using FluentValidation;
using Storage.DomainService.Entities;
using Storage.DomainService.Services;

namespace Storage.DomainService.Storage.Validators
{
    // Shape and range rules only. Anything needing a database read stays in the service:
    // name uniqueness, whether a folder exists, and whether the caller may act on it.

    internal static class DmsValidationRules
    {
        internal const int MaxNameLength = 255;
        internal const int MaxPageSize = 200;
        internal const int MaxVersionPageSize = 100;

        /// <summary>
        /// A cursor is opaque to callers, so the only thing worth checking is that it
        /// decodes. Rejecting a corrupt one here would turn a stale bookmark into an
        /// error; the listing treats an undecodable cursor as the first page instead.
        /// </summary>
        internal static bool BeADecodableCursor(string? cursor) =>
            string.IsNullOrEmpty(cursor) || ContentCursor.Decode(cursor) is not null;

        /// <summary>Names that would break path building or confuse a client tree view.</summary>
        internal static bool BeAUsableName(string? name) =>
            !string.IsNullOrWhiteSpace(name)
            && !name.Contains('/', StringComparison.Ordinal)
            && !name.Contains('\\', StringComparison.Ordinal)
            && name.Trim() == name
            && name != "."
            && name != "..";
    }

    public class CreateFolderRequestValidator : AbstractValidator<global::DomainService.Storage.Dms.CreateFolderRequest>
    {
        public CreateFolderRequestValidator()
        {
            RuleFor(r => r.Name)
                .NotEmpty()
                .MaximumLength(DmsValidationRules.MaxNameLength)
                .Must(DmsValidationRules.BeAUsableName)
                .WithMessage("Name must not be blank, contain a path separator, or have leading or trailing whitespace.");

            RuleFor(r => r.Description).MaximumLength(2000);
        }
    }

    public class UpdateFolderRequestValidator : AbstractValidator<UpdateFolderRequest>
    {
        public UpdateFolderRequestValidator()
        {
            RuleFor(r => r.FolderId).NotEmpty();

            // Name is optional on an update, but must be usable when supplied.
            RuleFor(r => r.Name)
                .MaximumLength(DmsValidationRules.MaxNameLength)
                .Must(DmsValidationRules.BeAUsableName)
                .When(r => r.Name is not null)
                .WithMessage("Name must not be blank, contain a path separator, or have leading or trailing whitespace.");

            RuleFor(r => r.Description).MaximumLength(2000);
        }
    }

    public class GetFolderChildrenRequestValidator : AbstractValidator<GetFolderChildrenRequest>
    {
        public GetFolderChildrenRequestValidator()
        {
            // An empty folder id lists root folders, so it is allowed rather than rejected.
            RuleFor(r => r.Limit).InclusiveBetween(1, DmsValidationRules.MaxPageSize);
            RuleFor(r => r.Cursor).Must(DmsValidationRules.BeADecodableCursor).WithMessage("Cursor is not a valid continuation token.");
            RuleFor(r => r.Search).MaximumLength(DmsValidationRules.MaxNameLength);
        }
    }

    public class CopyFileRequestValidator : AbstractValidator<CopyFileRequest>
    {
        public CopyFileRequestValidator()
        {
            RuleFor(r => r.FileId).NotEmpty();
            RuleFor(r => r.TargetFolderId).NotEmpty();
        }
    }

    public class MoveFileRequestValidator : AbstractValidator<MoveFileRequest>
    {
        public MoveFileRequestValidator()
        {
            RuleFor(r => r.FileId).NotEmpty();
            RuleFor(r => r.TargetFolderId).NotEmpty();
        }
    }

    public class MoveFolderRequestValidator : AbstractValidator<MoveFolderRequest>
    {
        public MoveFolderRequestValidator()
        {
            RuleFor(r => r.FolderId).NotEmpty();

            // The target may be empty, meaning the top level, but it must never be the
            // folder itself. The service still checks the descendant case, which needs
            // the stored hierarchy.
            RuleFor(r => r.TargetFolderId)
                .NotEqual(r => r.FolderId)
                .When(r => !string.IsNullOrEmpty(r.TargetFolderId))
                .WithMessage("A folder cannot be moved into itself.");
        }
    }

    public class GrantAccessRequestValidator : AbstractValidator<GrantAccessRequest>
    {
        public GrantAccessRequestValidator()
        {
            RuleFor(r => r.ResourceId).NotEmpty();
            RuleFor(r => r.ResourceType).IsInEnum();
            RuleFor(r => r.PrincipalType).IsInEnum();
            RuleFor(r => r.Permission).IsInEnum();
            RuleFor(r => r.Effect).IsInEnum();
            RuleFor(r => r.Priority).GreaterThanOrEqualTo(0);

            // Everyone is the one principal kind that carries no id. For the rest an empty
            // principal either matches nobody or risks being read as a wildcard.
            RuleFor(r => r.PrincipalId)
                .NotEmpty()
                .When(r => r.PrincipalType != ContentPrincipalType.Everyone)
                .WithMessage("A principal is required for every principal type except Everyone.");

            RuleFor(r => r.ExpiresAt)
                .Must(e => e is null || e > DateTime.UtcNow)
                .WithMessage("An expiry must be in the future.");
        }
    }

    public class RevokeAccessRequestValidator : AbstractValidator<RevokeAccessRequest>
    {
        public RevokeAccessRequestValidator()
        {
            RuleFor(r => r.ResourceId).NotEmpty();
            RuleFor(r => r.PolicyItemId).NotEmpty();
        }
    }

    public class ToggleInheritanceRequestValidator : AbstractValidator<ToggleInheritanceRequest>
    {
        public ToggleInheritanceRequestValidator()
        {
            RuleFor(r => r.ResourceId).NotEmpty();
        }
    }

    public class ContentSearchRequestValidator : AbstractValidator<ContentSearchRequest>
    {
        public ContentSearchRequestValidator()
        {
            RuleFor(r => r.Query).NotEmpty().MaximumLength(DmsValidationRules.MaxNameLength);
            RuleFor(r => r.Limit).InclusiveBetween(1, DmsValidationRules.MaxPageSize);
            RuleFor(r => r.Cursor).Must(DmsValidationRules.BeADecodableCursor).WithMessage("Cursor is not a valid continuation token.");
        }
    }

    public class TrashRequestValidator : AbstractValidator<TrashRequest>
    {
        public TrashRequestValidator()
        {
            RuleFor(r => r.Limit).InclusiveBetween(1, DmsValidationRules.MaxPageSize);
            RuleFor(r => r.Cursor).Must(DmsValidationRules.BeADecodableCursor).WithMessage("Cursor is not a valid continuation token.");
        }
    }

    public class RestoreFromTrashRequestValidator : AbstractValidator<RestoreFromTrashRequest>
    {
        public RestoreFromTrashRequestValidator()
        {
            RuleFor(r => r.ResourceId).NotEmpty();
        }
    }

    public class CreateFileVersionRequestValidator : AbstractValidator<CreateFileVersionRequest>
    {
        public CreateFileVersionRequestValidator()
        {
            RuleFor(r => r.FileId).NotEmpty();
        }
    }

    public class GetFileVersionsRequestValidator : AbstractValidator<GetFileVersionsRequest>
    {
        public GetFileVersionsRequestValidator()
        {
            RuleFor(r => r.FileId).NotEmpty();
            RuleFor(r => r.Limit).InclusiveBetween(1, DmsValidationRules.MaxVersionPageSize);

            // The version cursor is a plain version number rather than the encoded listing
            // cursor, so it is validated differently on purpose.
            RuleFor(r => r.Cursor)
                .Must(c => string.IsNullOrEmpty(c) || long.TryParse(c, out _))
                .WithMessage("Cursor is not a valid version marker.");
        }
    }
}

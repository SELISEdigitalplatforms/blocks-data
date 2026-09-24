import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kits/dropdown-menu/dropdown-menu";
import { Input } from "@/components/ui-kits/input/input";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { LOGICAL_OPERATOR } from "@/data-gateway/constants/schema-access-control";
import { useDeletePolicy } from "@/data-gateway/hooks/use-configuration";
import type { IPolicyItem } from "@/data-gateway/models/data-service";
import { ruleSetLines } from "@/data-gateway/utils/access-phrase";
import {
  ChevronDown,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

interface SchemaAccessControlAccordionProps {
  policies?: IPolicyItem[];
  onAddRuleSet?: () => void;
  onEditPolicy?: (policy: IPolicyItem) => void;
  isEditing?: boolean;
}

export const SchemaAccessControlAccordion = ({
  policies = [],
  onAddRuleSet,
  onEditPolicy,
  isEditing,
}: SchemaAccessControlAccordionProps) => {
  const [openId, setOpenId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [deletingPolicy, setDeletingPolicy] = useState<IPolicyItem | null>(
    null,
  );
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { mutateAsync: deletePolicy, isPending: isDeleting } =
    useDeletePolicy();

  const handleDeletePolicy = async () => {
    if (!deletingPolicy?.itemId) return;
    try {
      const res = await deletePolicy({
        itemId: deletingPolicy.itemId,
        projectKey,
      });
      if (res?.isSuccess) {
        showSuccessToast({ description: "Rule set deleted successfully" });
      } else {
        showErrorToast({ errors: res?.errors });
      }
    } catch (error) {
      showErrorToast({ errors: error });
    }
    setDeletingPolicy(null);
  };

  const filteredPolicies = searchText
    ? policies.filter((p) =>
        p.policyName.toLowerCase().includes(searchText.toLowerCase()),
      )
    : policies;

  return (
    <div className="space-y-2">
      {!isEditing && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
            Rule sets
          </span>
          <span className="rounded-full bg-access-custom-bg px-1.5 py-0.5 text-[10px] font-bold text-access-custom-fg">
            {policies.length}
          </span>
          <div className="flex-1" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
            onClick={onAddRuleSet}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add rule set</span>
          </Button>
        </div>
      )}

      {!isEditing && policies.length > 0 && (
        <Input
          placeholder="Search rule sets"
          aria-label="Search rule sets"
          className="h-9 text-xs"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      )}

      {!isEditing && policies.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5">
          <Info className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            Access is granted when <strong className="font-semibold text-foreground">any</strong> rule
            set matches.
          </span>
        </div>
      )}

      {filteredPolicies.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {filteredPolicies.map((policy, index) => {
            const isOpen = openId === index;
            const rulesCount = policy.ruleGroup.rules.length;
            const matchesAll = policy.ruleGroup.logicalOperator === LOGICAL_OPERATOR.AND;
            const logicalLabel = matchesAll
              ? "every rule must match"
              : "any rule may match";
            const rulesLabel = rulesCount === 1 ? "1 rule" : `${rulesCount} rules`;
            const matchModeLabel = matchesAll ? "match all" : "match any";

            return (
              <li
                key={policy.itemId ?? index}
                className="overflow-hidden rounded-md border border-border/50"
              >
                <div className="flex items-center gap-1 pr-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                        isOpen ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {policy.policyName}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {rulesLabel} · {matchModeLabel}
                    </span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${policy.policyName}`}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => onEditPolicy?.(policy)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:text-destructive"
                        onClick={() => setDeletingPolicy(policy)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {isOpen && (
                  <div className="border-t border-border/40 bg-muted/20 px-2.5 py-2">
                    {/* Read as a sentence: "when X, and Y" — the joiner is the
                        set's own operator, so the relation is never guessed. */}
                    <p className="text-[11px] text-muted-foreground">
                      Grants access when {logicalLabel}:
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {ruleSetLines(policy).map((line, ruleIdx) => (
                        <li key={ruleIdx} className="flex gap-1.5 text-xs leading-relaxed">
                          <span className="shrink-0 font-medium text-muted-foreground">
                            {line.lead}
                          </span>
                          <span className="min-w-0 text-foreground">{line.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filteredPolicies.length === 0 && !isEditing && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {searchText
            ? `No rule sets match "${searchText}"`
            : "No rule sets added yet. Click Add rule set to create one."}
        </p>
      )}

      <Dialog
        open={!!deletingPolicy}
        onOpenChange={(open) => {
          if (!open) setDeletingPolicy(null);
        }}
      >
        <ConfirmationModal
          onCancel={() => setDeletingPolicy(null)}
          onConfirm={handleDeletePolicy}
          data={{
            dialogTitle: "Delete rule set?",
            dialogSubtitle: `Are you sure you want to delete ${deletingPolicy?.policyName}? This action cannot be undone.`,
            confirmButton: "Delete",
            cancelButton: "Cancel",
          }}
          buttonState={{ confirm: { disable: isDeleting } }}
        />
      </Dialog>
    </div>
  );
};

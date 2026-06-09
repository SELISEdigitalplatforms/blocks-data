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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-kits/table/table";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { LOGICAL_OPERATOR } from "@/data-gateway/constants/schema-access-control";
import { useDeletePolicy } from "@/data-gateway/hooks/use-configuration";
import type { IPolicyItem } from "@/data-gateway/models/data-service";
import { ruleToText } from "@/data-gateway/utils/schema-access-control.utils";
import {
  ChevronDown,
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
        <div className="flex w-full items-center gap-3">
          <Input
            placeholder="Search"
            className="my-6 flex-1"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <Button
            type="button"
            variant="outline"
            className="flex items-center gap-2"
            onClick={onAddRuleSet}
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </Button>
        </div>
      )}

      {filteredPolicies.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Rule Set Name</TableHead>
              <TableHead className="w-[30%]">Rules</TableHead>
              <TableHead className="w-[20%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPolicies.map((policy, index) => {
              const isOpen = openId === index;
              const rulesCount = policy.ruleGroup.rules.length;
              const logicalLabel =
                policy.ruleGroup.logicalOperator === LOGICAL_OPERATOR.AND
                  ? "All rules match (AND)"
                  : "Any rule matches (OR)";

              return (
                <>
                  <TableRow
                    key={index}
                    className="cursor-pointer"
                    onClick={() => setOpenId(isOpen ? null : index)}
                  >
                    <TableCell className="font-medium">
                      {policy.policyName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rulesCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditPolicy?.(policy);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingPolicy(policy);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform duration-300",
                            isOpen && "rotate-180",
                          )}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {isOpen && (
                    <TableRow key={`${index}-details`}>
                      <TableCell colSpan={3} className="bg-muted/20 p-4">
                        <p className="mb-3 text-xs text-muted-foreground">
                          {logicalLabel}
                        </p>
                        <div className="flex flex-col gap-2">
                          {policy.ruleGroup.rules.map((rule, ruleIdx) => (
                            <div
                              key={ruleIdx}
                              className="rounded border border-muted bg-muted/30 px-3 py-2 text-sm"
                            >
                              {ruleToText(rule)}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      )}

      {filteredPolicies.length === 0 && !isEditing && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {searchText
            ? `No rule sets match "${searchText}"`
            : "No rule sets added yet. Click + Add to create one."}
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

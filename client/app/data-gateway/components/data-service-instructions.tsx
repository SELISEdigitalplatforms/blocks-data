"use client";
import { Button } from "@/components/ui-kits/button/button";
import { dataServiceInstructions } from "../constants/instructions";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import ConfigureDataSourceModal from "./configure-data-source";
import { useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { configurationService } from "../services/configuration.service";

const INIT_STORAGE_PREFIX = "dg-server-init-";

export function DataServiceInstructions() {
  const [isConfigureDataSourceModalOpen, setConfigureDataSourceModal] = useState<boolean>(false);
  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const confirmSave = async () => {
    setConfigureDataSourceModal(false);

    if (projectKey) {
      const now = Date.now();
      localStorage.setItem(
        `${INIT_STORAGE_PREFIX}${projectKey}`,
        JSON.stringify({ initiatedAt: now }),
      );
      configurationService.initiateDataGatewayPipeline({ projectKey }).catch(() => {});
    }
  };

  return (
    <div className="space-y-4 overflow-hidden p-6">
      <p className="mb-5 text-2xl font-semibold">Data Gateway</p>

      <div className="">
        <p className="mb-7">{dataServiceInstructions.description}</p>

        <p className="mb-1">{dataServiceInstructions.note}</p>

        <ol className="list-decimal space-y-2 pl-5">
          {dataServiceInstructions.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>

        {/* <p className="mt-6 text-sm">
          Need help?{" "}
          <a href="" target="" rel="" className="text-blue-600 hover:underline">
            View full documentation
          </a>
        </p> */}

        <Button
          size="sm"
          className="mt-6 h-10 gap-2 px-4 py-1"
          onClick={() => setConfigureDataSourceModal(true)}
        >
          Configure
        </Button>

        <Dialog open={isConfigureDataSourceModalOpen} onOpenChange={setConfigureDataSourceModal}>
          <ConfigureDataSourceModal
            mode="create"
            onCancel={() => setConfigureDataSourceModal(false)}
            onConfirm={confirmSave}
          />
        </Dialog>
      </div>
    </div>
  );
}

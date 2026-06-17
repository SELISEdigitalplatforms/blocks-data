"use client";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { useState } from "react";
import { dataServiceInstructions } from "../constants/instructions";
import ConfigureDataSourceModal from "./configure-data-source";

export function DataServiceInstructions() {
  const [isConfigureDataSourceModalOpen, setConfigureDataSourceModal] =
    useState<boolean>(false);

  const confirmSave = async () => {
    setConfigureDataSourceModal(false);
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

        <Dialog
          open={isConfigureDataSourceModalOpen}
          onOpenChange={setConfigureDataSourceModal}
        >
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

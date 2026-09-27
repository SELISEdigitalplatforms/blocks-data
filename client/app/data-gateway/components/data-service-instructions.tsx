"use client";
import { Button } from "@/components/ui-kits/button/button";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { dataServiceInstructions } from "../constants/instructions";

export function DataServiceInstructions() {
  const openBlocksOsConfiguration = () =>
    window.open(
      `${getRuntimeEnv("BLOCKS_OS_BASE_URL")}/app/secret-management/data-gateway`,
      "_blank",
    );

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

        <Button
          size="sm"
          className="mt-6 h-10 gap-2 px-4 py-1"
          onClick={openBlocksOsConfiguration}
        >
          Configure
        </Button>
      </div>
    </div>
  );
}

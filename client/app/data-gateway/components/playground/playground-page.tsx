"use client";

import { Button } from "@/components/ui-kits/button/button";
import { cn } from "@/lib/utils";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { BookOpen, List, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  clearPlaygroundHandoff,
  peekPlaygroundHandoff,
  type PlaygroundHandoff,
} from "../../utils/playground-handoff";
import { CleanTestDataModal } from "../graphql-playground/clean-test-data-modal";
import { GraphQLWorkspace } from "../graphql-playground/graphql-playground-page";
import { RequestsDrawer } from "../rest-playground/requests-drawer";
import { requestToDraft, RestWorkspace, type RestDraft } from "../rest-playground/rest-workspace";
import { ProtocolSwitch, type Protocol } from "./protocol-switch";

type Incoming = { draft: RestDraft; nonce: number };
type InitialState = { tab: Protocol; incoming?: Incoming; initialQuery?: string };

/** REST is the default; a handoff selects the tab it names. */
const initialStateFrom = (handoff: PlaygroundHandoff | null): InitialState => {
  if (handoff?.protocol === "rest") return { tab: "rest", incoming: { draft: requestToDraft(handoff), nonce: 1 } };
  if (handoff?.protocol === "graphql") return { tab: "graphql", initialQuery: handoff.query };
  return { tab: "rest" };
};

/** The playground: one header with the REST | GraphQL switch, and both workspaces kept mounted. */
export function PlaygroundPage() {
  const { t } = useT("data.gateway.schema");

  // Peeked, not removed: a render React discards before mounting must not lose the handoff, and
  // StrictMode's second initialiser call sees the same value. It is cleared once, after mount.
  const [initial] = useState(() => initialStateFrom(peekPlaygroundHandoff()));
  useEffect(() => {
    clearPlaygroundHandoff();
  }, []);
  const [tab, setTab] = useState<Protocol>(initial.tab);
  const [incoming, setIncoming] = useState<Incoming | undefined>(initial.incoming);
  const [isCleanDataModalOpen, setIsCleanDataModalOpen] = useState(false);
  const [isSchemasDrawerOpen, setIsSchemasDrawerOpen] = useState(false);
  const [isRequestsDrawerOpen, setIsRequestsDrawerOpen] = useState(false);

  const handleUseRequest = (draft: RestDraft) =>
    setIncoming((previous) => ({ draft, nonce: (previous?.nonce ?? 0) + 1 }));

  return (
    <>
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-sm border border-border/40 bg-card">
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.05),transparent_55%)]" />

        {/* Top header */}
        <div className="relative flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-card/80 px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <svg viewBox="0 0 30 30" className="h-3.5 w-3.5 text-indigo-400" fill="currentColor">
                <path d="M4.08 22.864l-1.1-.636L15 .345l1.1.636zm-1.1 4.636L14.636 29.66l.636-1.1L3.616 26.4zm13.12 0L27.746 29.1l.636 1.1L16.736 28.4zm4.636-4.636l1.1.636L29.46 6.636 28.36 6zm-5.82-20.03l-.636-1.1L1.1 7.924l.636 1.1zM.5 9.636l-.636 1.1 11.63 6.72.636-1.1zm27.364 7.82l.636-1.1L16.87 9.636l-.636 1.1zm-13.82 6.1l1.274.012.012-13.82-1.274-.012z" />
                <circle cx="15" cy="1.833" r="2.5" />
                <circle cx="28.667" cy="9.5" r="2.5" />
                <circle cx="28.667" cy="20.5" r="2.5" />
                <circle cx="15" cy="28.167" r="2.5" />
                <circle cx="1.333" cy="20.5" r="2.5" />
                <circle cx="1.333" cy="9.5" r="2.5" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-foreground">{t("PLAYGROUND_PAGE.TITLE")}</h2>
            <ProtocolSwitch value={tab} onChange={setTab} />
          </div>
          <div className="flex items-center gap-2">
            {/* `outline` rather than `ghost`: ghost has no resting border or
                background of its own, only a hover state, so paired with
                muted text it read as a disabled control until the cursor
                found it — same fix as the validation panel's empty-state CTA. */}
            {tab === "rest" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsRequestsDrawerOpen(true)}
                className="h-7 gap-1.5 px-3 text-xs text-muted-foreground hover:border-border hover:text-foreground"
              >
                <List className="h-3.5 w-3.5" />
                {t("PLAYGROUND_PAGE.REQUESTS")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSchemasDrawerOpen(true)}
                className="h-7 gap-1.5 px-3 text-xs text-muted-foreground hover:border-border hover:text-foreground"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {t("GRAPHQL_PLAYGROUND_PAGE.SCHEMAS")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCleanDataModalOpen(true)}
              className="h-7 gap-1.5 px-3 text-xs text-muted-foreground hover:border-rose-500/30 hover:text-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("GRAPHQL_PLAYGROUND_PAGE.CLEAN_TEST_DATA")}
            </Button>
          </div>
        </div>

        {/* Both stay mounted so each keeps its draft and last response across switches. */}
        <div className={cn("relative flex min-h-0 flex-1 flex-col", tab !== "rest" && "hidden")}>
          <RestWorkspace incoming={incoming} />
        </div>
        <div className={cn("relative flex min-h-0 flex-1 flex-col", tab !== "graphql" && "hidden")}>
          <GraphQLWorkspace
            initialQuery={initial.initialQuery}
            schemasOpen={isSchemasDrawerOpen}
            onSchemasOpenChange={setIsSchemasDrawerOpen}
          />
        </div>
      </div>

      <CleanTestDataModal open={isCleanDataModalOpen} onOpenChange={setIsCleanDataModalOpen} />
      <RequestsDrawer
        open={isRequestsDrawerOpen}
        onOpenChange={setIsRequestsDrawerOpen}
        onUseRequest={handleUseRequest}
      />
    </>
  );
}

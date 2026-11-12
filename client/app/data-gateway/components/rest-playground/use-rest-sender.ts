import { useCallback, useEffect, useRef, useState } from "react";
import type { PathRefusal } from "../../rest/path-guard";
import { RestPathError, sendRestRequest, type RestRequest, type RestResponse } from "../../rest/rest-client";

type RestSender = {
  response: RestResponse | null;
  isSending: boolean;
  /** Sends `req`, aborting any send still out. `onPathRefusal` runs when the client refuses the path. */
  send: (req: RestRequest, onPathRefusal: (refusal: PathRefusal) => void) => Promise<void>;
  /** Aborts the send still out and shows it as cancelled. */
  cancel: () => void;
  /** Aborts the send still out quietly: the previous response stays and its late result is ignored. */
  abandon: () => void;
};

/**
 * Sends REST requests one at a time. Each send is numbered and the result of any send that a later send, Cancel or
 * abandon superseded is ignored, even one that ignores its abort (as one in the middle of a 401 refresh can).
 */
export function useRestSender(): RestSender {
  const [response, setResponse] = useState<RestResponse | null>(null);
  const [isSending, setIsSending] = useState(false);
  const sendSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  // On unmount, abort the send still out and supersede it, so one that ignores its abort sets no state.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      sendSeq.current += 1;
    },
    [],
  );

  const send = useCallback(async (req: RestRequest, onPathRefusal: (refusal: PathRefusal) => void) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const seq = ++sendSeq.current;
    setIsSending(true);

    let result: RestResponse;
    try {
      result = await sendRestRequest(req, controller.signal);
    } catch (error) {
      if (seq !== sendSeq.current) return;
      inFlight.current = null;
      setIsSending(false);
      // sendRestRequest throws only RestPathError; anything else is shown as no response, never left unhandled.
      if (error instanceof RestPathError) onPathRefusal(error.refusal);
      else setResponse({ kind: "no-response", reason: String(error), durationMs: 0 });
      return;
    }
    // A later send, Cancel or abandon superseded this one.
    if (seq !== sendSeq.current) return;
    inFlight.current = null;
    setResponse(result);
    setIsSending(false);
  }, []);

  const abandon = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    sendSeq.current += 1;
    setIsSending(false);
  }, []);

  const cancel = useCallback(() => {
    abandon();
    setResponse({ kind: "aborted" });
  }, [abandon]);

  return { response, isSending, send, cancel, abandon };
}

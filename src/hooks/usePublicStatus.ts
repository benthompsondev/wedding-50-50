import { useCallback, useEffect, useRef, useState } from "react";
import {
  getInitialBackendReadiness,
  isLaunchReady,
  type BackendReadiness,
  type PublicStatus,
} from "../lib/lottery";
import { fetchPublicStatus } from "../services/weddingDrawApi";

type PublicStatusOptions = {
  closingDate: string;
  drawDate: string;
  endpoint: string;
};

export function usePublicStatus({ closingDate, drawDate, endpoint }: PublicStatusOptions) {
  const configurationReady = isLaunchReady(closingDate, drawDate, endpoint);
  const [publicStatus, setPublicStatus] = useState<PublicStatus | null>(null);
  const [backendReadiness, setBackendReadiness] = useState<BackendReadiness>(() =>
    getInitialBackendReadiness(closingDate, drawDate, endpoint),
  );
  const requestInFlight = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const hasValidStatus = useRef(false);
  const postSubmitTimer = useRef<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!configurationReady || requestInFlight.current) return;

    requestInFlight.current = true;
    const controller = new AbortController();
    abortController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const status = await fetchPublicStatus(endpoint.trim(), controller.signal);
      hasValidStatus.current = true;
      setPublicStatus(status);
      setBackendReadiness("ready");
    } catch (error) {
      if (!controller.signal.aborted && !hasValidStatus.current) {
        setPublicStatus(null);
        setBackendReadiness("unavailable");
      }
      if (import.meta.env.DEV && !controller.signal.aborted) {
        console.warn("Wedding 50/50 backend health check failed.", error);
      }
    } finally {
      window.clearTimeout(timeout);
      if (abortController.current === controller) abortController.current = null;
      requestInFlight.current = false;
    }
  }, [configurationReady, endpoint]);

  const refreshAfterSubmission = useCallback((): void => {
    void refresh();
    if (postSubmitTimer.current !== null) window.clearTimeout(postSubmitTimer.current);
    postSubmitTimer.current = window.setTimeout(() => {
      postSubmitTimer.current = null;
      void refresh();
    }, 3500);
  }, [refresh]);

  useEffect(() => {
    if (!configurationReady) return undefined;

    const initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const handleFocus = () => { void refresh(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      abortController.current?.abort();
      if (postSubmitTimer.current !== null) window.clearTimeout(postSubmitTimer.current);
    };
  }, [configurationReady, refresh]);

  useEffect(() => {
    if (import.meta.env.DEV && backendReadiness === "preview") {
      console.info("Wedding 50/50 preview mode is active locally.");
    }
  }, [backendReadiness]);

  return {
    backendReadiness,
    configurationReady,
    launchReady: configurationReady && backendReadiness === "ready",
    publicStatus,
    refreshAfterSubmission,
  };
}

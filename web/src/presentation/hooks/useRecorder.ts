"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startRecording, type RecorderHandle } from "@/infrastructure/audio/recorder";

type RecorderStatus = "idle" | "requesting" | "recording" | "denied" | "error";

export interface UseRecorder {
  status: RecorderStatus;
  level: number;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

/**
 * Thin React binding over the framework-free recorder adapter.
 * Keeps DOM/permission concerns out of components and the level meter on an
 * animation frame so it never triggers React re-renders per sample.
 */
export function useRecorder(): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const handleRef = useRef<RecorderHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  const pollLevel = useCallback(() => {
    if (!handleRef.current) return;
    setLevel(handleRef.current.getLevel());
    rafRef.current = requestAnimationFrame(pollLevel);
  }, []);

  const start = useCallback(async () => {
    setStatus("requesting");
    const res = await startRecording();
    if (!res.ok) {
      setStatus(res.error.code === "mic/denied" ? "denied" : "error");
      return;
    }
    handleRef.current = res.value;
    setStatus("recording");
    rafRef.current = requestAnimationFrame(pollLevel);
  }, [pollLevel]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const handle = handleRef.current;
    if (!handle) return null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    handle.stop();
    const res = await handle.result;
    handleRef.current = null;
    setStatus("idle");
    setLevel(0);
    return res.ok ? res.value : null;
  }, []);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    handleRef.current?.cancel();
    handleRef.current = null;
    setStatus("idle");
    setLevel(0);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { status, level, start, stop, cancel };
}

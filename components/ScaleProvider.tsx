"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ScaleReading = {
  scale_source: string;
  weight: number;
  unit?: string;
  stable?: boolean;
  receivedAt: number;
};

type ScaleContextValue = {
  readings: Record<string, ScaleReading>;
  connected: boolean;
  socketUrl: string;
  selectedScale: string;
  selectedReading: ScaleReading | null;
  setSocketUrl: (url: string) => void;
  setSelectedScale: (source: string) => void;
  reconnect: () => void;
};

const ScaleContext = createContext<ScaleContextValue | null>(null);
const DEFAULT_URL = "ws://127.0.0.1:8765";

export function ScaleProvider({ children }: { children: React.ReactNode }) {
  const [readings, setReadings] = useState<Record<string, ScaleReading>>({});
  const [connected, setConnected] = useState(false);
  const [socketUrl, setSocketUrlState] = useState(DEFAULT_URL);
  const [selectedScale, setSelectedScaleState] = useState("");
  const [generation, setGeneration] = useState(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedUrl = window.localStorage.getItem("scaleBridgeUrl");
    const savedScale = window.localStorage.getItem("selectedScaleSource");
    if (savedUrl) setSocketUrlState(savedUrl);
    if (savedScale) setSelectedScaleState(savedScale);
  }, []);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(socketUrl);
        ws.onopen = () => setConnected(true);
        ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(String(event.data));
            const source = String(packet.scale_source || "").trim();
            const weight = Number(packet.weight);
            if (!source || !Number.isFinite(weight)) return;
            const reading: ScaleReading = {
              scale_source: source,
              weight,
              unit: typeof packet.unit === "string" ? packet.unit : "kg",
              stable: packet.stable !== false,
              receivedAt: Date.now(),
            };
            setReadings((prev) => ({ ...prev, [source]: reading }));
            setSelectedScaleState((current) => {
              if (current) return current;
              window.localStorage.setItem("selectedScaleSource", source);
              return source;
            });
          } catch {
            // Ignore malformed bridge packets; never push them into money/stock fields.
          }
        };
        ws.onerror = () => setConnected(false);
        ws.onclose = () => {
          setConnected(false);
          if (!closed) retryRef.current = setTimeout(connect, 2500);
        };
      } catch {
        setConnected(false);
        retryRef.current = setTimeout(connect, 2500);
      }
    };
    connect();
    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      ws?.close();
    };
  }, [socketUrl, generation]);

  const setSocketUrl = useCallback((url: string) => {
    const clean = url.trim() || DEFAULT_URL;
    window.localStorage.setItem("scaleBridgeUrl", clean);
    setSocketUrlState(clean);
  }, []);
  const setSelectedScale = useCallback((source: string) => {
    window.localStorage.setItem("selectedScaleSource", source);
    setSelectedScaleState(source);
  }, []);
  const selectedReading = selectedScale ? readings[selectedScale] || null : null;
  const value = useMemo(
    () => ({ readings, connected, socketUrl, selectedScale, selectedReading, setSocketUrl, setSelectedScale, reconnect: () => setGeneration((v) => v + 1) }),
    [readings, connected, socketUrl, selectedScale, selectedReading, setSocketUrl, setSelectedScale]
  );
  return <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>;
}

export function useScale() {
  const value = useContext(ScaleContext);
  if (!value) throw new Error("useScale must be used inside ScaleProvider");
  return value;
}


// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";

// Datos que llegan del servidor (eventos del Hub)
type ScreenSnapshot = {
  users: string[];
  count: number;
  screenKey?: string;
};

export default function App() {
  const [snapshot, setSnapshot] = useState<ScreenSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UserId numérico para que el backend persista (int.TryParse)
  const [userId, setUserId] = useState(() => String(Math.floor(Math.random() * 1000)));
  const [idTabla, setIdTabla] = useState<number | undefined>(undefined);
  const [idEntidad, setIdEntidad] = useState<number | undefined>(undefined);
  const [displayName, setDisplayName] = useState("Demo");
  const [screenKey, setScreenKey] = useState("lab");

  const connRef = useRef<signalR.HubConnection | null>(null);

  const hubUrl = useMemo(() => {
    const base = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, "") ?? "https://localhost:7182";
    return `${base}/hubs/presence`;
  }, []);

  useEffect(() => {
    if (!hubUrl || !screenKey || !userId) return;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl /*, { withCredentials: true } */)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connRef.current = conn;
    conn.serverTimeoutInMilliseconds = 120_000;

    // Listeners del Hub
    conn.on("screenSnapshot", (s: ScreenSnapshot) => {
      console.log("snapshot", s);
      setSnapshot(s);
    });
    conn.on("screenPresence", (s: ScreenSnapshot) => {
      console.log("presence", s);
      setSnapshot(s);
    });

    conn.onreconnected(() => {
      console.log("Reconectado. Re-Join con meta…");
      conn.invoke("JoinScreen", screenKey, userId, displayName, idTabla ?? null, idEntidad ?? null).catch(console.error);
    });

    conn.onclose((e?: Error) => {
      setConnected(false);
      console.error("Conexión cerrada:", e);
      setError(e ? e.message : "La conexión se cerró inesperadamente.");
    });

    let heartbeatInterval: number | null = null;

    conn
      .start()
      .then(() => {
        setConnected(true);
        setError(null);
        console.log(
          `Join '${screenKey}' uid='${userId}' display='${displayName}' idTabla=${idTabla ?? "null"} idEntidad=${
            idEntidad ?? "null"
          }`
        );

        // Envío inicial (Join)
        conn.invoke("JoinScreen", screenKey, userId, displayName, idTabla ?? null, idEntidad ?? null).catch(console.error);

        // Heartbeat cada 15s con los mismos metadatos
        heartbeatInterval = window.setInterval(() => {
          if (conn.state === signalR.HubConnectionState.Connected) {
            console.log("Heartbeat…");
            conn.invoke("ScreenHeartbeat", screenKey, userId, idTabla ?? null, idEntidad ?? null).catch(console.error);
          }
        }, 15_000);
      })
      .catch((e: Error) => setError(e?.message ?? "Error al conectar con el servidor."));

    // Cleanup
    return () => {
      console.log(`Cleanup '${screenKey}'…`);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (conn.state === signalR.HubConnectionState.Connected) {
        conn.invoke("LeaveScreen", screenKey, userId, idTabla ?? null, idEntidad ?? null).catch(console.error);
      }
      conn.stop().then(() => console.log("Conexión detenida.")).catch(console.error);
    };
    // 👇 Importante: incluir idTabla/idEntidad para re-join con nuevos valores
  }, [hubUrl, screenKey, userId, displayName, idTabla, idEntidad]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 900 }}>
      <h1>Estado de Presencia (SignalR + React)</h1>
      <p>
        Estado: {connected ? "Conectado ✅" : "Desconectado ⛔"}{" "}
        {error && <span style={{ color: "crimson" }}>({error})</span>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(240px, 1fr))", gap: 12, margin: "1rem 0" }}>
        <label>
          Screen Key:
          <input value={screenKey} onChange={(e) => setScreenKey(e.target.value)} />
        </label>

        <label>
          User ID (numérico):
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>

        <label>
          Display Name:
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>

        <label>
          IdTabla:
          <input
            type="number"
            value={idTabla ?? ""}
            onChange={(e) => setIdTabla(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </label>

        <label>
          IdEntidad:
          <input
            type="number"
            value={idEntidad ?? ""}
            onChange={(e) => setIdEntidad(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </label>
      </div>

      <pre style={{ backgroundColor: "#1e1e1e", color: "lime", padding: 12, borderRadius: 8, minHeight: 160 }}>
        {JSON.stringify(snapshot, null, 2) || "Esperando datos del servidor..."}
      </pre>
    </div>
  );
}

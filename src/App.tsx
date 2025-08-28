import React, { useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";

// 1. Definimos un tipo para los datos que recibimos del servidor.
// Esto elimina los errores de 'any' implícito.
type ScreenSnapshot = {
    users: string[];
    count: number;
    screenKey?: string;
};

export default function App() {
    // 2. Usamos el tipo 'ScreenSnapshot' para dar tipado al estado.
    const [snapshot, setSnapshot] = useState<ScreenSnapshot | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

  // antes: `u_${Math.floor(Math.random() * 1000)}`
const [userId, setUserId] = useState(() => String(Math.floor(Math.random() * 1000)));

    const [displayName, setDisplayName] = useState("Demo");
    const [screenKey, setScreenKey] = useState("lab");

    // 3. Tipamos la referencia para que sepa que contendrá una HubConnection de SignalR.
    const connRef = useRef<signalR.HubConnection | null>(null);

    const hubUrl = useMemo(() => {
        // Asumimos que estás usando Vite. Si no, reemplaza esto con la URL de tu backend.
        const base = (import.meta.env.VITE_API_URL as string)?.replace(/\/$/, "") ?? "http://localhost:5000";
        return `${base}/hubs/presence`;
    }, []);

    useEffect(() => {
        if (!hubUrl || !screenKey || !userId) return;

        const conn = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl)
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();

        connRef.current = conn;
        conn.serverTimeoutInMilliseconds = 120_000;

        // 4. Añadimos el tipo 'ScreenSnapshot' a los parámetros de los listeners.
        conn.on("screenSnapshot", (s: ScreenSnapshot) => { console.log("snapshot", s); setSnapshot(s); });
        conn.on("screenPresence", (s: ScreenSnapshot) => { console.log("presence", s); setSnapshot(s); });

        conn.onreconnected(() => {
            console.log("Reconectado. Volviendo a unirse a la pantalla...");
            if (connRef.current) {
                connRef.current.invoke("JoinScreen", screenKey, userId, displayName).catch(console.error);
            }
        });

        // 5. Añadimos el tipo 'Error' al parámetro del listener 'onclose'.
        conn.onclose((e?: Error) => {
            setConnected(false);
            console.error("Conexión cerrada:", e);
            setError(e ? e.message : "La conexión se cerró inesperadamente.");
        });

        let heartbeatInterval: number | null = null;

        conn.start()
            .then(() => {
                setConnected(true);
                setError(null);
                console.log(`Uniéndose a la pantalla '${screenKey}' como '${userId}'`);
                conn.invoke("JoinScreen", screenKey, userId, displayName);

                heartbeatInterval = window.setInterval(() => {
                    if (conn.state === signalR.HubConnectionState.Connected) {
                        console.log("Enviando heartbeat...");
                        conn.invoke("ScreenHeartbeat", screenKey, userId).catch(console.error);
                    }
                }, 15_000);
            })
            .catch((e: Error) => setError(e?.message ?? "Error al conectar con el servidor."));

        return () => {
            console.log(`Limpiando conexión para la pantalla '${screenKey}'...`);
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            if (conn.state === signalR.HubConnectionState.Connected) {
                conn.invoke("LeaveScreen", screenKey, userId).catch(console.error);
            }
            conn.stop().then(() => console.log("Conexión detenida.")).catch(console.error);
        };
    }, [hubUrl, screenKey, userId, displayName]);

    return (
        <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 720 }}>
            <h1>Estado de Presencia (SignalR + React)</h1>
            <p>
                Estado: {connected ? "Conectado ✅" : "Desconectado ⛔"}{" "}
                {error && <span style={{ color: "crimson" }}>({error})</span>}
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "1rem 0" }}>
                <label>Screen Key: <input value={screenKey} onChange={(e) => setScreenKey(e.target.value)} /></label>
                <label>User ID: <input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
                <label>Display Name: <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
            </div>

            <pre style={{ backgroundColor: "#1e1e1e", color: "lime", padding: 12, borderRadius: 8 }}>
                {JSON.stringify(snapshot, null, 2) || "Esperando datos del servidor..."}
            </pre>
        </div>
    );
}

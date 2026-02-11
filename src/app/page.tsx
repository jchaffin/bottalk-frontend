"use client";

import { useState } from "react";
import { startConversation, stopConversation } from "../lib/api";
import CallProvider from "../components/CallProvider";

export default function Home() {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const { roomUrl, token } = await startConversation();
      setRoomUrl(roomUrl);
      setToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await stopConversation();
    } catch {
      // Don't care if the backend call fails — always tear down the UI
    } finally {
      setRoomUrl(null);
      setToken(null);
      setStopping(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12 gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-1">
          Sales Conversation
        </h1>
        <p className="text-sm text-gray-500">
          Sarah (sales rep) &amp; Mike (customer)
        </p>
      </div>

      {/* Active call */}
      {roomUrl && token ? (
        <>
          <CallProvider
            roomUrl={roomUrl}
            token={token}
            onLeave={() => {
              setRoomUrl(null);
              setToken(null);
            }}
          />
          <button
            onClick={handleStop}
            disabled={stopping}
            className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
          >
            {stopping ? "Stopping..." : "Stop Conversation"}
          </button>
        </>
      ) : (
        /* Start button */
        <button
          onClick={handleStart}
          disabled={loading}
          className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
        >
          {loading ? "Starting..." : "Start Conversation"}
        </button>
      )}

      {error && (
        <p className="text-red-400 text-sm">
          {error}
        </p>
      )}
    </main>
  );
}

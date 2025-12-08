import { useState, useEffect, useCallback, useRef } from "react";
import { InspectorConfig } from "../configurationTypes";
import { getMCPProxyAuthToken, getMCPProxyAddress } from "@/utils/configUtils";

/**
 * Captured HTTP transaction from the proxy server
 */
export interface CapturedTransaction {
  id: string;
  timestamp: number;
  sessionId?: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  statusCode: number;
  statusText: string;
  duration: number;
}

interface UseHttpTransactionsReturn {
  transactions: CapturedTransaction[];
  loading: boolean;
  error: string | null;
  clearTransactions: () => Promise<void>;
}

/**
 * Hook to receive real-time HTTP transactions from the proxy server via SSE.
 * These are the actual HTTP requests/responses between proxy and MCP server.
 */
export function useHttpTransactions(
  config: InspectorConfig,
): UseHttpTransactionsReturn {
  const [transactions, setTransactions] = useState<CapturedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const { token: proxyAuthToken, header: proxyAuthTokenHeader } =
      getMCPProxyAuthToken(config);
    const headers: HeadersInit = {};
    if (proxyAuthToken) {
      headers[proxyAuthTokenHeader] = `Bearer ${proxyAuthToken}`;
    }
    return headers;
  }, [config]);

  // Fetch initial transactions
  const fetchTransactions = useCallback(async () => {
    try {
      const baseUrl = getMCPProxyAddress(config);
      const response = await fetch(`${baseUrl}/transactions`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const data = await response.json();
      setTransactions(data.transactions || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [config, getAuthHeaders]);

  // Clear all transactions
  const clearTransactions = useCallback(async () => {
    try {
      const baseUrl = getMCPProxyAddress(config);
      const response = await fetch(`${baseUrl}/transactions`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to clear transactions: ${response.statusText}`);
      }

      setTransactions([]);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }, [config, getAuthHeaders]);

  // Set up SSE connection for real-time updates
  useEffect(() => {
    // Fetch initial data
    fetchTransactions();

    // Set up SSE stream
    const baseUrl = getMCPProxyAddress(config);
    const { token: proxyAuthToken } = getMCPProxyAuthToken(config);

    // EventSource doesn't support custom headers, so we need to use fetch-based SSE
    // or pass token as query param (less secure but necessary for EventSource)
    let streamUrl = `${baseUrl}/transactions/stream`;
    if (proxyAuthToken) {
      streamUrl += `?token=${encodeURIComponent(proxyAuthToken)}`;
    }

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("📡 Connected to transaction stream");
          return;
        }

        // This is a new transaction
        setTransactions((prev) => {
          // Check for duplicates
          if (prev.some((t) => t.id === data.id)) {
            return prev;
          }
          // Keep only the last 100 transactions
          const updated = [...prev, data];
          if (updated.length > 100) {
            updated.shift();
          }
          return updated;
        });
      } catch (err) {
        console.error("Error parsing transaction event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Transaction stream error:", err);
      setError("Lost connection to transaction stream");
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [config, fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    clearTransactions,
  };
}

import { useState, useEffect, useCallback } from "react";
import { InspectorConfig } from "../configurationTypes";
import { getMCPProxyAuthToken, getMCPProxyAddress } from "@/utils/configUtils";

/**
 * An indexed resource discovered from MCP tool responses
 */
export interface IndexedResource {
  entryId: string;
  id: string;
  type: "uuid" | "numeric" | "path" | "slug" | "unknown";
  /** The key/field name that held this value */
  fieldName: string;
  fieldPath: string;
  /** Parent object context - nearby fields for automation context */
  parentContext: Record<string, unknown>;
  discoveredByTool: string;
  discoveredFromUser: string;
  discoveredFromUserName: string;
  userColorTag: string;
  timestamp: number;
}

interface UseResourceIndexReturn {
  resources: IndexedResource[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearResources: () => Promise<void>;
  getResourcesByUser: (userId: string) => IndexedResource[];
}

/**
 * Hook to fetch and manage indexed resources from the server.
 * Resources are object IDs discovered from MCP tool responses.
 */
export function useResourceIndex(
  config: InspectorConfig,
): UseResourceIndexReturn {
  const [resources, setResources] = useState<IndexedResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const { token: proxyAuthToken, header: proxyAuthTokenHeader } =
      getMCPProxyAuthToken(config);
    const headers: HeadersInit = {};
    if (proxyAuthToken) {
      headers[proxyAuthTokenHeader] = `Bearer ${proxyAuthToken}`;
    }
    return headers;
  }, [config]);

  // Fetch resources from server
  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      const baseUrl = getMCPProxyAddress(config);
      const response = await fetch(`${baseUrl}/analysis/resources`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch resources: ${response.statusText}`);
      }

      const data = await response.json();
      setResources(data.resources || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [config, getAuthHeaders]);

  // Clear all resources
  const clearResources = useCallback(async () => {
    try {
      const baseUrl = getMCPProxyAddress(config);
      const response = await fetch(`${baseUrl}/analysis/resources`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to clear resources: ${response.statusText}`);
      }

      setResources([]);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }, [config, getAuthHeaders]);

  // Get resources by user (client-side filter)
  const getResourcesByUser = useCallback(
    (userId: string): IndexedResource[] => {
      return resources.filter((r) => r.discoveredFromUser === userId);
    },
    [resources],
  );

  // Fetch on mount and set up polling for updates
  useEffect(() => {
    fetchResources();

    // Poll for updates every 2 seconds
    const pollInterval = setInterval(fetchResources, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchResources]);

  return {
    resources,
    loading,
    error,
    refresh: fetchResources,
    clearResources,
    getResourcesByUser,
  };
}

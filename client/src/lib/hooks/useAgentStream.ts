/**
 * Hook for connecting to the agent SSE stream
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getMCPProxyAddress } from "../../utils/configUtils";
import { InspectorConfig } from "../configurationTypes";

export type AgentStatus = "idle" | "running" | "paused" | "completed" | "error";
export type LLMProvider = "claude" | "gemini" | "openai";

export interface FlaggedTool {
  toolName: string;
  missingParams: string[];
  reason: string;
  nodeId: string;
}

export interface ExecutionStep {
  toolName: string;
  nodeId: string;
  parameters: Record<string, unknown>;
  parameterSources: Record<string, string>;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: unknown;
  error?: string;
  timestamp: number;
  depth: number;
}

export interface ResourceNode {
  id: string;
  type: "tool" | "resource";
  name: string;
  data: Record<string, unknown>;
  timestamp: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface ResourceEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  paramName: string;
}

export interface VisualizationData {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface DependencyAnalysis {
  tool: string;
  requiredParams: string[];
  canExecuteWithoutContext: boolean;
  suggestedOrder: number;
  dependencies: Array<{
    paramName: string;
    sourceTool: string;
    sourceField: string;
    confidence: number;
  }>;
}

export interface AgentState {
  status: AgentStatus;
  toolsDiscovered: ToolInfo[];
  dependencyAnalysis: DependencyAnalysis[];
  executionHistory: ExecutionStep[];
  currentStep: number;
  currentDepth: number;
  maxDepth: number;
  flaggedTools: FlaggedTool[];
  resourceGraph: VisualizationData;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface AgentEvent {
  type:
    | "status_change"
    | "tool_start"
    | "tool_complete"
    | "tool_failed"
    | "tool_skipped"
    | "analysis_complete"
    | "agent_complete"
    | "error"
    | "state";
  data: unknown;
  timestamp: number;
}

const INITIAL_STATE: AgentState = {
  status: "idle",
  toolsDiscovered: [],
  dependencyAnalysis: [],
  executionHistory: [],
  currentStep: 0,
  currentDepth: 0,
  maxDepth: 10,
  flaggedTools: [],
  resourceGraph: { nodes: [], edges: [] },
};

export function useAgentStream(config: InspectorConfig, bearerToken: string) {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("agent_api_key") || "";
  });
  const [provider, setProvider] = useState<LLMProvider>(() => {
    return (localStorage.getItem("agent_provider") as LLMProvider) || "gemini";
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const proxyAddress = getMCPProxyAddress(config);

  // Save API key to localStorage when it changes
  const updateApiKey = useCallback((key: string) => {
    setApiKey(key);
    localStorage.setItem("agent_api_key", key);
  }, []);

  // Save provider to localStorage when it changes
  const updateProvider = useCallback((p: LLMProvider) => {
    setProvider(p);
    localStorage.setItem("agent_provider", p);
  }, []);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${proxyAddress}/agent/stream?token=${bearerToken}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const agentEvent: AgentEvent = JSON.parse(event.data);

        // Handle state event (initial state or full update)
        if (agentEvent.type === "state") {
          setState(agentEvent.data as AgentState);
          return;
        }

        // Add to events list
        setEvents((prev) => [...prev.slice(-99), agentEvent]);

        // Update state based on event type
        switch (agentEvent.type) {
          case "status_change":
            setState((prev) => ({
              ...prev,
              status: (agentEvent.data as { status: AgentStatus }).status,
            }));
            break;
          case "analysis_complete":
            const analysis = agentEvent.data as {
              tools: number;
              analysis: DependencyAnalysis[];
            };
            setState((prev) => ({
              ...prev,
              dependencyAnalysis: analysis.analysis,
            }));
            break;
          case "tool_start":
            // Fetch latest state
            fetchStatus();
            break;
          case "tool_complete":
          case "tool_failed":
          case "tool_skipped":
          case "agent_complete":
            // Fetch latest state
            fetchStatus();
            break;
          case "error":
            setState((prev) => ({
              ...prev,
              status: "error",
              error: (agentEvent.data as { error: string }).error,
            }));
            break;
        }
      } catch (err) {
        console.error("Failed to parse agent event:", err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;
  }, [proxyAddress, bearerToken]);

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${proxyAddress}/agent/status`, {
        headers: {
          "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
        },
      });
      if (response.ok) {
        const status = await response.json();
        setState(status);
      }
    } catch (err) {
      console.error("Failed to fetch agent status:", err);
    }
  }, [proxyAddress, bearerToken]);

  // Configure the agent
  const configure = useCallback(
    async (sessionId: string) => {
      if (!apiKey) {
        throw new Error("API key is required");
      }

      const response = await fetch(`${proxyAddress}/agent/configure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ apiKey, provider, sessionId, maxDepth: 10 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to configure agent");
      }

      setIsConfigured(true);
      return response.json();
    },
    [proxyAddress, bearerToken, apiKey, provider],
  );

  // Start agent execution
  const start = useCallback(async () => {
    const response = await fetch(`${proxyAddress}/agent/start`, {
      method: "POST",
      headers: {
        "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to start agent");
    }

    return response.json();
  }, [proxyAddress, bearerToken]);

  // Pause agent execution
  const pause = useCallback(async () => {
    const response = await fetch(`${proxyAddress}/agent/pause`, {
      method: "POST",
      headers: {
        "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to pause agent");
    }

    return response.json();
  }, [proxyAddress, bearerToken]);

  // Resume agent execution
  const resume = useCallback(async () => {
    const response = await fetch(`${proxyAddress}/agent/resume`, {
      method: "POST",
      headers: {
        "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to resume agent");
    }

    return response.json();
  }, [proxyAddress, bearerToken]);

  // Stop agent execution
  const stop = useCallback(async () => {
    const response = await fetch(`${proxyAddress}/agent/stop`, {
      method: "POST",
      headers: {
        "X-MCP-Proxy-Auth": `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to stop agent");
    }

    return response.json();
  }, [proxyAddress, bearerToken]);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    setEvents([]);
    setIsConfigured(false);
  }, []);

  // Auto-connect when component mounts
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    state,
    events,
    isConnected,
    isConfigured,
    apiKey,
    provider,
    updateApiKey,
    updateProvider,
    configure,
    start,
    pause,
    resume,
    stop,
    clearEvents,
    reset,
    fetchStatus,
  };
}

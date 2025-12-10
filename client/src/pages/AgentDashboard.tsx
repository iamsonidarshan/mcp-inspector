/**
 * Agent Dashboard - Autonomous MCP Tool Execution UI
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Pause,
  Square,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import {
  useAgentStream,
  AgentState,
  ExecutionStep,
  FlaggedTool,
  AgentEvent,
  LLMProvider,
} from "@/lib/hooks/useAgentStream";
import { InspectorConfig } from "@/lib/configurationTypes";
import ResourceGraphViewer from "../components/ResourceGraphViewer";

interface AgentDashboardProps {
  config: InspectorConfig;
  bearerToken: string;
  sessionId: string | null;
}

const StatusBadge = ({ status }: { status: AgentState["status"] }) => {
  const styles: Record<
    AgentState["status"],
    { bg: string; text: string; icon: React.ReactNode }
  > = {
    idle: {
      bg: "bg-gray-100 dark:bg-gray-800",
      text: "text-gray-600 dark:text-gray-400",
      icon: <Clock className="w-3 h-3" />,
    },
    running: {
      bg: "bg-blue-100 dark:bg-blue-900",
      text: "text-blue-600 dark:text-blue-400",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    paused: {
      bg: "bg-yellow-100 dark:bg-yellow-900",
      text: "text-yellow-600 dark:text-yellow-400",
      icon: <Pause className="w-3 h-3" />,
    },
    completed: {
      bg: "bg-green-100 dark:bg-green-900",
      text: "text-green-600 dark:text-green-400",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    error: {
      bg: "bg-red-100 dark:bg-red-900",
      text: "text-red-600 dark:text-red-400",
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const style = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const ExecutionStepCard = ({ step }: { step: ExecutionStep }) => {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<ExecutionStep["status"], string> = {
    pending: "border-gray-300 dark:border-gray-600",
    running: "border-blue-500 animate-pulse",
    completed: "border-green-500",
    failed: "border-red-500",
    skipped: "border-yellow-500",
  };

  const statusIcons: Record<ExecutionStep["status"], React.ReactNode> = {
    pending: <Clock className="w-4 h-4 text-gray-400" />,
    running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    failed: <XCircle className="w-4 h-4 text-red-500" />,
    skipped: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
  };

  return (
    <div
      className={`border-l-4 ${statusColors[step.status]} bg-white dark:bg-gray-900 rounded-r-lg p-4 shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {statusIcons[step.status]}
          <div>
            <h4 className="font-medium text-sm">{step.toolName}</h4>
            <span className="text-xs text-gray-500">Depth: {step.depth}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          <div>
            <span className="text-xs font-medium text-gray-500">
              Parameters:
            </span>
            <pre className="mt-1 text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto">
              {JSON.stringify(step.parameters, null, 2)}
            </pre>
          </div>
          {step.result && (
            <div>
              <span className="text-xs font-medium text-gray-500">Result:</span>
              <pre className="mt-1 text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-40">
                {JSON.stringify(step.result, null, 2).slice(0, 1000)}
                {JSON.stringify(step.result).length > 1000 && "..."}
              </pre>
            </div>
          )}
          {step.error && (
            <div>
              <span className="text-xs font-medium text-red-500">Error:</span>
              <pre className="mt-1 text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-600">
                {step.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FlaggedToolCard = ({ tool }: { tool: FlaggedTool }) => (
  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
          {tool.toolName}
        </h4>
        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
          {tool.reason}
        </p>
        <div className="mt-2">
          <span className="text-xs font-medium text-yellow-600">
            Missing parameters:
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {tool.missingParams.map((param) => (
              <span
                key={param}
                className="px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded text-xs"
              >
                {param}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const EventLog = ({ events }: { events: AgentEvent[] }) => (
  <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
    {events
      .slice()
      .reverse()
      .map((event, i) => (
        <div
          key={i}
          className="flex items-start gap-2 py-1 border-b border-gray-100 dark:border-gray-800"
        >
          <span className="text-gray-400 flex-shrink-0">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          <span
            className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
              event.type === "error"
                ? "bg-red-100 text-red-600"
                : event.type === "tool_complete"
                  ? "bg-green-100 text-green-600"
                  : event.type === "tool_failed"
                    ? "bg-red-100 text-red-600"
                    : "bg-gray-100 text-gray-600"
            }`}
          >
            {event.type}
          </span>
          <span className="text-gray-600 dark:text-gray-400 truncate">
            {typeof event.data === "string"
              ? event.data
              : JSON.stringify(event.data).slice(0, 100)}
          </span>
        </div>
      ))}
    {events.length === 0 && (
      <div className="text-gray-400 text-center py-4">No events yet</div>
    )}
  </div>
);

export default function AgentDashboard({
  config,
  bearerToken,
  sessionId,
}: AgentDashboardProps) {
  const {
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
  } = useAgentStream(config, bearerToken);

  const [showApiKey, setShowApiKey] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);

  const handleConfigure = async () => {
    if (!sessionId) {
      setConfigError("Connect to an MCP server first");
      return;
    }

    setIsConfiguring(true);
    setConfigError(null);

    try {
      await configure(sessionId);
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : "Configuration failed",
      );
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleStart = async () => {
    try {
      await start();
    } catch (err) {
      console.error("Failed to start agent:", err);
    }
  };

  const handlePause = async () => {
    try {
      await pause();
    } catch (err) {
      console.error("Failed to pause agent:", err);
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (err) {
      console.error("Failed to resume agent:", err);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (err) {
      console.error("Failed to stop agent:", err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Autonomous Agent</h2>
          <StatusBadge status={state.status} />
          <span
            className={`text-xs ${isConnected ? "text-green-500" : "text-red-500"}`}
          >
            {isConnected ? "● Connected" : "○ Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          {state.status === "idle" && isConfigured && (
            <Button onClick={handleStart} size="sm">
              <Play className="w-4 h-4 mr-1" /> Start
            </Button>
          )}

          {state.status === "running" && (
            <>
              <Button onClick={handlePause} variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
              <Button onClick={handleStop} variant="destructive" size="sm">
                <Square className="w-4 h-4 mr-1" /> Stop
              </Button>
            </>
          )}

          {state.status === "paused" && (
            <>
              <Button onClick={handleResume} size="sm">
                <Play className="w-4 h-4 mr-1" /> Resume
              </Button>
              <Button onClick={handleStop} variant="destructive" size="sm">
                <Square className="w-4 h-4 mr-1" /> Stop
              </Button>
            </>
          )}

          {(state.status === "completed" || state.status === "error") && (
            <Button onClick={reset} variant="outline" size="sm">
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Configuration Section (shown when not configured) */}
      {!isConfigured && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <Settings className="w-5 h-5 text-gray-500" />
            <div className="flex-1 space-y-3">
              {/* Provider Selection */}
              <div>
                <label className="text-sm font-medium">LLM Provider</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => updateProvider("gemini")}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      provider === "gemini"
                        ? "bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                    }`}
                  >
                    Gemini 2.0 Flash
                  </button>
                  <button
                    onClick={() => updateProvider("claude")}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      provider === "claude"
                        ? "bg-purple-100 border-purple-500 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                        : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                    }`}
                  >
                    Claude Sonnet
                  </button>
                </div>
              </div>

              {/* API Key Input */}
              <div>
                <label className="text-sm font-medium">
                  {provider === "gemini" ? "Gemini API Key" : "Claude API Key"}
                </label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => updateApiKey(e.target.value)}
                      placeholder={
                        provider === "gemini" ? "AIzaSy..." : "sk-ant-..."
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    onClick={handleConfigure}
                    disabled={!apiKey || isConfiguring || !sessionId}
                  >
                    {isConfiguring ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Configure"
                    )}
                  </Button>
                </div>
              </div>

              {configError && (
                <p className="text-sm text-red-500">{configError}</p>
              )}
              {!sessionId && (
                <p className="text-sm text-yellow-600">
                  Connect to an MCP server first
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="execution" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="execution">
              Execution ({state.executionHistory.length})
            </TabsTrigger>
            <TabsTrigger value="flagged">
              Flagged ({state.flaggedTools.length})
            </TabsTrigger>
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden p-4">
            <TabsContent
              value="execution"
              className="h-full overflow-y-auto m-0"
            >
              {state.executionHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <Play className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No tools executed yet</p>
                  <p className="text-sm mt-1">
                    Configure and start the agent to begin
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.executionHistory.map((step, i) => (
                    <ExecutionStepCard key={i} step={step} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="flagged" className="h-full overflow-y-auto m-0">
              {state.flaggedTools.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No flagged tools</p>
                  <p className="text-sm mt-1">
                    Tools that can't resolve parameters will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.flaggedTools.map((tool, i) => (
                    <FlaggedToolCard key={i} tool={tool} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="graph" className="h-full m-0">
              <ResourceGraphViewer data={state.resourceGraph} />
            </TabsContent>

            <TabsContent value="events" className="h-full m-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Real-time events</span>
                <Button variant="ghost" size="sm" onClick={clearEvents}>
                  Clear
                </Button>
              </div>
              <EventLog events={events} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Status Footer */}
      {state.status !== "idle" && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>
              Depth: {state.currentDepth}/{state.maxDepth}
            </span>
            <span>Tools discovered: {state.toolsDiscovered.length}</span>
            <span>
              Executed:{" "}
              {
                state.executionHistory.filter((s) => s.status === "completed")
                  .length
              }
            </span>
            {state.startTime && (
              <span>
                Duration:{" "}
                {((state.endTime || Date.now()) - state.startTime) / 1000}s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { useState } from "react";
import JsonView from "./JsonView";
import { Button } from "@/components/ui/button";
import { HistoryEntry, HttpHeaders } from "@/lib/types/historyEntry";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Network,
  ArrowRight,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CapturedTransaction } from "@/lib/hooks/useHttpTransactions";

/**
 * Component to render HTTP headers in a collapsible format
 */
const HeadersDisplay = ({
  headers,
  title,
  colorClass = "text-gray-600",
}: {
  headers?: HttpHeaders;
  title: string;
  colorClass?: string;
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!headers || Object.keys(headers).length === 0) {
    return null;
  }

  const headerCount = Object.keys(headers).length;

  return (
    <div className="mt-2 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
      <button
        className={`flex items-center gap-1 text-xs ${colorClass} hover:underline cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Network className="h-3 w-3" />
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">({headerCount})</span>
      </button>
      {expanded && (
        <div className="mt-1 bg-muted/50 rounded p-2 text-xs font-mono">
          {Object.entries(headers).map(([key, value]) => (
            <div key={key} className="flex gap-2 py-0.5">
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {key}:
              </span>
              <span className="text-gray-700 dark:text-gray-300 break-all">
                {/* Mask sensitive header values */}
                {key.toLowerCase() === "authorization" ||
                key.toLowerCase().includes("token") ||
                key.toLowerCase().includes("secret")
                  ? `${value.substring(0, 15)}${"•".repeat(
                      Math.min(value.length - 15, 20),
                    )}`
                  : value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Mask sensitive header values for display
 */
const maskSensitiveValue = (key: string, value: string) => {
  const sensitiveKeys = [
    "authorization",
    "token",
    "secret",
    "api-key",
    "apikey",
    "bearer",
  ];
  const isSensitive = sensitiveKeys.some((k) => key.toLowerCase().includes(k));
  if (isSensitive && value.length > 15) {
    return `${value.substring(0, 15)}${"•".repeat(Math.min(value.length - 15, 20))}`;
  }
  return value;
};

const HistoryAndNotifications = ({
  requestHistory,
  serverNotifications,
  httpTransactions,
  onClearHistory,
  onClearNotifications,
  onClearTransactions,
}: {
  requestHistory: HistoryEntry[];
  serverNotifications: ServerNotification[];
  httpTransactions?: CapturedTransaction[];
  onClearHistory?: () => void;
  onClearNotifications?: () => void;
  onClearTransactions?: () => void;
}) => {
  const [expandedRequests, setExpandedRequests] = useState<{
    [key: number]: boolean;
  }>({});
  const [expandedNotifications, setExpandedNotifications] = useState<{
    [key: number]: boolean;
  }>({});
  const [expandedTransactions, setExpandedTransactions] = useState<{
    [key: string]: boolean;
  }>({});

  const toggleRequestExpansion = (index: number) => {
    setExpandedRequests((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleNotificationExpansion = (index: number) => {
    setExpandedNotifications((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleTransactionExpansion = (id: string) => {
    setExpandedTransactions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300)
      return "text-green-600 dark:text-green-400";
    if (status >= 400 && status < 500)
      return "text-yellow-600 dark:text-yellow-400";
    if (status >= 500) return "text-red-600 dark:text-red-400";
    return "text-gray-600 dark:text-gray-400";
  };

  return (
    <div className="bg-card overflow-hidden flex h-full">
      {/* JSON-RPC History */}
      <div className="flex-1 overflow-y-auto p-4 border-r">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">History</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearHistory}
            disabled={requestHistory.length === 0}
          >
            Clear
          </Button>
        </div>
        {requestHistory.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No history yet
          </p>
        ) : (
          <ul className="space-y-3">
            {requestHistory
              .slice()
              .reverse()
              .map((entry, index) => {
                const actualIndex = requestHistory.length - 1 - index;
                const isExpanded = expandedRequests[actualIndex];
                let method = "unknown";
                try {
                  const parsed = JSON.parse(entry.request);
                  method = parsed.method || "unknown";
                } catch {
                  // ignore parse errors
                }

                return (
                  <li
                    key={entry.id || index}
                    className="text-sm text-foreground bg-secondary py-2 px-3 rounded"
                  >
                    {/* Header row */}
                    <div
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() => toggleRequestExpansion(actualIndex)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono">
                          {requestHistory.length - index}. {method}
                        </span>
                        {/* Transport type badge */}
                        {entry.transportType && (
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {entry.transportType}
                          </Badge>
                        )}
                        {/* Active profile indicator */}
                        {entry.activeProfileName && (
                          <Badge variant="secondary" className="text-xs">
                            {entry.activeProfileName}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {/* Timestamp */}
                        <span className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        {/* Duration */}
                        {entry.duration !== undefined && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            {formatDuration(entry.duration)}
                          </span>
                        )}
                        <span>{isExpanded ? "▼" : "▶"}</span>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <>
                        {/* Request Headers */}
                        <HeadersDisplay
                          headers={entry.requestHeaders}
                          title="Request Headers"
                          colorClass="text-blue-600 dark:text-blue-400"
                        />

                        {/* Request Body */}
                        <div className="mt-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-blue-600">
                              Request Body:
                            </span>
                          </div>
                          <JsonView
                            data={entry.request}
                            className="bg-background"
                          />
                        </div>

                        {/* Response Headers */}
                        {entry.response && (
                          <HeadersDisplay
                            headers={entry.responseHeaders}
                            title="Response Headers"
                            colorClass="text-green-600 dark:text-green-400"
                          />
                        )}

                        {/* Response Body */}
                        {entry.response && (
                          <div className="mt-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-green-600">
                                Response Body:
                              </span>
                            </div>
                            <JsonView
                              data={entry.response}
                              className="bg-background"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* HTTP Traffic - Actual proxy traffic */}
      <div className="flex-1 overflow-y-auto p-4 border-r">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-orange-500" />
            <h2 className="text-lg font-semibold">HTTP Traffic</h2>
            {httpTransactions && httpTransactions.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {httpTransactions.length}
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearTransactions}
            disabled={!httpTransactions || httpTransactions.length === 0}
          >
            Clear
          </Button>
        </div>
        {!httpTransactions || httpTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm italic">No HTTP traffic captured yet</p>
            <p className="text-xs mt-1">Connect to see actual proxy traffic</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {httpTransactions
              .slice()
              .reverse()
              .map((tx, index) => {
                const isExpanded = expandedTransactions[tx.id];
                const displayIndex = httpTransactions.length - index;

                return (
                  <li
                    key={tx.id}
                    className="text-sm text-foreground bg-secondary py-2 px-3 rounded"
                  >
                    {/* Header row */}
                    <div
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() => toggleTransactionExpansion(tx.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-muted-foreground">
                          {displayIndex}.
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs font-mono shrink-0"
                        >
                          {tx.method}
                        </Badge>
                        <span
                          className={`text-xs font-medium ${getStatusColor(tx.statusCode)}`}
                        >
                          {tx.statusCode}
                        </span>
                        <span
                          className="text-xs text-muted-foreground truncate"
                          title={tx.url}
                        >
                          {(() => {
                            try {
                              return new URL(tx.url).pathname;
                            } catch {
                              return tx.url;
                            }
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                        <span className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(tx.timestamp)}
                        </span>
                        <span className="text-xs text-green-600 dark:text-green-400">
                          {formatDuration(tx.duration)}
                        </span>
                        <span>{isExpanded ? "▼" : "▶"}</span>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {/* URL */}
                        <div className="flex items-center gap-2 text-xs">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono text-blue-600 dark:text-blue-400 break-all">
                            {tx.url}
                          </span>
                        </div>

                        {/* Request Headers */}
                        <div className="border-l-2 border-blue-400 pl-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                            <ArrowRight className="h-3 w-3" />
                            Request Headers (
                            {Object.keys(tx.requestHeaders).length})
                          </div>
                          <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-48 overflow-y-auto">
                            {Object.entries(tx.requestHeaders).map(
                              ([key, value]) => (
                                <div key={key} className="flex gap-2 py-0.5">
                                  <span className="text-blue-600 dark:text-blue-400 font-medium shrink-0">
                                    {key}:
                                  </span>
                                  <span className="text-gray-700 dark:text-gray-300 break-all">
                                    {maskSensitiveValue(key, value)}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>

                        {/* Response Headers */}
                        <div className="border-l-2 border-green-400 pl-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
                            <ArrowRight className="h-3 w-3 rotate-180" />
                            Response Headers (
                            {Object.keys(tx.responseHeaders).length})
                            <span
                              className={`ml-2 ${getStatusColor(tx.statusCode)}`}
                            >
                              {tx.statusCode} {tx.statusText}
                            </span>
                          </div>
                          <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-48 overflow-y-auto">
                            {Object.entries(tx.responseHeaders).map(
                              ([key, value]) => (
                                <div key={key} className="flex gap-2 py-0.5">
                                  <span className="text-green-600 dark:text-green-400 font-medium shrink-0">
                                    {key}:
                                  </span>
                                  <span className="text-gray-700 dark:text-gray-300 break-all">
                                    {value}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* Server Notifications */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Server Notifications</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearNotifications}
            disabled={serverNotifications.length === 0}
          >
            Clear
          </Button>
        </div>
        {serverNotifications.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No notifications yet
          </p>
        ) : (
          <ul className="space-y-3">
            {serverNotifications
              .slice()
              .reverse()
              .map((notification, index) => (
                <li
                  key={index}
                  className="text-sm text-foreground bg-secondary py-2 px-3 rounded"
                >
                  <div
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() =>
                      toggleNotificationExpansion(
                        serverNotifications.length - 1 - index,
                      )
                    }
                  >
                    <span className="font-mono">
                      {serverNotifications.length - index}.{" "}
                      {notification.method}
                    </span>
                    <span>
                      {expandedNotifications[
                        serverNotifications.length - 1 - index
                      ]
                        ? "▼"
                        : "▶"}
                    </span>
                  </div>
                  {expandedNotifications[
                    serverNotifications.length - 1 - index
                  ] && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-purple-600">
                          Details:
                        </span>
                      </div>
                      <JsonView
                        data={JSON.stringify(notification, null, 2)}
                        className="bg-background"
                      />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default HistoryAndNotifications;

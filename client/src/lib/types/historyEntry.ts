/**
 * Type definitions for HTTP request/response history
 * Used to track and display detailed request information
 */

/**
 * Represents captured HTTP headers from a request or response
 */
export interface HttpHeaders {
  [key: string]: string;
}

/**
 * A single entry in the request history
 */
export interface HistoryEntry {
  /** Unique identifier for this history entry */
  id: string;
  /** Timestamp when the request was made */
  timestamp: number;
  /** The JSON-RPC request body */
  request: string;
  /** The JSON-RPC response body (if received) */
  response?: string;
  /** HTTP headers sent with the request */
  requestHeaders?: HttpHeaders;
  /** HTTP headers received in the response */
  responseHeaders?: HttpHeaders;
  /** Transport type used for this request */
  transportType?: "stdio" | "sse" | "streamable-http";
  /** Duration of the request in milliseconds */
  duration?: number;
  /** Active profile ID when this request was made (for context) */
  activeProfileId?: string | null;
  /** Active profile name for display */
  activeProfileName?: string | null;
}

/**
 * Creates a new history entry with a unique ID and timestamp
 */
export const createHistoryEntry = (
  request: string,
  options?: {
    requestHeaders?: HttpHeaders;
    transportType?: "stdio" | "sse" | "streamable-http";
    activeProfileId?: string | null;
    activeProfileName?: string | null;
  },
): HistoryEntry => {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    request,
    requestHeaders: options?.requestHeaders,
    transportType: options?.transportType,
    activeProfileId: options?.activeProfileId,
    activeProfileName: options?.activeProfileName,
  };
};

/**
 * Updates a history entry with response data
 */
export const updateHistoryEntryWithResponse = (
  entry: HistoryEntry,
  response: string,
  options?: {
    responseHeaders?: HttpHeaders;
    duration?: number;
  },
): HistoryEntry => {
  return {
    ...entry,
    response,
    responseHeaders: options?.responseHeaders,
    duration: options?.duration ?? Date.now() - entry.timestamp,
  };
};

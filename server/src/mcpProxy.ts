import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  isJSONRPCRequest,
  isJSONRPCResponse,
  JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { resourceIndexer } from "./analysis/resourceIndexer.js";
import { profileManager } from "./auth/userProfiles.js";

function onClientError(error: Error) {
  console.error("Error from inspector client:", error);
}

function onServerError(error: Error) {
  if (error?.cause && JSON.stringify(error.cause).includes("ECONNREFUSED")) {
    console.error("Connection refused. Is the MCP server running?");
  } else if (error.message && error.message.includes("404")) {
    console.error("Error accessing endpoint (HTTP 404)");
  } else {
    console.error("Error from MCP server:", error);
  }
}

export default function mcpProxy({
  transportToClient,
  transportToServer,
}: {
  transportToClient: Transport;
  transportToServer: Transport;
}) {
  let transportToClientClosed = false;
  let transportToServerClosed = false;

  let reportedServerSession = false;

  // Track pending requests to match responses back to tool names
  const pendingRequests: Map<
    string | number,
    { method: string; toolName?: string }
  > = new Map();

  transportToClient.onmessage = (message) => {
    // Track requests so we can match them to responses
    if (isJSONRPCRequest(message)) {
      const request = message as JSONRPCRequest;
      let toolName: string | undefined;

      // Extract tool name from tools/call requests
      if (
        request.method === "tools/call" &&
        request.params &&
        typeof request.params === "object" &&
        "name" in request.params
      ) {
        toolName = String(request.params.name);
      }

      pendingRequests.set(request.id, {
        method: request.method,
        toolName,
      });
    }

    transportToServer.send(message).catch((error) => {
      // Send error response back to client if it was a request (has id) and connection is still open
      if (isJSONRPCRequest(message) && !transportToClientClosed) {
        const errorResponse = {
          jsonrpc: "2.0" as const,
          id: message.id,
          error: {
            code: -32001,
            message: error.message,
            data: error,
          },
        };
        transportToClient.send(errorResponse).catch(onClientError);
      }
    });
  };

  transportToServer.onmessage = (message) => {
    // Debug: Log all messages from server
    const msgType = isJSONRPCResponse(message)
      ? "response"
      : isJSONRPCRequest(message)
        ? "request"
        : "notification";
    const hasResult =
      message && typeof message === "object" && "result" in message;
    console.log(
      `[DEBUG] Server message: type=${msgType}, hasResult=${hasResult}, id=${"id" in message ? message.id : "N/A"}`,
    );

    if (!reportedServerSession) {
      if (transportToServer.sessionId) {
        // Can only report for StreamableHttp
        console.error(
          "Proxy  <-> Server sessionId: " + transportToServer.sessionId,
        );
      }
      reportedServerSession = true;
    }

    // Index resources from tool responses
    if (isJSONRPCResponse(message) && "result" in message) {
      const requestInfo = pendingRequests.get(message.id);
      console.log(
        `[DEBUG] Response received, id=${message.id}, hasRequestInfo=${!!requestInfo}, pendingCount=${pendingRequests.size}`,
      );

      if (requestInfo) {
        pendingRequests.delete(message.id);

        // Only index responses from tools/call
        if (requestInfo.method === "tools/call" && requestInfo.toolName) {
          const activeProfileId = profileManager.getActiveProfileId();
          console.log(
            `[DEBUG] Indexing response from tool: ${requestInfo.toolName}, user: ${activeProfileId}`,
          );
          console.log(
            `[DEBUG] Result structure:`,
            JSON.stringify(message.result, null, 2).substring(0, 500),
          );
          try {
            const indexed = resourceIndexer.indexResponse(
              activeProfileId,
              requestInfo.toolName,
              message.result,
            );
            console.log(`[DEBUG] Indexed ${indexed.length} resources`);
          } catch (err) {
            console.error("Error indexing resources:", err);
          }
        }
      }
    }

    transportToClient.send(message).catch(onClientError);
  };

  transportToClient.onclose = () => {
    if (transportToServerClosed) {
      return;
    }

    transportToClientClosed = true;
    pendingRequests.clear();
    transportToServer.close().catch(onServerError);
  };

  transportToServer.onclose = () => {
    if (transportToClientClosed) {
      return;
    }
    transportToServerClosed = true;
    pendingRequests.clear();
    transportToClient.close().catch(onClientError);
  };

  transportToClient.onerror = onClientError;
  transportToServer.onerror = onServerError;
}

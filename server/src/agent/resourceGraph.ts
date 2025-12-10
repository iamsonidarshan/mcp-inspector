/**
 * Resource Graph - Tracks discovered resources and their relationships
 * Designed for easy visualization in the UI
 */

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
  source: string; // Node ID
  target: string; // Node ID
  relation: string; // e.g., "provided_cloudId_to"
  paramName: string;
}

export interface VisualizationData {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
}

/**
 * Graph data structure for tracking tool executions and resource discovery
 */
export class ResourceGraph {
  private nodes: Map<string, ResourceNode> = new Map();
  private edges: ResourceEdge[] = [];
  private toolResults: Map<string, Record<string, unknown>> = new Map();

  /**
   * Add a tool to the graph as pending
   */
  addPendingTool(toolName: string): string {
    const nodeId = `tool_${toolName}_${Date.now()}`;
    this.nodes.set(nodeId, {
      id: nodeId,
      type: "tool",
      name: toolName,
      data: {},
      timestamp: Date.now(),
      status: "pending",
    });
    return nodeId;
  }

  /**
   * Mark a tool as running
   */
  markToolRunning(nodeId: string, params: Record<string, unknown>): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = "running";
      node.data = { ...node.data, params };
    }
  }

  /**
   * Record a completed tool execution
   */
  recordToolExecution(
    nodeId: string,
    result: unknown,
    paramSources: Record<string, string>, // paramName -> sourceNodeId
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = "completed";
    node.data = { ...node.data, result };

    // Store result for context building
    this.toolResults.set(node.name, this.flattenResult(result));

    // Create edges from source tools to this tool
    for (const [paramName, sourceNodeId] of Object.entries(paramSources)) {
      if (sourceNodeId && this.nodes.has(sourceNodeId)) {
        this.edges.push({
          id: `edge_${sourceNodeId}_${nodeId}_${paramName}`,
          source: sourceNodeId,
          target: nodeId,
          relation: `provided_${paramName}`,
          paramName,
        });
      }
    }

    // Extract resources from result
    this.extractResources(nodeId, result);
  }

  /**
   * Mark a tool as failed
   */
  markToolFailed(nodeId: string, error: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = "failed";
      node.data = { ...node.data, error };
    }
  }

  /**
   * Mark a tool as skipped (couldn't resolve params)
   */
  markToolSkipped(
    nodeId: string,
    reason: string,
    missingParams: string[],
  ): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = "skipped";
      node.data = { ...node.data, skipReason: reason, missingParams };
    }
  }

  /**
   * Sanitize a value for LLM context - redact long strings to save tokens
   */
  private sanitizeForLLM(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      // Count words (split by whitespace)
      const wordCount = value.trim().split(/\s+/).length;
      if (wordCount > 100) {
        return "[REDACTED - long content]";
      }
      return value;
    }

    if (Array.isArray(value)) {
      // Limit arrays to first 10 items to avoid explosion
      return value.slice(0, 10).map((item) => this.sanitizeForLLM(item));
    }

    if (typeof value === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        sanitized[key] = this.sanitizeForLLM(val);
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Get all available context from completed tool executions
   * Returns sanitized results for LLM to extract parameters from
   * Long string values (>100 words) are redacted to save tokens
   */
  getAvailableContext(): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    for (const [toolName, result] of this.toolResults) {
      context[toolName] = this.sanitizeForLLM(result);
    }
    return context;
  }

  /**
   * Get the node ID for a tool by name (most recent)
   */
  getToolNodeId(toolName: string): string | undefined {
    let latestNode: ResourceNode | undefined;
    for (const node of this.nodes.values()) {
      if (node.type === "tool" && node.name === toolName) {
        if (!latestNode || node.timestamp > latestNode.timestamp) {
          latestNode = node;
        }
      }
    }
    return latestNode?.id;
  }

  /**
   * Get visualization-friendly data
   */
  toVisualizationFormat(): VisualizationData {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.toolResults.clear();
  }

  /**
   * Flatten a result object to extract key-value pairs
   */
  private flattenResult(result: unknown, prefix = ""): Record<string, unknown> {
    const flat: Record<string, unknown> = {};

    if (result === null || result === undefined) {
      return flat;
    }

    // Handle MCP content array format
    if (typeof result === "object" && "content" in result) {
      const content = (result as { content: unknown[] }).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object" && "text" in item) {
            try {
              const parsed = JSON.parse((item as { text: string }).text);
              Object.assign(flat, this.flattenResult(parsed, prefix));
            } catch {
              // Not JSON, skip
            }
          }
        }
        return flat;
      }
    }

    if (Array.isArray(result)) {
      // For arrays, extract from first item and mark as array
      if (result.length > 0) {
        Object.assign(flat, this.flattenResult(result[0], prefix));
        flat[`${prefix}_array`] = result;
      }
      return flat;
    }

    if (typeof result === "object") {
      for (const [key, value] of Object.entries(
        result as Record<string, unknown>,
      )) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) {
          Object.assign(flat, this.flattenResult(value, newPrefix));
        } else {
          flat[key] = value; // Use just the key for easy matching
          flat[newPrefix] = value; // Also store full path
        }
      }
    }

    return flat;
  }

  /**
   * Extract resource IDs from a result and add as nodes
   * Uses pattern matching to work with ANY MCP server
   */
  private extractResources(parentNodeId: string, result: unknown): void {
    /**
     * Detect if a field name looks like an ID field
     */
    const isIdFieldName = (key: string): boolean => {
      const lowerKey = key.toLowerCase();
      // Ends with "id" (userId, projectId, cloudId, etc.)
      if (lowerKey.endsWith("id")) return true;
      // Ends with "key" (projectKey, issueKey, apiKey - filter out sensitive ones)
      if (
        lowerKey.endsWith("key") &&
        !lowerKey.includes("api") &&
        !lowerKey.includes("secret")
      )
        return true;
      // Common ID field names
      if (
        ["uuid", "slug", "name", "code", "handle", "identifier"].includes(
          lowerKey,
        )
      )
        return true;
      return false;
    };

    /**
     * Detect if a value looks like an ID (not too long, no spaces, etc.)
     */
    const isIdLikeValue = (value: unknown): value is string => {
      if (typeof value !== "string") return false;
      if (value.length === 0 || value.length > 100) return false;
      // Skip if contains spaces (likely a description/title)
      if (value.includes("  ") || value.split(" ").length > 3) return false;
      // Skip if looks like a URL
      if (value.startsWith("http://") || value.startsWith("https://"))
        return false;
      return true;
    };

    const extractFromObject = (obj: unknown, path: string) => {
      if (!obj || typeof obj !== "object") return;

      if (Array.isArray(obj)) {
        // Limit array traversal to first 10 items to avoid explosion
        obj
          .slice(0, 10)
          .forEach((item, i) => extractFromObject(item, `${path}[${i}]`));
        return;
      }

      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>,
      )) {
        if (isIdFieldName(key) && isIdLikeValue(value)) {
          const resourceId = `resource_${key}_${value}`;
          if (!this.nodes.has(resourceId)) {
            console.log(`[ResourceGraph] Discovered ${key}: ${value}`);
            this.nodes.set(resourceId, {
              id: resourceId,
              type: "resource",
              name: `${key}: ${value}`,
              data: { fieldName: key, value, path: `${path}.${key}` },
              timestamp: Date.now(),
              status: "completed",
            });
          }
          // Link resource to parent tool
          this.edges.push({
            id: `edge_${parentNodeId}_${resourceId}`,
            source: parentNodeId,
            target: resourceId,
            relation: "discovered",
            paramName: key,
          });
        } else if (typeof value === "object") {
          extractFromObject(value, `${path}.${key}`);
        }
      }
    };

    // Handle MCP content format
    if (typeof result === "object" && result !== null && "content" in result) {
      const content = (result as { content: unknown[] }).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object" && "text" in item) {
            try {
              const parsed = JSON.parse((item as { text: string }).text);
              console.log(
                `[ResourceGraph] Parsing tool result:`,
                typeof parsed,
                Array.isArray(parsed)
                  ? `array[${parsed.length}]`
                  : Object.keys(parsed).slice(0, 5),
              );
              extractFromObject(parsed, "result");
            } catch {
              // Not JSON
            }
          }
        }
        return;
      }
    }

    extractFromObject(result, "result");
  }
}

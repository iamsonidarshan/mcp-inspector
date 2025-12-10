/**
 * Unified LLM Client Interface
 * Supports multiple LLM providers: Claude, Gemini
 */

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

export interface ParameterSource {
  paramName: string;
  sourceTool: string;
  sourceField: string;
  confidence: number;
}

export interface DependencyAnalysis {
  tool: string;
  requiredParams: string[];
  canExecuteWithoutContext: boolean;
  suggestedOrder: number;
  dependencies: ParameterSource[];
}

export interface ExtractedParams {
  params: Record<string, unknown>;
  sources: Record<string, string>;
  confidence: number;
  missingParams: string[];
}

export type LLMProvider = "claude" | "gemini";

export interface LLMClientConfig {
  provider: LLMProvider;
  apiKey: string;
}

/**
 * Abstract LLM Client Interface
 */
export interface ILLMClient {
  readonly provider: LLMProvider;

  analyzeToolDependencies(tools: ToolInfo[]): Promise<DependencyAnalysis[]>;

  extractParameters(
    targetTool: ToolInfo,
    availableContext: Record<string, unknown>,
  ): Promise<ExtractedParams>;

  selectNextTool(
    availableTools: ToolInfo[],
    executedTools: string[],
    availableContext: Record<string, unknown>,
    currentDepth: number,
    maxDepth: number,
  ): Promise<{ tool: string | null; reason: string }>;
}

/**
 * Shared prompts for both providers
 */
export const PROMPTS = {
  analyzeToolDependencies: (
    toolDescriptions: unknown,
  ) => `You are analyzing MCP (Model Context Protocol) tools for an autonomous agent.

Given these tools, analyze which tools can be called first (no dependencies) and which tools require outputs from other tools.

Tools:
${JSON.stringify(toolDescriptions, null, 2)}

For each tool, determine:
1. Which parameters are required
2. Whether it can be executed without any prior context (e.g., getAccessibleResources)
3. Which other tools might provide values for its parameters
4. Suggested execution order (1 = first, higher = later)

Respond with ONLY a JSON array, no markdown, no explanation:
[
  {
    "tool": "toolName",
    "requiredParams": ["param1", "param2"],
    "canExecuteWithoutContext": true/false,
    "suggestedOrder": 1,
    "dependencies": [
      {
        "paramName": "cloudId",
        "sourceTool": "getAccessibleResources",
        "sourceField": "cloudId",
        "confidence": 0.9
      }
    ]
  }
]`,

  extractParameters: (
    targetTool: ToolInfo,
    availableContext: Record<string, unknown>,
  ) => `You are helping an autonomous agent call MCP tools.

Target tool to call:
${JSON.stringify(
  {
    name: targetTool.name,
    description: targetTool.description,
    parameters: targetTool.inputSchema?.properties || {},
    required: targetTool.inputSchema?.required || [],
  },
  null,
  2,
)}

Available context from previous tool calls:
${JSON.stringify(availableContext, null, 2)}

Extract the parameter values needed for "${targetTool.name}" from the context.
Match parameter names intelligently (e.g., "cloudId" in context matches "cloudId" parameter).

Respond with ONLY a JSON object, no markdown:
{
  "params": { "paramName": "extractedValue" },
  "sources": { "paramName": "toolName.fieldPath" },
  "confidence": 0.0-1.0,
  "missingParams": ["paramsThatCouldNotBeFound"]
}`,

  selectNextTool: (
    executedTools: string[],
    availableContext: Record<string, unknown>,
    unexecutedTools: ToolInfo[],
    currentDepth: number,
    maxDepth: number,
  ) => `You are an autonomous agent selecting which MCP tool to call next.

ALREADY EXECUTED - DO NOT SELECT THESE AGAIN:
${JSON.stringify(executedTools)}

Available context from executed tools:
${JSON.stringify(availableContext, null, 2)}

AVAILABLE TOOLS (pick from these ONLY):
${JSON.stringify(
  unexecutedTools.map((t) => ({
    name: t.name,
    description: t.description,
    required: t.inputSchema?.required || [],
  })),
  null,
  2,
)}

Current depth: ${currentDepth}/${maxDepth}

STRATEGY FOR TOOL SELECTION:
1. NEVER select a tool from the "ALREADY EXECUTED" list
2. Look for tools that can run with available parameters (cloudId, id, etc.)
3. If you need more IDs (spaceId, pageId, projectKey, issueKey), use SEARCH/LIST/LOOKUP tools:
   - "search" tools can find items using keywords or queries
   - "list" or "get...s" (plural) tools return collections of items with their IDs
   - "lookup" tools can find specific items
4. Priority order:
   a. Tools with NO required params (run first to discover resources)
   b. SEARCH/LIST tools (to discover IDs like spaceId, pageId, projectKey)
   c. GET tools (to fetch specific resources using discovered IDs)
   d. Avoid CREATE/UPDATE/DELETE tools unless all params are available
5. If no tool can be executed with available params, return null

Example: If you need "projectKey" but don't have it, call "getVisibleJiraProjects" or "searchJiraIssuesUsingJql" first.

Respond with ONLY a JSON object:
{
  "tool": "toolName" or null if none can be executed,
  "reason": "Brief explanation"
}`,
};

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
export function parseJSONResponse<T>(response: string): T {
  // Remove markdown code blocks if present
  let cleaned = response.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

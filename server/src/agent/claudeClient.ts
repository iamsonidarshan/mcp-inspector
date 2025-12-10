/**
 * Claude API Client for autonomous agent
 * Implements the ILLMClient interface
 */

import {
  ILLMClient,
  LLMProvider,
  ToolInfo,
  DependencyAnalysis,
  ExtractedParams,
  PROMPTS,
  parseJSONResponse,
} from "./llmClient.js";

/**
 * Claude API client implementation
 */
export class ClaudeClient implements ILLMClient {
  readonly provider: LLMProvider = "claude";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";
  private model = "claude-sonnet-4-20250514";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeToolDependencies(
    tools: ToolInfo[],
  ): Promise<DependencyAnalysis[]> {
    const toolDescriptions = tools.map((t) => ({
      name: t.name,
      description: t.description || "No description",
      parameters: t.inputSchema.properties || {},
      required: t.inputSchema.required || [],
    }));

    const prompt = PROMPTS.analyzeToolDependencies(toolDescriptions);
    const response = await this.callClaude(prompt);

    try {
      return parseJSONResponse<DependencyAnalysis[]>(response);
    } catch {
      console.error("Failed to parse Claude response:", response);
      return tools.map((t, i) => ({
        tool: t.name,
        requiredParams: t.inputSchema.required || [],
        canExecuteWithoutContext: (t.inputSchema.required || []).length === 0,
        suggestedOrder: i + 1,
        dependencies: [],
      }));
    }
  }

  async extractParameters(
    targetTool: ToolInfo,
    availableContext: Record<string, unknown>,
  ): Promise<ExtractedParams> {
    const prompt = PROMPTS.extractParameters(targetTool, availableContext);
    const response = await this.callClaude(prompt);

    try {
      return parseJSONResponse<ExtractedParams>(response);
    } catch {
      console.error("Failed to parse parameter extraction:", response);
      return {
        params: {},
        sources: {},
        confidence: 0,
        missingParams: targetTool.inputSchema.required || [],
      };
    }
  }

  async selectNextTool(
    availableTools: ToolInfo[],
    executedTools: string[],
    availableContext: Record<string, unknown>,
    currentDepth: number,
    maxDepth: number,
  ): Promise<{ tool: string | null; reason: string }> {
    if (currentDepth >= maxDepth) {
      return { tool: null, reason: "Maximum depth reached" };
    }

    const unexecutedTools = availableTools.filter(
      (t) => !executedTools.includes(t.name),
    );

    if (unexecutedTools.length === 0) {
      return { tool: null, reason: "All tools have been executed" };
    }

    const prompt = PROMPTS.selectNextTool(
      executedTools,
      availableContext,
      unexecutedTools,
      currentDepth,
      maxDepth,
    );
    const response = await this.callClaude(prompt);

    try {
      return parseJSONResponse<{ tool: string | null; reason: string }>(
        response,
      );
    } catch {
      // Fallback: pick first tool that has no required params
      for (const tool of unexecutedTools) {
        const required = tool.inputSchema.required || [];
        if (required.length === 0) {
          return { tool: tool.name, reason: "No parameters required" };
        }
      }
      return { tool: null, reason: "No suitable tool found" };
    }
  }

  /**
   * Call Claude API
   */
  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    return data.content[0]?.text || "";
  }
}

export type { ToolInfo, DependencyAnalysis, ExtractedParams };

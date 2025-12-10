/**
 * Google Gemini Client for autonomous agent
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
 * Gemini API client implementation
 */
export class GeminiClient implements ILLMClient {
  readonly provider: LLMProvider = "gemini";
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private model = "gemini-2.0-flash";

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
    const response = await this.callGemini(prompt);

    try {
      return parseJSONResponse<DependencyAnalysis[]>(response);
    } catch {
      console.error("Failed to parse Gemini response:", response);
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
    const response = await this.callGemini(prompt);

    try {
      const extracted = parseJSONResponse<ExtractedParams>(response);
      console.log(
        `[Gemini] Extracted params for ${targetTool.name}:`,
        extracted.params,
      );
      return extracted;
    } catch {
      console.error("[Gemini] Failed to parse parameter extraction:", response);
      return {
        params: {},
        sources: {},
        confidence: 0,
        missingParams: targetTool.inputSchema?.required || [],
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

    // Debug: log what tools are available vs executed
    console.log(
      `[Gemini] Executed tools: ${executedTools.length}, Unexecuted tools: ${unexecutedTools.length}`,
    );
    console.log(
      `[Gemini] Unexecuted tool names: ${unexecutedTools
        .map((t) => t.name)
        .slice(0, 10)
        .join(", ")}...`,
    );

    const response = await this.callGemini(prompt);

    try {
      const parsed = parseJSONResponse<
        | { tool: string | null; reason: string }
        | Array<{ tool: string; reason: string }>
      >(response);

      // Handle case where Gemini returns an array of tools instead of a single object
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0].tool) {
          console.log(
            "[Gemini] Got array response, taking first tool:",
            parsed[0].tool,
          );
          return { tool: parsed[0].tool, reason: parsed[0].reason };
        }
        // Fall through to fallback logic
      } else if (parsed.tool) {
        return parsed;
      }

      // LLM returned null - try fallback logic
      console.log("[Gemini] LLM returned null, trying fallback...");
      return this.fallbackToolSelection(unexecutedTools, availableContext);
    } catch {
      // Fallback: pick first tool with no required params
      return this.fallbackToolSelection(unexecutedTools, availableContext);
    }
  }

  /**
   * Fallback tool selection when LLM returns null
   */
  private fallbackToolSelection(
    unexecutedTools: ToolInfo[],
    availableContext: Record<string, unknown>,
  ): { tool: string | null; reason: string } {
    // 1. First try tools with no required params
    for (const tool of unexecutedTools) {
      const required = tool.inputSchema?.required || [];
      if (required.length === 0) {
        return { tool: tool.name, reason: "Fallback: no parameters required" };
      }
    }

    // 2. Try tools that only need params we have in context
    const contextKeys = Object.keys(availableContext);
    for (const tool of unexecutedTools) {
      const required = tool.inputSchema?.required || [];
      const hasAllParams = required.every((param) => {
        // Check if we have data that might satisfy this param
        return contextKeys.some((key) => {
          const data = availableContext[key];
          if (typeof data === "object" && data !== null) {
            const str = JSON.stringify(data);
            return (
              str.includes(param) ||
              str.includes("cloudId") ||
              str.includes("id")
            );
          }
          return false;
        });
      });
      if (hasAllParams) {
        return {
          tool: tool.name,
          reason: "Fallback: params likely available in context",
        };
      }
    }

    return { tool: null, reason: "No suitable tool found in fallback" };
  }

  /**
   * Call Gemini API
   */
  private async callGemini(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    interface GeminiResponse {
      candidates: Array<{
        content: {
          parts: Array<{ text: string }>;
        };
      }>;
    }

    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

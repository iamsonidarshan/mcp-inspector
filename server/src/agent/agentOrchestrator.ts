/**
 * Agent Orchestrator - Autonomous tool execution engine
 * Chains MCP tool calls using LLM for intelligent parameter resolution
 */

import { EventEmitter } from "events";
import {
  ILLMClient,
  LLMProvider,
  ToolInfo,
  DependencyAnalysis,
} from "./llmClient.js";
import { ClaudeClient } from "./claudeClient.js";
import { GeminiClient } from "./geminiClient.js";
import { OpenAIClient } from "./openaiClient.js";
import { ResourceGraph, VisualizationData } from "./resourceGraph.js";

export type AgentStatus = "idle" | "running" | "paused" | "completed" | "error";

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
    | "error";
  data: unknown;
  timestamp: number;
}

type ToolCallFn = (
  name: string,
  params: Record<string, unknown>,
) => Promise<unknown>;
type ListToolsFn = () => Promise<ToolInfo[]>;

/**
 * Orchestrates autonomous tool execution
 */
export class AgentOrchestrator extends EventEmitter {
  private llmClient: ILLMClient | null = null;
  private graph: ResourceGraph;
  private state: AgentState;
  private toolCallFn: ToolCallFn | null = null;
  private listToolsFn: ListToolsFn | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    super();
    this.graph = new ResourceGraph();
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
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
  }

  /**
   * Configure the agent with API key and MCP connection functions
   */
  configure(config: {
    apiKey: string;
    provider?: LLMProvider;
    toolCallFn: ToolCallFn;
    listToolsFn: ListToolsFn;
    maxDepth?: number;
  }): void {
    const provider = config.provider || "gemini";

    if (provider === "gemini") {
      this.llmClient = new GeminiClient(config.apiKey);
    } else if (provider === "openai") {
      this.llmClient = new OpenAIClient(config.apiKey);
    } else {
      this.llmClient = new ClaudeClient(config.apiKey);
    }

    this.toolCallFn = config.toolCallFn;
    this.listToolsFn = config.listToolsFn;
    if (config.maxDepth) {
      this.state.maxDepth = config.maxDepth;
    }

    console.log(`Agent configured with ${provider} provider`);
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return {
      ...this.state,
      resourceGraph: this.graph.toVisualizationFormat(),
    };
  }

  /**
   * Start autonomous execution
   */
  async start(): Promise<void> {
    if (!this.llmClient || !this.toolCallFn || !this.listToolsFn) {
      throw new Error("Agent not configured. Call configure() first.");
    }

    if (this.state.status === "running") {
      throw new Error("Agent is already running");
    }

    this.abortController = new AbortController();
    this.state = this.createInitialState();
    this.state.status = "running";
    this.state.startTime = Date.now();
    this.graph.clear();

    this.emitEvent("status_change", { status: "running" });

    try {
      await this.runExecutionLoop();
    } catch (error) {
      this.state.status = "error";
      this.state.error = error instanceof Error ? error.message : String(error);
      this.emitEvent("error", { error: this.state.error });
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state.status === "running") {
      this.state.status = "paused";
      this.emitEvent("status_change", { status: "paused" });
    }
  }

  /**
   * Resume execution
   */
  async resume(): Promise<void> {
    if (this.state.status === "paused") {
      this.state.status = "running";
      this.emitEvent("status_change", { status: "running" });
      await this.runExecutionLoop();
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.abortController?.abort();
    this.state.status = "idle";
    this.state.endTime = Date.now();
    this.emitEvent("status_change", { status: "idle" });
  }

  /**
   * Main execution loop
   */
  private async runExecutionLoop(): Promise<void> {
    // Step 1: Discover tools
    const tools = await this.listToolsFn!();
    this.state.toolsDiscovered = tools;

    // Step 2: Analyze dependencies with LLM
    this.state.dependencyAnalysis =
      await this.llmClient!.analyzeToolDependencies(tools);
    this.emitEvent("analysis_complete", {
      tools: tools.length,
      analysis: this.state.dependencyAnalysis,
    });

    // Step 3: Execute tools in order
    const executedTools: string[] = [];
    // Track depth for each executed tool (tool name -> depth)
    const toolDepths: Map<string, number> = new Map();

    while (this.state.status === "running") {
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Get available context
      const context = this.graph.getAvailableContext();
      console.log("[Agent] Available context:", JSON.stringify(context));

      // Ask LLM which tool to execute next
      const nextTool = await this.llmClient!.selectNextTool(
        tools,
        executedTools,
        context,
        this.state.currentDepth,
        this.state.maxDepth,
      );
      console.log("[Agent] LLM selected:", nextTool);

      if (!nextTool.tool) {
        console.log(
          "[Agent] No tool selected, stopping. Reason:",
          nextTool.reason,
        );
        // No more tools to execute
        break;
      }

      // Check for duplicate and skip if already executed
      if (executedTools.includes(nextTool.tool)) {
        console.log(`[Agent] Tool ${nextTool.tool} already executed, skipping`);
        continue;
      }

      executedTools.push(nextTool.tool);

      const toolInfo = tools.find((t) => t.name === nextTool.tool);
      if (!toolInfo) {
        continue;
      }

      // Add tool to graph
      const nodeId = this.graph.addPendingTool(toolInfo.name);

      // Extract parameters
      const extraction = await this.llmClient!.extractParameters(
        toolInfo,
        context,
      );

      // Ensure extraction has valid properties (LLM might return incomplete response)
      const missingParams = extraction?.missingParams || [];
      const extractedParams = extraction?.params || {};
      const extractedSources = extraction?.sources || {};
      const confidence = extraction?.confidence ?? 0;

      if (missingParams.length > 0 && confidence < 0.5) {
        // Flag this tool - can't resolve params
        this.state.flaggedTools.push({
          toolName: toolInfo.name,
          missingParams: missingParams,
          reason:
            "Could not resolve required parameters from available context",
          nodeId,
        });
        this.graph.markToolSkipped(nodeId, "Missing parameters", missingParams);

        this.emitEvent("tool_skipped", {
          tool: toolInfo.name,
          missingParams: missingParams,
        });

        continue;
      }

      // Calculate this tool's depth based on parameter sources
      // Depth = 1 + max depth of tools that provided parameters
      let maxSourceDepth = 0;
      const paramSources: Record<string, string> = {};

      for (const [param, source] of Object.entries(extractedSources)) {
        const sourceTool = String(source).split(".")[0];
        const sourceNodeId = this.graph.getToolNodeId(sourceTool);
        if (sourceNodeId) {
          paramSources[param] = sourceNodeId;
        }
        // Track the max depth of source tools
        const sourceDepth = toolDepths.get(sourceTool) || 0;
        maxSourceDepth = Math.max(maxSourceDepth, sourceDepth);
      }

      // This tool's depth is 1 + max source depth
      const toolDepth = maxSourceDepth + 1;
      toolDepths.set(toolInfo.name, toolDepth);

      // Check if this would exceed max depth
      if (toolDepth > this.state.maxDepth) {
        // Skip - too deep in dependency chain
        this.state.flaggedTools.push({
          toolName: toolInfo.name,
          missingParams: [],
          reason: `Exceeds max depth (${toolDepth} > ${this.state.maxDepth})`,
          nodeId,
        });
        this.graph.markToolSkipped(nodeId, "Exceeds max depth", []);

        this.emitEvent("tool_skipped", {
          tool: toolInfo.name,
          reason: "Exceeds max depth",
        });

        continue;
      }

      // Update current depth to track maximum achieved
      this.state.currentDepth = Math.max(this.state.currentDepth, toolDepth);

      // Create execution step
      const step: ExecutionStep = {
        toolName: toolInfo.name,
        nodeId,
        parameters: extractedParams,
        parameterSources: paramSources,
        status: "running",
        timestamp: Date.now(),
        depth: toolDepth,
      };

      this.state.executionHistory.push(step);
      this.state.currentStep = this.state.executionHistory.length - 1;
      this.graph.markToolRunning(nodeId, extractedParams);

      this.emitEvent("tool_start", {
        tool: toolInfo.name,
        params: extractedParams,
        depth: toolDepth,
      });

      try {
        // Execute the tool
        const result = await this.toolCallFn!(toolInfo.name, extractedParams);

        step.status = "completed";
        step.result = result;
        this.graph.recordToolExecution(nodeId, result, paramSources);

        this.emitEvent("tool_complete", {
          tool: toolInfo.name,
          result,
          depth: toolDepth,
        });
      } catch (error) {
        step.status = "failed";
        step.error = error instanceof Error ? error.message : String(error);
        this.graph.markToolFailed(nodeId, step.error);

        this.emitEvent("tool_failed", {
          tool: toolInfo.name,
          error: step.error,
        });
      }

      // Update state
      this.state.resourceGraph = this.graph.toVisualizationFormat();
    }

    // Execution complete
    this.state.status = "completed";
    this.state.endTime = Date.now();
    this.state.resourceGraph = this.graph.toVisualizationFormat();

    this.emitEvent("agent_complete", {
      totalTools: executedTools.length,
      flagged: this.state.flaggedTools.length,
      duration: this.state.endTime - (this.state.startTime || 0),
    });
  }

  /**
   * Emit an event
   */
  private emitEvent(type: AgentEvent["type"], data: unknown): void {
    const event: AgentEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit("event", event);
    this.emit(type, event);
  }
}

// Singleton instance
export const agentOrchestrator = new AgentOrchestrator();

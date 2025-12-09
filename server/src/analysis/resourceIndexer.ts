import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { profileManager } from "../auth/userProfiles.js";

/**
 * Types of identifiers we can detect
 */
export type ResourceType = "uuid" | "numeric" | "path" | "slug" | "unknown";

/**
 * An indexed resource discovered from MCP tool responses
 */
export interface IndexedResource {
  /** Unique ID for this indexed entry */
  entryId: string;
  /** The discovered identifier value */
  id: string;
  /** Type of identifier */
  type: ResourceType;
  /** The key/field name that held this value (e.g., "id", "spaceId", "accountId") */
  fieldName: string;
  /** JSON path where found (e.g., "results[0].id") */
  fieldPath: string;
  /** Parent object context - nearby fields for automation context */
  parentContext: Record<string, unknown>;
  /** Tool name that returned this ID */
  discoveredByTool: string;
  /** Profile ID of the user who discovered this */
  discoveredFromUser: string;
  /** Display name for UI */
  discoveredFromUserName: string;
  /** User's color tag for UI */
  userColorTag: string;
  /** Timestamp when discovered */
  timestamp: number;
}

interface ResourceIndexData {
  resources: IndexedResource[];
}

const CONFIG_DIR = join(homedir(), ".mcp-inspector");
const RESOURCES_FILE = join(CONFIG_DIR, "resources.json");

// Regex patterns for ID detection
const PATTERNS = {
  // UUID v4 pattern
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  // Numeric IDs (at least 3 digits to avoid false positives)
  numeric: /^[0-9]{3,}$/,
  // Path-like IDs (starts with /, contains alphanumeric segments)
  path: /^\/[\w\-\/]+$/,
  // Slug strings (lowercase with hyphens/underscores, at least 2 segments)
  slug: /^[a-z0-9]+[-_][a-z0-9]+[-_a-z0-9]*$/i,
  // Atlassian-style IDs (e.g., PROJ-123, ari:cloud:...)
  atlassianAri: /^ari:cloud:[a-z]+::[a-z0-9-]+\/[a-z0-9-]+$/,
  atlassianKey: /^[A-Z]+-[0-9]+$/,
};

// Common field names that often contain IDs
const ID_FIELD_NAMES = [
  "id",
  "uuid",
  "key",
  "resourceId",
  "objectId",
  "entityId",
  "userId",
  "accountId",
  "projectId",
  "issueId",
  "pageId",
  "spaceId",
  "ari",
  "cloudId",
  "siteId",
  "workspaceId",
  "boardId",
  "ticketId",
  "documentId",
  "fileId",
  "folderId",
  "groupId",
  "teamId",
  "channelId",
  "conversationId",
  "messageId",
  "attachmentId",
  "commentId",
  "self", // Often contains URLs with IDs
];

/**
 * Detect the type of an identifier
 */
function detectIdType(value: string): ResourceType | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  // Skip very long values (likely not IDs)
  if (value.length > 500) {
    return null;
  }

  // Check patterns in order of specificity
  if (PATTERNS.uuid.test(value)) return "uuid";
  if (PATTERNS.atlassianAri.test(value)) return "path";
  if (PATTERNS.atlassianKey.test(value)) return "slug";
  if (PATTERNS.numeric.test(value)) return "numeric";
  if (PATTERNS.path.test(value)) return "path";
  if (PATTERNS.slug.test(value)) return "slug";

  return null;
}

/**
 * Check if a field name suggests it contains an ID
 */
function isIdFieldName(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return ID_FIELD_NAMES.some(
    (idField) =>
      lowerName === idField.toLowerCase() ||
      lowerName.endsWith(idField.toLowerCase()),
  );
}

/**
 * Result from ID extraction with context
 */
interface ExtractedId {
  id: string;
  type: ResourceType;
  fieldName: string;
  fieldPath: string;
  parentContext: Record<string, unknown>;
}

/**
 * Recursively extract IDs from a JSON structure
 */
function extractIds(
  obj: unknown,
  path: string = "",
  results: ExtractedId[],
  parentObj: Record<string, unknown> | null = null,
): void {
  if (obj === null || obj === undefined) {
    return;
  }

  if (typeof obj === "string") {
    // Check if the parent field name suggests this is an ID
    const fieldName =
      path
        .split(".")
        .pop()
        ?.replace(/\[\d+\]$/, "") || "";
    if (isIdFieldName(fieldName)) {
      const idType = detectIdType(obj);
      if (idType) {
        results.push({
          id: obj,
          type: idType,
          fieldName,
          fieldPath: path,
          parentContext: parentObj ? sanitizeContext(parentObj) : {},
        });
        return;
      }
    }

    // Also check if value looks like an ID even without field name hint
    // but only for strong patterns (UUID, Atlassian keys)
    if (PATTERNS.uuid.test(obj) || PATTERNS.atlassianKey.test(obj)) {
      const idType = detectIdType(obj);
      if (idType) {
        results.push({
          id: obj,
          type: idType,
          fieldName,
          fieldPath: path,
          parentContext: parentObj ? sanitizeContext(parentObj) : {},
        });
      }
    }
    return;
  }

  if (typeof obj === "number") {
    // Only extract numbers from ID-like fields
    const fieldName =
      path
        .split(".")
        .pop()
        ?.replace(/\[\d+\]$/, "") || "";
    if (isIdFieldName(fieldName) && obj > 100) {
      // Avoid small numbers
      results.push({
        id: String(obj),
        type: "numeric",
        fieldName,
        fieldPath: path,
        parentContext: parentObj ? sanitizeContext(parentObj) : {},
      });
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      // For array items, pass the item itself as parent if it's an object
      const itemParent =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : parentObj;
      extractIds(item, `${path}[${index}]`, results, itemParent);
    });
    return;
  }

  if (typeof obj === "object") {
    const objRecord = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(objRecord)) {
      const newPath = path ? `${path}.${key}` : key;
      // Pass this object as the parent context
      extractIds(value, newPath, results, objRecord);
    }
  }
}

/**
 * Sanitize parent context to only include simple values (no nested objects/arrays)
 * to keep storage reasonable
 */
function sanitizeContext(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      // Truncate long strings
      if (typeof value === "string" && value.length > 200) {
        result[key] = value.substring(0, 200) + "...";
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Manages indexed resources from MCP tool responses.
 * Resources are persisted to ~/.mcp-inspector/resources.json
 */
export class ResourceIndexer {
  private resources: IndexedResource[] = [];
  private seenIds: Set<string> = new Set(); // Track unique id+user combinations

  constructor() {
    this.loadFromFile();
  }

  /**
   * Index a response from an MCP tool, extracting any identifiers.
   */
  indexResponse(
    userProfileId: string | null,
    toolName: string,
    response: unknown,
  ): IndexedResource[] {
    const newResources: IndexedResource[] = [];

    // Get user profile info
    const profile = userProfileId
      ? profileManager.getProfile(userProfileId)
      : null;
    const userName = profile?.displayName || "Unknown";
    const userColor = profile?.colorTag || "blue";

    // Extract IDs from the response
    const extracted: ExtractedId[] = [];

    // MCP tool responses typically have structure:
    // { content: [{ type: "text", text: "...JSON string..." }] }
    // We need to parse the text content as JSON first
    const responseToIndex = this.extractMcpContent(response);
    extractIds(responseToIndex, "", extracted);

    const now = Date.now();

    for (const { id, type, fieldName, fieldPath, parentContext } of extracted) {
      // Create a unique key for deduplication (same ID from same user)
      const uniqueKey = `${id}::${userProfileId || "anonymous"}`;

      if (!this.seenIds.has(uniqueKey)) {
        this.seenIds.add(uniqueKey);

        const resource: IndexedResource = {
          entryId: randomUUID(),
          id,
          type,
          fieldName,
          fieldPath,
          parentContext,
          discoveredByTool: toolName,
          discoveredFromUser: userProfileId || "anonymous",
          discoveredFromUserName: userName,
          userColorTag: userColor,
          timestamp: now,
        };

        this.resources.push(resource);
        newResources.push(resource);
      }
    }

    // Save after indexing new resources
    if (newResources.length > 0) {
      this.saveToFile();
      console.log(
        `📊 Indexed ${newResources.length} new resource(s) from ${toolName}`,
      );
    }

    return newResources;
  }

  /**
   * Get all indexed resources.
   */
  getIndexedResources(): IndexedResource[] {
    return [...this.resources];
  }

  /**
   * Get resources discovered by a specific user.
   */
  getResourcesByUser(userId: string): IndexedResource[] {
    return this.resources.filter((r) => r.discoveredFromUser === userId);
  }

  /**
   * Extract actual content from MCP tool response format.
   * MCP responses have structure: { content: [{ type: "text", text: "JSON" }] }
   * This method parses the text field if it contains JSON.
   */
  private extractMcpContent(response: unknown): unknown {
    if (!response || typeof response !== "object") {
      return response;
    }

    const resp = response as Record<string, unknown>;

    // Check for MCP content array
    if (Array.isArray(resp.content)) {
      const parsedContents: unknown[] = [];

      for (const item of resp.content) {
        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          item.type === "text" &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          // Try to parse the text as JSON
          try {
            const parsed = JSON.parse(item.text);
            parsedContents.push(parsed);
          } catch {
            // Not JSON, skip
          }
        }
      }

      // If we parsed content, return it for ID extraction
      if (parsedContents.length === 1) {
        return parsedContents[0];
      } else if (parsedContents.length > 1) {
        return parsedContents;
      }
    }

    // Return original response if no MCP content structure
    return response;
  }

  /**
   * Clear all indexed resources.
   */
  clearIndex(): void {
    this.resources = [];
    this.seenIds.clear();
    this.saveToFile();
    console.log("🧹 Resource index cleared");
  }

  /**
   * Load resources from the config file.
   */
  private loadFromFile(): void {
    try {
      if (!existsSync(RESOURCES_FILE)) {
        console.log(`📊 No resource index file found, starting fresh`);
        return;
      }

      const data = readFileSync(RESOURCES_FILE, "utf-8");
      const parsed: ResourceIndexData = JSON.parse(data);

      this.resources = parsed.resources || [];

      // Rebuild the seen IDs set
      this.seenIds.clear();
      for (const r of this.resources) {
        this.seenIds.add(`${r.id}::${r.discoveredFromUser}`);
      }

      console.log(
        `📊 Loaded ${this.resources.length} indexed resource(s) from ${RESOURCES_FILE}`,
      );
    } catch (error) {
      console.error(`Failed to load resource index: ${error}`);
      this.resources = [];
      this.seenIds.clear();
    }
  }

  /**
   * Save resources to the config file.
   */
  private saveToFile(): void {
    try {
      // Create config directory if it doesn't exist
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      const data: ResourceIndexData = {
        resources: this.resources,
      };

      writeFileSync(RESOURCES_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save resource index: ${error}`);
    }
  }
}

// Singleton instance for the server
export const resourceIndexer = new ResourceIndexer();

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * User profile for security testing with multiple authenticated users.
 * Enables IDOR/BAC testing by allowing quick switching between user contexts.
 */
export interface UserProfile {
  id: string;
  displayName: string;
  colorTag: "blue" | "red" | "green" | "purple" | "orange" | "yellow";
  authToken?: string;
  headers: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export type CreateProfileInput = Omit<
  UserProfile,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateProfileInput = Partial<
  Omit<UserProfile, "id" | "createdAt" | "updatedAt">
>;

interface ProfilesData {
  profiles: UserProfile[];
  activeProfileId: string | null;
}

const CONFIG_DIR = join(homedir(), ".mcp-inspector");
const CONFIG_FILE = join(CONFIG_DIR, "auth.json");

/**
 * Manages user profiles for multi-user security testing.
 * Profiles are persisted to ~/.mcp-inspector/auth.json
 */
export class UserProfileManager {
  private profiles: UserProfile[] = [];
  private activeProfileId: string | null = null;

  constructor() {
    this.loadFromFile();
  }

  /**
   * Add a new user profile.
   */
  addProfile(input: CreateProfileInput): UserProfile {
    const now = Date.now();
    const profile: UserProfile = {
      id: randomUUID(),
      displayName: input.displayName,
      colorTag: input.colorTag || "blue",
      authToken: input.authToken,
      headers: input.headers || {},
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.push(profile);
    this.saveToFile();
    return profile;
  }

  /**
   * Update an existing profile.
   */
  updateProfile(id: string, data: UpdateProfileInput): UserProfile {
    const index = this.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Profile not found: ${id}`);
    }

    const existing = this.profiles[index];
    const updated: UserProfile = {
      ...existing,
      ...data,
      id: existing.id, // Prevent ID modification
      createdAt: existing.createdAt, // Prevent createdAt modification
      updatedAt: Date.now(),
    };

    this.profiles[index] = updated;
    this.saveToFile();
    return updated;
  }

  /**
   * Get a profile by ID.
   */
  getProfile(id: string): UserProfile | undefined {
    return this.profiles.find((p) => p.id === id);
  }

  /**
   * List all profiles.
   */
  listProfiles(): UserProfile[] {
    return [...this.profiles];
  }

  /**
   * Delete a profile by ID.
   */
  deleteProfile(id: string): boolean {
    const index = this.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }

    this.profiles.splice(index, 1);

    // Clear active profile if it was deleted
    if (this.activeProfileId === id) {
      this.activeProfileId = null;
    }

    this.saveToFile();
    return true;
  }

  /**
   * Set the active profile for requests.
   */
  setActiveProfile(id: string): void {
    const profile = this.getProfile(id);
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }
    this.activeProfileId = id;
    this.saveToFile();
    console.log(
      `🔐 Active profile set to: ${profile.displayName} (${profile.colorTag})`,
    );
  }

  /**
   * Clear the active profile.
   */
  clearActiveProfile(): void {
    this.activeProfileId = null;
    this.saveToFile();
    console.log(`🔓 Active profile cleared`);
  }

  /**
   * Get the currently active profile.
   */
  getActiveProfile(): UserProfile | undefined {
    if (!this.activeProfileId) {
      return undefined;
    }
    return this.getProfile(this.activeProfileId);
  }

  /**
   * Get the active profile ID.
   */
  getActiveProfileId(): string | null {
    return this.activeProfileId;
  }

  /**
   * Get merged headers from the active profile.
   * Combines the auth token (as Authorization header) with custom headers.
   */
  getActiveHeaders(): Record<string, string> {
    const profile = this.getActiveProfile();
    if (!profile) {
      return {};
    }

    const headers: Record<string, string> = {};

    // Add auth token as Authorization header if present
    // Use the token exactly as provided (user should include Bearer, Basic, etc.)
    if (profile.authToken) {
      headers["Authorization"] = profile.authToken;
    }

    // Merge additional custom headers
    Object.assign(headers, profile.headers);

    return headers;
  }

  /**
   * Load profiles from the config file.
   */
  loadFromFile(): void {
    try {
      if (!existsSync(CONFIG_FILE)) {
        console.log(
          `📁 No auth profiles file found at ${CONFIG_FILE}, starting fresh`,
        );
        return;
      }

      const data = readFileSync(CONFIG_FILE, "utf-8");
      const parsed: ProfilesData = JSON.parse(data);

      this.profiles = parsed.profiles || [];
      this.activeProfileId = parsed.activeProfileId || null;

      console.log(
        `📁 Loaded ${this.profiles.length} auth profile(s) from ${CONFIG_FILE}`,
      );

      if (this.activeProfileId) {
        const active = this.getActiveProfile();
        if (active) {
          console.log(
            `🔐 Active profile: ${active.displayName} (${active.colorTag})`,
          );
        }
      }
    } catch (error) {
      console.error(`Failed to load auth profiles: ${error}`);
      this.profiles = [];
      this.activeProfileId = null;
    }
  }

  /**
   * Save profiles to the config file.
   */
  saveToFile(): void {
    try {
      // Create config directory if it doesn't exist
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      const data: ProfilesData = {
        profiles: this.profiles,
        activeProfileId: this.activeProfileId,
      };

      writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save auth profiles: ${error}`);
    }
  }
}

// Singleton instance for the server
export const profileManager = new UserProfileManager();

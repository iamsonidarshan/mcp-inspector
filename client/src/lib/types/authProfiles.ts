/**
 * User profile for multi-user security testing (IDOR/BAC testing).
 * Enables quick switching between user contexts during MCP security audits.
 */
export interface UserProfile {
  id: string;
  displayName: string;
  colorTag: ProfileColorTag;
  authToken?: string;
  headers: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export type ProfileColorTag =
  | "blue"
  | "red"
  | "green"
  | "purple"
  | "orange"
  | "yellow";

export type CreateProfileInput = Omit<
  UserProfile,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateProfileInput = Partial<CreateProfileInput>;

export interface ProfilesState {
  profiles: UserProfile[];
  activeProfileId: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Color mappings for profile badges and UI elements.
 */
export const PROFILE_COLORS: Record<
  ProfileColorTag,
  { bg: string; text: string; border: string; bgLight: string }
> = {
  blue: {
    bg: "bg-blue-500",
    text: "text-blue-500",
    border: "border-blue-500",
    bgLight: "bg-blue-100 dark:bg-blue-900",
  },
  red: {
    bg: "bg-red-500",
    text: "text-red-500",
    border: "border-red-500",
    bgLight: "bg-red-100 dark:bg-red-900",
  },
  green: {
    bg: "bg-green-500",
    text: "text-green-500",
    border: "border-green-500",
    bgLight: "bg-green-100 dark:bg-green-900",
  },
  purple: {
    bg: "bg-purple-500",
    text: "text-purple-500",
    border: "border-purple-500",
    bgLight: "bg-purple-100 dark:bg-purple-900",
  },
  orange: {
    bg: "bg-orange-500",
    text: "text-orange-500",
    border: "border-orange-500",
    bgLight: "bg-orange-100 dark:bg-orange-900",
  },
  yellow: {
    bg: "bg-yellow-500",
    text: "text-yellow-500",
    border: "border-yellow-500",
    bgLight: "bg-yellow-100 dark:bg-yellow-900",
  },
} as const;

export const PROFILE_COLOR_OPTIONS: ProfileColorTag[] = [
  "blue",
  "red",
  "green",
  "purple",
  "orange",
  "yellow",
];

/**
 * Create default profiles for security testing.
 */
export const createDefaultProfiles = (): CreateProfileInput[] => [
  {
    displayName: "User A",
    colorTag: "blue",
    authToken: "",
    headers: {},
  },
  {
    displayName: "User B",
    colorTag: "red",
    authToken: "",
    headers: {},
  },
];

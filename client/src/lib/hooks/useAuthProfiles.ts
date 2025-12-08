import { useState, useEffect, useCallback } from "react";
import {
  UserProfile,
  CreateProfileInput,
  UpdateProfileInput,
} from "../types/authProfiles";
import { InspectorConfig } from "../configurationTypes";
import { getMCPProxyAddress, getMCPProxyAuthToken } from "@/utils/configUtils";

interface UseAuthProfilesReturn {
  profiles: UserProfile[];
  activeProfileId: string | null;
  activeProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  fetchProfiles: () => Promise<void>;
  addProfile: (input: CreateProfileInput) => Promise<UserProfile | null>;
  updateProfile: (
    id: string,
    data: UpdateProfileInput,
  ) => Promise<UserProfile | null>;
  deleteProfile: (id: string) => Promise<boolean>;
  selectProfile: (id: string) => Promise<boolean>;
  deselectProfile: () => Promise<boolean>;
}

/**
 * React hook for managing user authentication profiles.
 * Communicates with the backend REST API for persistence.
 */
export function useAuthProfiles(
  config: InspectorConfig,
): UseAuthProfilesReturn {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const { token: proxyAuthToken, header: proxyAuthTokenHeader } =
      getMCPProxyAuthToken(config);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (proxyAuthToken) {
      headers[proxyAuthTokenHeader] = `Bearer ${proxyAuthToken}`;
    }
    return headers;
  }, [config]);

  const getApiUrl = useCallback(
    (path: string) => `${getMCPProxyAddress(config)}${path}`,
    [config],
  );

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(getApiUrl("/auth/profiles"), {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch profiles: ${response.statusText}`);
      }

      const data = await response.json();
      setProfiles(data.profiles || []);
      setActiveProfileId(data.activeProfileId || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Failed to fetch auth profiles:", err);
    } finally {
      setLoading(false);
    }
  }, [getApiUrl, getAuthHeaders]);

  const addProfile = useCallback(
    async (input: CreateProfileInput): Promise<UserProfile | null> => {
      setError(null);
      try {
        const response = await fetch(getApiUrl("/auth/profiles"), {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create profile");
        }

        const profile: UserProfile = await response.json();
        setProfiles((prev) => [...prev, profile]);
        return profile;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Failed to create profile:", err);
        return null;
      }
    },
    [getApiUrl, getAuthHeaders],
  );

  const updateProfile = useCallback(
    async (
      id: string,
      data: UpdateProfileInput,
    ): Promise<UserProfile | null> => {
      setError(null);
      try {
        const response = await fetch(getApiUrl(`/auth/profiles/${id}`), {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update profile");
        }

        const profile: UserProfile = await response.json();
        setProfiles((prev) => prev.map((p) => (p.id === id ? profile : p)));
        return profile;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Failed to update profile:", err);
        return null;
      }
    },
    [getApiUrl, getAuthHeaders],
  );

  const deleteProfile = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      try {
        const response = await fetch(getApiUrl(`/auth/profiles/${id}`), {
          method: "DELETE",
          headers: getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete profile");
        }

        setProfiles((prev) => prev.filter((p) => p.id !== id));
        if (activeProfileId === id) {
          setActiveProfileId(null);
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Failed to delete profile:", err);
        return false;
      }
    },
    [getApiUrl, getAuthHeaders, activeProfileId],
  );

  const selectProfile = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      try {
        const response = await fetch(getApiUrl(`/auth/profiles/select/${id}`), {
          method: "POST",
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to select profile");
        }

        const data = await response.json();
        setActiveProfileId(data.activeProfileId);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Failed to select profile:", err);
        return false;
      }
    },
    [getApiUrl, getAuthHeaders],
  );

  const deselectProfile = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const response = await fetch(getApiUrl("/auth/profiles/deselect"), {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to deselect profile");
      }

      setActiveProfileId(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Failed to deselect profile:", err);
      return false;
    }
  }, [getApiUrl, getAuthHeaders]);

  // Fetch profiles on mount and when config changes
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  return {
    profiles,
    activeProfileId,
    activeProfile,
    loading,
    error,
    fetchProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    deselectProfile,
  };
}

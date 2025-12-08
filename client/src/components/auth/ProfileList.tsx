import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, Check, X, Users } from "lucide-react";
import {
  UserProfile,
  CreateProfileInput,
  UpdateProfileInput,
  PROFILE_COLORS,
} from "@/lib/types/authProfiles";
import ProfileEditor from "./ProfileEditor";

interface ProfileListProps {
  profiles: UserProfile[];
  activeProfileId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => Promise<boolean>;
  onDeselect: () => Promise<boolean>;
  onAdd: (input: CreateProfileInput) => Promise<UserProfile | null>;
  onUpdate: (
    id: string,
    data: UpdateProfileInput,
  ) => Promise<UserProfile | null>;
  onDelete: (id: string) => Promise<boolean>;
}

/**
 * List of user profiles with color-coded badges and active selection.
 * Enables quick switching between user contexts for security testing.
 */
const ProfileList = ({
  profiles,
  activeProfileId,
  loading,
  error,
  onSelect,
  onDeselect,
  onAdd,
  onUpdate,
  onDelete,
}: ProfileListProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(
    null,
  );

  const handleAddClick = () => {
    setEditingProfile(null);
    setShowEditor(true);
  };

  const handleEditClick = (profile: UserProfile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  };

  const handleSave = async (
    data: CreateProfileInput | UpdateProfileInput,
  ): Promise<UserProfile | null> => {
    if (editingProfile) {
      return onUpdate(editingProfile.id, data);
    }
    return onAdd(data as CreateProfileInput);
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingProfile(null);
  };

  const handleProfileClick = async (profile: UserProfile) => {
    if (activeProfileId === profile.id) {
      await onDeselect();
    } else {
      await onSelect(profile.id);
    }
  };

  if (showEditor) {
    return (
      <ProfileEditor
        profile={editingProfile || undefined}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{profiles.length} profile(s)</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddClick}>
          <Plus className="h-3 w-3 mr-1" />
          Add Profile
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-sm text-muted-foreground text-center py-4">
          Loading profiles...
        </div>
      )}

      {/* Empty state */}
      {!loading && profiles.length === 0 && (
        <div className="text-center py-4 text-muted-foreground">
          <p className="text-sm">No profiles configured</p>
          <p className="text-xs mt-1">
            Create profiles to simulate different users for IDOR/BAC testing
          </p>
        </div>
      )}

      {/* Profile list */}
      {!loading && profiles.length > 0 && (
        <div className="space-y-2">
          {profiles.map((profile) => {
            const isActive = activeProfileId === profile.id;
            const colors = PROFILE_COLORS[profile.colorTag];

            return (
              <div
                key={profile.id}
                className={`
                  flex items-center gap-2 p-2 rounded-lg border cursor-pointer
                  transition-all duration-200
                  ${
                    isActive
                      ? `${colors.bgLight} ${colors.border} border-2`
                      : "hover:bg-muted/50 border-transparent"
                  }
                `}
                onClick={() => handleProfileClick(profile)}
              >
                {/* Color indicator */}
                <div className={`w-3 h-3 rounded-full ${colors.bg} shrink-0`} />

                {/* Profile info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {profile.displayName}
                    </span>
                    {isActive && (
                      <Badge
                        variant="outline"
                        className={`${colors.text} ${colors.border} text-xs`}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {profile.authToken
                      ? `Token: •••${profile.authToken.slice(-4)}`
                      : "No token"}
                    {Object.keys(profile.headers).length > 0 &&
                      ` • ${Object.keys(profile.headers).length} header(s)`}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(profile);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit Profile</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(profile.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete Profile</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active profile indicator tip */}
      {activeProfileId && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded flex items-center gap-2">
          <Check className="h-3 w-3 text-green-500" />
          <span>
            Active profile headers will be injected into all MCP requests
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect();
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProfileList;

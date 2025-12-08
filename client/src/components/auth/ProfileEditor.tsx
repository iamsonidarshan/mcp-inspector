import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Plus, Trash2, X, Check } from "lucide-react";
import {
  UserProfile,
  CreateProfileInput,
  UpdateProfileInput,
  ProfileColorTag,
  PROFILE_COLORS,
  PROFILE_COLOR_OPTIONS,
} from "@/lib/types/authProfiles";

interface ProfileEditorProps {
  profile?: UserProfile; // If provided, editing mode
  onSave: (
    data: CreateProfileInput | UpdateProfileInput,
  ) => Promise<UserProfile | null>;
  onCancel: () => void;
}

/**
 * Form for creating or editing user profiles.
 */
const ProfileEditor = ({ profile, onSave, onCancel }: ProfileEditorProps) => {
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [colorTag, setColorTag] = useState<ProfileColorTag>(
    profile?.colorTag || "blue",
  );
  const [authToken, setAuthToken] = useState(profile?.authToken || "");
  const [showToken, setShowToken] = useState(false);
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    Object.entries(profile?.headers || {}).map(([key, value]) => ({
      key,
      value,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!profile;

  const handleAddHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleUpdateHeader = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    setSaving(true);
    setError(null);

    // Convert headers array to object, filtering out empty entries
    const headersObject: Record<string, string> = {};
    headers.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        headersObject[key.trim()] = value.trim();
      }
    });

    const data: CreateProfileInput | UpdateProfileInput = {
      displayName: displayName.trim(),
      colorTag,
      authToken: authToken.trim() || undefined,
      headers: headersObject,
    };

    const result = await onSave(data);
    setSaving(false);

    if (result) {
      onCancel(); // Close editor on success
    } else {
      setError("Failed to save profile");
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {isEditing ? "Edit Profile" : "New Profile"}
        </h4>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {error}
        </div>
      )}

      {/* Display Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Display Name</label>
        <Input
          placeholder="e.g., User A, Admin, Attacker"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      {/* Color Tag */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Color Tag</label>
        <Select
          value={colorTag}
          onValueChange={(value) => setColorTag(value as ProfileColorTag)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROFILE_COLOR_OPTIONS.map((color) => (
              <SelectItem key={color} value={color}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${PROFILE_COLORS[color].bg}`}
                  />
                  <span className="capitalize">{color}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Auth Token */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Authorization Header</label>
        <div className="flex gap-2">
          <Input
            type={showToken ? "text" : "password"}
            placeholder="e.g., Bearer xxx, Basic xxx, JWT xxx"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowToken(!showToken)}
          >
            {showToken ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sent as-is in Authorization header (include Bearer, Basic, etc.)
        </p>
      </div>

      {/* Custom Headers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Custom Headers</label>
          <Button variant="outline" size="sm" onClick={handleAddHeader}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        {headers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No custom headers. Click Add to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Header Name"
                  value={header.key}
                  onChange={(e) =>
                    handleUpdateHeader(index, "key", e.target.value)
                  }
                  className="font-mono text-xs"
                />
                <Input
                  placeholder="Header Value"
                  value={header.value}
                  onChange={(e) =>
                    handleUpdateHeader(index, "value", e.target.value)
                  }
                  className="font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveHeader(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              {isEditing ? "Update" : "Create"}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default ProfileEditor;

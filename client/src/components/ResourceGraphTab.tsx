import { useState, useMemo } from "react";
import { IndexedResource } from "@/lib/hooks/useResourceIndex";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Database,
  Filter,
  Trash2,
  RefreshCw,
  Users,
  Wrench,
  Search,
  Copy,
  Check,
} from "lucide-react";

interface ResourceGraphTabProps {
  resources: IndexedResource[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onClear: () => Promise<void>;
}

const TYPE_COLORS: Record<string, string> = {
  uuid: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  numeric: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  path: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  slug: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  unknown: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const USER_COLOR_MAP: Record<string, string> = {
  blue: "border-l-blue-500",
  red: "border-l-red-500",
  green: "border-l-green-500",
  purple: "border-l-purple-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-500",
};

const USER_BADGE_COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  purple:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  orange:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  yellow:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

export const ResourceGraphTab = ({
  resources,
  loading,
  error,
  onRefresh,
  onClear,
}: ResourceGraphTabProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [groupByUser, setGroupByUser] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const handleCopy = async (id: string, entryId: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(entryId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Filter resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesSearch =
        !searchTerm ||
        r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.discoveredByTool.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.fieldPath.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = !typeFilter || r.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [resources, searchTerm, typeFilter]);

  // Group by user for alternative view
  const groupedResources = useMemo(() => {
    const groups: Record<string, IndexedResource[]> = {};
    for (const r of filteredResources) {
      const key = r.discoveredFromUser;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(r);
    }
    return groups;
  }, [filteredResources]);

  // Get unique types for filter
  const uniqueTypes = useMemo(() => {
    return [...new Set(resources.map((r) => r.type))];
  }, [resources]);

  // Get unique users count
  const uniqueUsers = useMemo(() => {
    return new Set(resources.map((r) => r.discoveredFromUser)).size;
  }, [resources]);

  if (error) {
    return (
      <div className="p-4 text-red-500">
        <p>Error loading resources: {error}</p>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          className="mt-2"
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Resource Graph</h2>
            {resources.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {resources.length} IDs from {uniqueUsers} user(s)
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={resources.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search IDs, tools, paths..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={typeFilter || ""}
              onChange={(e) => setTypeFilter(e.target.value || null)}
              className="text-sm border rounded px-2 py-1 bg-background"
            >
              <option value="">All Types</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant={groupByUser ? "secondary" : "outline"}
            size="sm"
            onClick={() => setGroupByUser(!groupByUser)}
          >
            <Users className="h-4 w-4 mr-1" />
            Group by User
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredResources.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No Resources Indexed</p>
            <p className="text-sm mt-1">
              {resources.length === 0
                ? "Execute MCP tools to discover object IDs"
                : "No matches for current filters"}
            </p>
          </div>
        ) : groupByUser ? (
          // Grouped by user view
          <div className="space-y-6">
            {Object.entries(groupedResources).map(([userId, userResources]) => {
              const firstResource = userResources[0];
              return (
                <div key={userId} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        USER_BADGE_COLOR_MAP[firstResource.userColorTag] ||
                        USER_BADGE_COLOR_MAP.blue
                      }
                    >
                      {firstResource.discoveredFromUserName}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {userResources.length} resource(s)
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {userResources.map((resource) => (
                      <ResourceCard
                        key={resource.entryId}
                        resource={resource}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                        formatTimestamp={formatTimestamp}
                        showUser={false}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Flat list view
          <div className="grid gap-2">
            {filteredResources
              .slice()
              .reverse()
              .map((resource) => (
                <ResourceCard
                  key={resource.entryId}
                  resource={resource}
                  copiedId={copiedId}
                  onCopy={handleCopy}
                  formatTimestamp={formatTimestamp}
                  showUser={true}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Extracted card component for reuse
const ResourceCard = ({
  resource,
  copiedId,
  onCopy,
  formatTimestamp,
  showUser,
}: {
  resource: IndexedResource;
  copiedId: string | null;
  onCopy: (id: string, entryId: string) => void;
  formatTimestamp: (ts: number) => string;
  showUser: boolean;
}) => {
  return (
    <div
      className={`bg-secondary rounded-lg p-3 border-l-4 ${
        USER_COLOR_MAP[resource.userColorTag] || USER_COLOR_MAP.blue
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          {/* ID Value */}
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-medium truncate">
              {resource.id}
            </code>
            <button
              onClick={() => onCopy(resource.id, resource.entryId)}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="Copy ID"
            >
              {copiedId === resource.entryId ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            <Badge className={TYPE_COLORS[resource.type]} variant="secondary">
              {resource.type}
            </Badge>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {showUser && (
              <span
                className={`flex items-center gap-1 font-medium ${
                  USER_BADGE_COLOR_MAP[resource.userColorTag] || "text-blue-600"
                } px-1.5 py-0.5 rounded`}
              >
                <Users className="h-3 w-3" />
                {resource.discoveredFromUserName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {resource.discoveredByTool}
            </span>
            <span className="font-mono">{resource.fieldPath}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimestamp(resource.timestamp)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceGraphTab;

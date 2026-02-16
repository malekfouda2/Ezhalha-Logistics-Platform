import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { LoadingScreen } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, History, Calendar, ChevronRight } from "lucide-react";
import type { Policy, PolicyVersion } from "@shared/schema";

interface VersionSummary {
  id: string;
  versionNumber: number;
  title: string;
  changeNote: string | null;
  createdAt: string;
}

export default function PolicyPage() {
  const [, params] = useRoute("/policy/:slug");
  const slug = params?.slug;
  const [viewingVersion, setViewingVersion] = useState<PolicyVersion | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: policy, isLoading, error } = useQuery<Policy>({
    queryKey: ["/api/policies", slug],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Policy not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: versions } = useQuery<VersionSummary[]>({
    queryKey: ["/api/policies", slug, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${slug}/versions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug && !!policy,
  });

  async function loadVersion(versionId: string) {
    try {
      const res = await fetch(`/api/policies/${slug}/versions/${versionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Version not found");
      const data = await res.json();
      setViewingVersion(data);
      setHistoryOpen(false);
    } catch {
      setViewingVersion(null);
    }
  }

  function viewCurrentVersion() {
    setViewingVersion(null);
    setHistoryOpen(false);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingScreen message="Loading policy..." />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Policy Not Found</h1>
          <p className="text-muted-foreground">The requested policy page could not be found.</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayContent = viewingVersion ? viewingVersion.content : policy.content;
  const displayDate = viewingVersion ? viewingVersion.createdAt : policy.updatedAt;
  const hasVersions = versions && versions.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <img
            src="/assets/branding/logo.png"
            alt="ezhalha"
            className="h-8 w-auto"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {viewingVersion && (
          <div className="mb-6">
            <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <History className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm text-amber-800 dark:text-amber-300">
                    You are viewing version {viewingVersion.versionNumber} from{" "}
                    {new Date(viewingVersion.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={viewCurrentVersion}
                  data-testid="button-view-current"
                >
                  View Current Version
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        <article>
          <h1 className="text-2xl sm:text-3xl font-bold mb-6" data-testid="text-policy-title">
            {viewingVersion ? viewingVersion.title : policy.title}
          </h1>
          <div
            className="prose prose-sm sm:prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: displayContent }}
            data-testid="text-policy-content"
          />

          <div className="mt-8 pt-6 border-t flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground" data-testid="text-policy-updated">
              {viewingVersion ? "Version date" : "Last updated"}:{" "}
              {new Date(displayDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            {hasVersions && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                data-testid="button-view-history"
              >
                <History className="w-4 h-4 mr-2" />
                Version History ({versions.length})
              </Button>
            )}
          </div>
        </article>
      </main>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View previous versions of this policy
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <button
              onClick={viewCurrentVersion}
              className={`w-full text-left p-3 rounded-md transition-colors hover-elevate ${
                !viewingVersion ? "bg-accent" : ""
              }`}
              data-testid="button-version-current"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">Current Version</span>
                    <Badge variant="default" className="text-[10px]">Latest</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(policy.updatedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>

            {versions?.map((version) => (
              <button
                key={version.id}
                onClick={() => loadVersion(version.id)}
                className={`w-full text-left p-3 rounded-md transition-colors hover-elevate ${
                  viewingVersion?.id === version.id ? "bg-accent" : ""
                }`}
                data-testid={`button-version-${version.versionNumber}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-sm">
                      Version {version.versionNumber}
                    </span>
                    {version.changeNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {version.changeNote}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(version.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <footer className="border-t bg-card mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ezhalha. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { LoadingScreen } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Policy } from "@shared/schema";

export default function PolicyPage() {
  const [, params] = useRoute("/policy/:slug");
  const slug = params?.slug;

  const { data: policy, isLoading, error } = useQuery<Policy>({
    queryKey: ["/api/policies", slug],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Policy not found");
      return res.json();
    },
    enabled: !!slug,
  });

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
        <article>
          <div
            className="prose prose-sm sm:prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: policy.content }}
            data-testid="text-policy-content"
          />
          <div className="mt-8 pt-6 border-t text-sm text-muted-foreground" data-testid="text-policy-updated">
            Last updated: {new Date(policy.updatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </article>
      </main>

      <footer className="border-t bg-card mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ezhalha. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

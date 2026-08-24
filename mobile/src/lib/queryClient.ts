import { api } from "@/api/client";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body && typeof body.error === "string" && body.error.trim()) {
        throw new Error(body.error);
      }
    }

    const text = (await res.text().catch(() => "")) || res.statusText;
    throw new Error(text || `Request failed with status ${res.status}`);
  }
}

export async function readJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const body = await res.text();
    const bodyPreview = body.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      `Expected JSON response but received ${contentType || "unknown content"}. The local server may need to be restarted.${bodyPreview ? ` Response preview: ${bodyPreview}` : ""}`,
    );
  }

  return res.json() as Promise<T>;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn =
  <T,>({ on401 }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
  async ({ queryKey }) => {
    try {
      return await api.get<T>(queryKey.join("/"));
    } catch (error) {
      if (
        on401 === "returnNull" &&
        error instanceof Error &&
        "status" in error &&
        (error as { status?: number }).status === 401
      ) {
        return null as T;
      }

      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

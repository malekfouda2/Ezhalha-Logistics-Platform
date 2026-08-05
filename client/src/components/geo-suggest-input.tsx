import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MapPin, Loader2 } from "lucide-react";

export interface GeoSuggestion {
  city: string;
  postalCode: string;
  state: string;
}

interface GeoSuggestInputProps {
  mode: "city" | "postal";
  country: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (s: GeoSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Text input with city<->postal suggestions from GeoNames (via /api/geo/postal-suggest).
 * mode="city": type a city, suggestions show matching city + postal; pick fills both.
 * mode="postal": type a postal code, suggestions show matching postal + city; pick fills both.
 * Degrades to a plain input when the provider isn't configured or returns nothing.
 */
export function GeoSuggestInput({
  mode,
  country,
  value,
  onChange,
  onPick,
  placeholder,
  disabled,
  className,
  ...rest
}: GeoSuggestInputProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<GeoSuggestion[]>([]);
  const [highlight, setHighlight] = React.useState(-1);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const justPicked = React.useRef(false);
  // Track focus so we only auto-open the dropdown when the user is actually typing in
  // THIS field. Picking a city programmatically fills the sibling postal field's value,
  // which would otherwise pop that field's suggestion list open and force a second pick.
  const focusedRef = React.useRef(false);
  const testId = rest["data-testid"];

  // Close on outside click.
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced fetch when the query / country changes.
  React.useEffect(() => {
    const cc = (country || "").trim().toUpperCase();
    const q = (value || "").trim();
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (cc.length !== 2 || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const param = mode === "postal" ? "postal" : "city";
        const res = await fetch(`/api/geo/postal-suggest?country=${encodeURIComponent(cc)}&${param}=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled) return;
        const list: GeoSuggestion[] = Array.isArray(data?.results) ? data.results : [];
        setResults(list);
        setHighlight(-1);
        // Only pop the list when the user is focused here — never on a programmatic fill.
        if (list.length > 0 && focusedRef.current) setOpen(true);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, country, mode]);

  const pick = (s: GeoSuggestion) => {
    justPicked.current = true;
    onPick(s);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { focusedRef.current = true; if (results.length > 0) setOpen(true); }}
        onBlur={() => { focusedRef.current = false; }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
        data-testid={testId}
      />
      {loading && <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-popover-border bg-popover p-1 shadow-xl">
          {results.map((s, i) => (
            <button
              key={`${s.city}-${s.postalCode}-${i}`}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                i === highlight ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              data-testid={testId ? `${testId}-option-${i}` : undefined}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {mode === "postal" ? (
                  <><span className="font-medium">{s.postalCode}</span> — {s.city}</>
                ) : (
                  <><span className="font-medium">{s.city}</span> — {s.postalCode}</>
                )}
                {s.state ? <span className="text-muted-foreground">, {s.state}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import * as React from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COUNTRY_DIAL_OPTIONS,
  DEFAULT_PHONE_COUNTRY,
  composePhoneNumber,
  parsePhoneNumber,
} from "@shared/countries";

/** ISO2 → flag emoji (regional indicator symbols). */
function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export interface PhoneInputProps {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  inputClassName?: string;
  defaultCountry?: string;
  "data-testid"?: string;
}

/**
 * Phone field with an international dialing-code selector. Emits an E.164-style string
 * (e.g. "+966512345678"); an empty national number emits "".
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value,
      onChange,
      onBlur,
      placeholder = "5XX XXX XXX",
      disabled,
      id,
      className,
      inputClassName,
      defaultCountry = DEFAULT_PHONE_COUNTRY,
      ...rest
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const parsed = parsePhoneNumber(value, defaultCountry);
    const [country, setCountry] = React.useState(parsed.countryCode);

    // Sync the selector: follow an explicit dialing code in the value, or the address country
    // while the field is still empty.
    React.useEffect(() => {
      const raw = (value || "").trim();
      if (raw.startsWith("+")) {
        setCountry(parsed.countryCode);
      } else if (!raw) {
        setCountry(defaultCountry);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, defaultCountry]);

    const national = parsed.nationalNumber;
    const selected = COUNTRY_DIAL_OPTIONS.find((option) => option.code === country);
    const testId = rest["data-testid"];

    const handleCountry = (code: string) => {
      setCountry(code);
      setOpen(false);
      onChange(composePhoneNumber(code, national));
    };

    const handleNational = (raw: string) => {
      onChange(composePhoneNumber(country, raw));
    };

    return (
      <div className={cn("flex gap-2", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="shrink-0 justify-between gap-1 px-2 font-normal"
              data-testid={testId ? `${testId}-country` : undefined}
            >
              <span className="text-base leading-none">{flagEmoji(country)}</span>
              <span className="text-sm">+{selected?.dialCode || ""}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country or code..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {COUNTRY_DIAL_OPTIONS.map((option) => (
                    <CommandItem
                      key={option.code}
                      value={`${option.name} ${option.code} +${option.dialCode}`}
                      onSelect={() => handleCountry(option.code)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", option.code === country ? "opacity-100" : "opacity-0")} />
                      <span className="mr-2 text-base leading-none">{flagEmoji(option.code)}</span>
                      <span className="flex-1 truncate">{option.name}</span>
                      <span className="ml-2 text-muted-foreground">+{option.dialCode}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          ref={ref}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(event) => handleNational(event.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("flex-1", inputClassName)}
          data-testid={testId}
        />
      </div>
    );
  },
);

PhoneInput.displayName = "PhoneInput";

"use client";

import { useState, useRef, useEffect } from "react";

export interface LocaleOption {
  code: string;
  label: string;
}

/** Canonical user-facing locale codes and their display names. Must stay in
 *  sync with LOCALE_MAP in lib/faker.ts. */
export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: "en",    label: "English" },
  { code: "gb",    label: "English (UK)" },
  { code: "da",    label: "Danish" },
  { code: "nl",    label: "Dutch" },
  { code: "fi",    label: "Finnish" },
  { code: "de",    label: "German" },
  { code: "nb",    label: "Norwegian" },
  { code: "sv",    label: "Swedish" },
  { code: "cz",    label: "Czech" },
  { code: "fr",    label: "French" },
  { code: "it",    label: "Italian" },
  { code: "ja",    label: "Japanese" },
  { code: "pl",    label: "Polish" },
  { code: "pt",    label: "Portuguese" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "es",    label: "Spanish" },
  { code: "ru",    label: "Russian" },
  { code: "uk",    label: "Ukrainian" },
  { code: "zh",    label: "Chinese (Simplified)" },
  { code: "ko",    label: "Korean" },
];

interface LocalePickerProps {
  value: string[];
  onChange: (locales: string[]) => void;
  /** When provided, a hidden input with this name is rendered for form submission. */
  name?: string;
  disabled?: boolean;
}

export function LocalePicker({ value, onChange, name, disabled }: LocalePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  const available = SUPPORTED_LOCALES.filter((l) => !value.includes(l.code));

  function add(code: string) {
    onChange([...value, code]);
    if (available.length <= 1) setOpen(false);
  }

  function remove(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value.join(", ")} />}

      {/* Pill container / trigger */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) setOpen((v) => !v); }}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={[
          "flex min-h-[34px] flex-wrap items-center gap-1 rounded-xl border px-2 py-1 text-xs transition",
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50"
            : "cursor-pointer border-slate-200 bg-white hover:border-brand/50 focus:outline-none focus:border-brand",
        ].join(" ")}
      >
        {value.length === 0 && (
          <span className="px-1 text-slate-400">Select locales…</span>
        )}
        {value.map((code) => (
          <span
            key={code}
            className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand"
          >
            {code}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(code); }}
                className="leading-none opacity-60 hover:opacity-100"
                aria-label={`Remove ${code}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && available.length > 0 && (
          <span className="ml-0.5 text-slate-400">+</span>
        )}
      </div>

      {/* Dropdown */}
      {open && !disabled && available.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {available.map((locale) => (
            <button
              key={locale.code}
              type="button"
              onClick={() => add(locale.code)}
              className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="w-10 font-mono text-xs text-slate-500">{locale.code}</span>
              <span className="text-xs text-slate-700">{locale.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";
const KEY = "stride-appearance";
function readPreference() {
  try {
    return localStorage.getItem(KEY) ?? "system";
  } catch {
    return "system";
  }
}
function apply(preference: string) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
/** Keep system appearance in sync without rerendering the application. */
export function AppearanceSync() {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => apply(readPreference());
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return null;
}
export function AppearanceSettings() {
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (select.current) select.current.value = readPreference();
  }, []);
  return (
    <section
      className="workspace-panel appearance-settings"
      aria-labelledby="appearance-title"
    >
      <div>
        <h2 id="appearance-title">Appearance</h2>
        <p>
          Choose a comfortable workspace. Your preference stays on this device.
        </p>
      </div>
      <label>
        Theme
        <select
          ref={select}
          defaultValue="system"
          onChange={(e) => {
            const value = e.target.value;
            try {
              localStorage.setItem(KEY, value);
            } catch {}
            apply(value);
          }}
        >
          <option value="system">Use device setting</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </section>
  );
}

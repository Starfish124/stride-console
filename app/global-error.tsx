"use client";

/**
 * When the layout itself throws.
 *
 * app/error.tsx renders inside the root layout, so it cannot catch a failure
 * in that layout. This replaces the whole document instead, which is why it
 * ships its own html and body and leans on inline styles: at this point the
 * stylesheet may be exactly what did not load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F6F7FA",
          color: "#0A0C14",
          fontFamily: "-apple-system, Helvetica, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="#2E30F8" aria-hidden>
            <polygon points="19.43,1 9.75,1 1.37,12.19 10.99,12.19" />
            <polygon points="22.63,11.41 14.03,11.41 5.33,23 13.97,23" />
          </svg>
          <h1 style={{ fontSize: "26px", margin: "18px 0 8px", lineHeight: 1.15 }}>
            The console could not start.
          </h1>
          <p style={{ margin: 0, color: "#5A6172", lineHeight: 1.6 }}>
            This is the app shell failing rather than one page. Your data is
            untouched on the Mac. If reloading does not help, restart it with{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>stride</code>.
          </p>
          <p
            style={{
              margin: "18px 0 0",
              padding: "12px 14px",
              background: "#fff",
              border: "1px solid #E5E8F0",
              borderRadius: "12px",
              fontFamily: "ui-monospace, monospace",
              fontSize: "12px",
              color: "#5A6172",
              overflowX: "auto",
            }}
          >
            {error.message || "No message came with it."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "20px",
              padding: "11px 18px",
              borderRadius: "10px",
              border: "1px solid #0A0C14",
              background: "#0A0C14",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Reload.
          </button>
        </div>
      </body>
    </html>
  );
}

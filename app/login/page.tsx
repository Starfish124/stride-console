import { Wordmark } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main id="workspace-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-start gap-3">
          <Wordmark height={40} />
          <p className="eyebrow text-slate">Stride console — founders only</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

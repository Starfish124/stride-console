import { Wordmark } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-start gap-3">
          <Wordmark size="text-3xl" />
          <p className="eyebrow text-slate">Stride console — founders only</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

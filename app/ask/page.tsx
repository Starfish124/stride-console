import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
import { AskStride } from "@/components/AskStride";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main assistant-page">
        <PageHeading eyebrow="Your assistant" title="Ask Stride" description="Get clarity on your clients, projects, and next steps. Answers draw on what your workspace knows."/>


        <AskStride />
      </main>
    </div>
  );
}

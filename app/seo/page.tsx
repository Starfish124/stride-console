import { Header } from "@/components/ui";
import { PageHeading } from "@/components/WorkspaceUI";
import { SeoDashboard } from "@/components/SeoDashboard";

export const dynamic = "force-dynamic";

export default function SeoPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main id="workspace-content" tabIndex={-1} className="workspace-main">
        <PageHeading eyebrow="Growth" title="Website performance" description="Review search visibility, content, and the changes waiting for your attention."/>

        <SeoDashboard />
      </main>
    </div>
  );
}

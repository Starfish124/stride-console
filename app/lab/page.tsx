import { LabPanel } from "@/components/LabPanel";
import { Header } from "@/components/ui";
import { Ramp } from "@/components/Ramp";

export const dynamic = "force-dynamic";

/**
 * The lab: throwaway sandboxes for experiments.
 *
 * Each sandbox is a lightweight Linux VM (Apple's container CLI) with one
 * folder of its own under ~/stride-lab. Whatever runs inside cannot touch the
 * live console, the launchd jobs or the shared repos. Destroy and it is gone.
 */
export default function LabPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-4xl px-6 pb-20">
        <section className="py-10">
          <Ramp width={52} className="mb-4 text-indigo" />
          <p className="eyebrow text-slate">The lab</p>
          <h1 className="title-large mt-3 text-ink">
            Break things <span className="accent">in here</span>, not out there.
          </h1>
          <p className="mt-2 max-w-xl text-slate">
            Throwaway virtual machines for trying new systems. Each gets its own folder; an agent
            can work on the files from a workspace project, and the experiment runs inside the VM
            where the live console does not exist.
          </p>
        </section>
        <LabPanel />
      </main>
    </div>
  );
}

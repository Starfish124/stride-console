import { Loader } from "@/components/Loader";

/**
 * What a tap looks like before the answer arrives.
 *
 * Every page here is server-rendered on demand, so a navigation is a round
 * trip — and without this, tapping a tab did nothing visible until the new
 * page arrived. On a phone over Tailscale that reads as a dropped tap, and the
 * founder taps again.
 *
 * The house loader, centred, and nothing else. A skeleton pretending to be the
 * page it is about to become is more work to maintain than it is worth on a
 * console with eighteen different layouts.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <Loader size={34} label="Loading" />
    </div>
  );
}

import { copy } from "@/lib/content";
import { Icon } from "../icons";

/** Shown only while the AI layer is the dev stub. */
export function DevBanner() {
  return (
    <p className="flex items-center gap-2 bg-locked-soft px-4 py-2 text-small text-locked md:px-8">
      <Icon name="info" className="size-4" />
      {copy.shell.devBanner}
    </p>
  );
}

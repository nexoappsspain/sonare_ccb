import type { ReactNode } from "react";
import { AudioGate } from "@/components/studio/AudioGate";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <AudioGate>{children}</AudioGate>;
}

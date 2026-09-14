import Link from "next/link";
import { LydraLogo } from "@/components/brand/LydraLogo";
export function WorkspaceHeader({ context }: { context: string }) {
  return <header className="workspace-header shell">
    <div className="workspace-header-left"><LydraLogo compact /><span className="header-divider" aria-hidden="true" /><span className="workspace-context">{context}</span></div>
    <div className="workspace-header-right"><Link className="back-link" href="/">Voltar à Lydra <span aria-hidden="true">↗</span></Link></div>
  </header>;
}

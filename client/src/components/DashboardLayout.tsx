import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LogOut, PanelLeft, TerminalSquare } from "lucide-react";
import { useSidebar } from "./ui/sidebar";

type DashboardLayoutProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
};

export default function DashboardLayout({ children, sidebar }: DashboardLayoutProps) {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-[#080b10]" />;
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#080b10] px-6 text-[#e8edf5]">
        <section className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#101722] p-9 shadow-2xl shadow-black/40">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20">
            <TerminalSquare className="h-6 w-6" />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/70">Terminal Kit</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Central controller access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Sign in to manage your registered instances and terminal sessions.</p>
          <Button onClick={() => startLogin()} className="mt-8 h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">Sign in to continue</Button>
        </section>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardShell sidebar={sidebar}>{children}</DashboardShell>
    </SidebarProvider>
  );
}

function DashboardShell({ children, sidebar }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-white/8 bg-[#0b1018] text-slate-200">
        <SidebarHeader className="h-[76px] border-b border-white/8 px-3 py-3">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <button onClick={toggleSidebar} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-[#062018] shadow-[0_0_28px_rgba(52,211,153,0.17)] transition active:scale-[0.97]" aria-label="Toggle instance navigation">
              <TerminalSquare className="h-[19px] w-[19px]" />
            </button>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[15px] font-semibold tracking-tight text-white">Terminal Kit</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Central controller</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">{sidebar}</SidebarContent>
        <SidebarFooter className="border-t border-white/8 p-3">
          <div className="flex items-center gap-3 rounded-xl p-1.5 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8 shrink-0 border border-white/10">
              <AvatarFallback className="bg-white/5 text-[11px] font-semibold text-emerald-200">{user?.name?.slice(0, 1).toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium text-slate-200">{user?.name || "Controller user"}</p>
              <button onClick={logout} className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500 transition hover:text-rose-300"><LogOut className="h-3 w-3" /> Sign out</button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#080b10] text-[#e8edf5]">
        {isMobile ? (
          <header className="flex h-14 items-center border-b border-white/8 bg-[#0b1018]/95 px-3 backdrop-blur">
            <SidebarTrigger className="text-slate-300" />
            <span className="ml-2 text-sm font-semibold text-white">Terminal Kit</span>
          </header>
        ) : null}
        <main className="min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, CheckCircle2, Cpu, Download, HardDrive, KeyRound, Loader2, LogOut, MemoryStick, Pencil, RefreshCw, Server, TerminalSquare, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

type InstanceStatus = "pending" | "online" | "offline" | "blocked";
type Availability = "active" | "idle" | "unknown";

type Instance = {
  id: number;
  name: string;
  instanceUrl: string;
  status: InstanceStatus;
  availability: Availability;
  availabilityHttpStatus: number | null;
  availabilityCheckedAt: string | null;
  hostname: string | null;
  agentVersion: string | null;
  osPlatform: string | null;
  architecture: string | null;
  cpuCount: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryTotalMb: number;
  diskPercent: number;
  diskTotalMb: number;
  diskFreeMb: number;
  activeSessions: number;
  lastSeenAt: string | null;
};

type FleetData = {
  summary: {
    instances: { registered: number; online: number; offline: number; pending: number; active: number; idle: number; blocked: number };
    capacity: { onlineCpuCores: number; onlineMemoryTotalMb: number; onlineMemoryAvailableMb: number; onlineDiskTotalMb: number; onlineDiskFreeMb: number; activeSessions: number };
    utilization: { cpuPercent: number; memoryPercent: number; diskPercent: number };
  };
  instances: Instance[];
};

type LifecycleAction = "block" | "delete";
type Confirmation = { action: LifecycleAction; instance: Instance } | null;

const formatGb = (mb: number) => `${(mb / 1024).toFixed(mb >= 10_240 ? 0 : 1)} GB`;
const formatCheckedAt = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(value)) : "Not checked yet";
const statusStyle: Record<InstanceStatus, string> = {
  online: "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20",
  offline: "bg-rose-400/10 text-rose-300 ring-rose-300/20",
  pending: "bg-amber-400/10 text-amber-300 ring-amber-300/20",
  blocked: "bg-violet-400/10 text-violet-200 ring-violet-300/20",
};
const availabilityStyle: Record<Availability, string> = {
  active: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/20",
  idle: "bg-amber-400/10 text-amber-200 ring-amber-300/20",
  unknown: "bg-slate-400/10 text-slate-300 ring-slate-300/20",
};

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);

  const loadFleet = async () => {
    setFleetError(null);
    const response = await fetch("/api/admin/inventory", { credentials: "same-origin" });
    if (response.status === 401) { setAuthenticated(false); return; }
    const payload = await response.json() as { data?: FleetData; error?: string };
    if (!response.ok || !payload.data) {
      const message = payload.error ?? "Fleet inventory could not be loaded.";
      setFleetError(message);
      throw new Error(message);
    }
    setFleet(payload.data);
  };

  useEffect(() => {
    void (async () => {
      try {
        const session = await fetch("/api/admin/session", { credentials: "same-origin" });
        const payload = await session.json() as { authenticated?: boolean };
        const isAuthenticated = Boolean(payload.authenticated);
        setAuthenticated(isAuthenticated);
        if (isAuthenticated) await loadFleet().catch(() => undefined);
      } catch {
        setAuthenticated(false);
      }
    })();
  }, []);

  const orderedInstances = useMemo(() => {
    const statusOrder: Record<InstanceStatus, number> = { online: 0, blocked: 1, pending: 2, offline: 3 };
    const availabilityOrder: Record<Availability, number> = { active: 0, idle: 1, unknown: 2 };
    return [...(fleet?.instances ?? [])].sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || availabilityOrder[left.availability] - availabilityOrder[right.availability] || left.name.localeCompare(right.name));
  }, [fleet]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error("Incorrect administrator password.");
      setPassword("");
      setAuthenticated(true);
      await loadFleet().catch(() => undefined);
      toast.success("Administrator session opened.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    setFleet(null);
    setAuthenticated(false);
  }

  async function downloadProvisioningDockerfile() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/provisioning/dockerfile", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Provisioning Dockerfile could not be created.");
      const blob = await response.blob();
      const file = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = file;
      anchor.download = "Dockerfile.terminal-kit";
      anchor.click();
      URL.revokeObjectURL(file);
      toast.success("Dockerfile downloaded. Deploy it; the agent will enroll itself.");
      await loadFleet();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Download failed."); }
    finally { setLoading(false); }
  }

  async function saveName(instanceId: number) {
    try {
      const response = await fetch(`/api/admin/instances/${instanceId}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: editingName }) });
      if (!response.ok) throw new Error("Instance could not be renamed.");
      setEditingId(null);
      await loadFleet();
      toast.success("Instance renamed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Rename failed."); }
  }

  async function updateLifecycle(instance: Instance, action: "block" | "unblock" | "refresh" | "delete") {
    const key = `${action}-${instance.id}`;
    const endpoint = action === "delete" ? `/api/admin/instances/${instance.id}` : action === "refresh" ? `/api/admin/instances/${instance.id}/availability` : `/api/admin/instances/${instance.id}/${action}`;
    setMutatingKey(key);
    try {
      const response = await fetch(endpoint, { method: action === "delete" ? "DELETE" : "POST", credentials: "same-origin" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "Instance operation could not be completed.");
      }
      await loadFleet();
      const message = action === "block" ? `${instance.name} is blocked from command routing.` : action === "unblock" ? `${instance.name} was unblocked and checked.` : action === "refresh" ? `${instance.name} availability was refreshed.` : `${instance.name} was permanently deleted.`;
      toast.success(message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Instance operation failed."); }
    finally { setMutatingKey(null); }
  }

  function runConfirmedAction() {
    if (!confirmation) return;
    const { action, instance } = confirmation;
    setConfirmation(null);
    void updateLifecycle(instance, action);
  }

  if (authenticated === null) return <main className="grid min-h-screen place-items-center bg-[#070b10]"><Loader2 className="h-5 w-5 animate-spin text-emerald-300" /></main>;

  if (!authenticated) return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.12),transparent_36%),#070b10] px-5 text-slate-100"><section className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0d141e]/95 p-7 shadow-2xl shadow-black/40 sm:p-9"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-[#062018] shadow-[0_0_24px_rgba(52,211,153,0.16)]"><TerminalSquare className="h-6 w-6" /></div><p className="mt-7 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Terminal-Kit Control Plane</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Administrator access</h1><p className="mt-3 text-sm leading-6 text-slate-400">Sign in to download a provisioning Dockerfile and manage automatically enrolled instances.</p><form className="mt-7 space-y-4" onSubmit={login}><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Administrator password</label><Input value={password} onChange={event => setPassword(event.target.value)} type="password" required autoComplete="current-password" className="h-11 border-white/10 bg-[#070b10] text-slate-100 focus-visible:ring-emerald-400/45" /><Button disabled={loading || !password} className="h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Open control plane</Button></form></section></main>;

  const summary = fleet?.summary;
  const dialogIsDelete = confirmation?.action === "delete";
  return <main className="min-h-screen bg-[#070b10] text-slate-100"><header className="sticky top-0 z-10 border-b border-white/8 bg-[#0b1018]/90 px-5 py-4 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-[#062018]"><TerminalSquare className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-white">Terminal Kit</p><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Fleet control plane</p></div></div><div className="flex items-center gap-2"><Button onClick={() => void loadFleet().catch(() => undefined)} variant="ghost" className="h-9 rounded-lg text-slate-300 hover:bg-white/[0.06] hover:text-white"><RefreshCw className="h-4 w-4" />Refresh all</Button><Button onClick={logout} variant="ghost" className="h-9 rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></Button></div></div></header>
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10"><section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]"><div><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Automatic agent enrollment</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Deploy a Dockerfile. The instance joins itself.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">The controller probes each registered endpoint when fleet inventory is read. A <strong className="font-medium text-cyan-200">200 response</strong> is Active and command-ready; a <strong className="font-medium text-amber-200">502 or unreachable endpoint</strong> is Idle and excluded from routing until it responds again.</p></div><section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/75">New instance</p><Button disabled={loading} onClick={downloadProvisioningDockerfile} className="mt-4 h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download provisioning Dockerfile</Button><p className="mt-3 text-xs leading-5 text-slate-400">No controller key, name, or endpoint is entered here.</p></section></section>
      {fleetError ? <section role="alert" className="mt-6 flex flex-col gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"><p>Inventory unavailable: {fleetError}</p><Button onClick={() => void loadFleet().catch(() => undefined)} variant="outline" className="h-8 border-rose-300/25 text-rose-100 hover:bg-rose-300/10">Retry</Button></section> : null}
      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={<Server />} label="Active agents" value={`${summary?.instances.active ?? 0} / ${summary?.instances.registered ?? 0}`} detail={`${summary?.instances.idle ?? 0} idle · ${summary?.instances.blocked ?? 0} blocked`} /><Metric icon={<Wifi />} label="Online agents" value={`${summary?.instances.online ?? 0}`} detail={`${summary?.instances.pending ?? 0} pending`} /><Metric icon={<Cpu />} label="Ready CPU" value={`${summary?.capacity.onlineCpuCores ?? 0} cores`} detail={`${summary?.utilization.cpuPercent ?? 0}% utilization`} /><Metric icon={<MemoryStick />} label="Ready RAM" value={formatGb(summary?.capacity.onlineMemoryAvailableMb ?? 0)} detail={`${formatGb(summary?.capacity.onlineMemoryTotalMb ?? 0)} total`} /><Metric icon={<HardDrive />} label="Ready disk" value={formatGb(summary?.capacity.onlineDiskFreeMb ?? 0)} detail={`${formatGb(summary?.capacity.onlineDiskTotalMb ?? 0)} total`} /></section>
      <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0d141e]"><div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div><h2 className="text-sm font-semibold text-white">Registered instances</h2><p className="mt-0.5 text-xs text-slate-500">Endpoint availability, lifecycle state, host identity, and reported resources.</p></div><span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{orderedInstances.length} tracked</span></div>{orderedInstances.length ? <div className="divide-y divide-white/6">{orderedInstances.map(instance => {
        const isBusy = Boolean(mutatingKey?.endsWith(`-${instance.id}`));
        return <article key={instance.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(210px,1fr)_0.9fr_1.15fr_0.85fr_auto]"><div><div className="flex items-center gap-2">{editingId === instance.id ? <><Input value={editingName} onChange={event => setEditingName(event.target.value)} className="h-8 border-white/10 bg-[#070b10] text-sm text-white" /><Button size="sm" onClick={() => void saveName(instance.id)} className="h-8 bg-emerald-400 text-[#062018] hover:bg-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /></Button></> : <><p className="truncate text-sm font-semibold text-white">{instance.name}</p><button onClick={() => { setEditingId(instance.id); setEditingName(instance.name); }} className="text-slate-500 transition hover:text-emerald-300" aria-label={`Rename ${instance.name}`}><Pencil className="h-3.5 w-3.5" /></button></>}</div><p className="mt-1 truncate font-mono text-[11px] text-slate-500">{instance.instanceUrl}</p></div><div><div className="flex flex-wrap gap-1.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider ring-1 ${statusStyle[instance.status]}`}>{instance.status === "online" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{instance.status}</span><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider ring-1 ${availabilityStyle[instance.availability]}`}>{instance.availability === "active" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{instance.availability}</span></div><p className="mt-2 text-xs text-slate-500">{instance.hostname ?? "Awaiting agent identity"} {instance.agentVersion ? `· v${instance.agentVersion}` : ""}</p><p className="mt-1 text-[11px] text-slate-600">Checked {formatCheckedAt(instance.availabilityCheckedAt)}{instance.availabilityHttpStatus ? ` · HTTP ${instance.availabilityHttpStatus}` : ""}</p></div><div className="grid grid-cols-3 gap-2 text-xs"><Resource label="CPU" value={`${instance.cpuPercent}%`} detail={`${instance.cpuCount} cores`} /><Resource label="RAM" value={`${instance.memoryPercent}%`} detail={formatGb(instance.memoryTotalMb)} /><Resource label="Disk" value={`${instance.diskPercent}%`} detail={`${formatGb(instance.diskFreeMb)} free`} /></div><div className="text-xs text-slate-500"><p>{instance.osPlatform ?? "—"} / {instance.architecture ?? "—"}</p><p className="mt-1">{instance.activeSessions} active sessions</p></div><div className="flex flex-wrap items-start gap-2 lg:justify-end"><Button disabled={isBusy} size="sm" onClick={() => void updateLifecycle(instance, "refresh")} variant="outline" className="h-8 border-white/10 bg-white/[0.025] text-slate-300 hover:bg-white/[0.07] hover:text-white"><RefreshCw className={`h-3.5 w-3.5 ${mutatingKey === `refresh-${instance.id}` ? "animate-spin" : ""}`} /><span className="sr-only">Refresh availability</span></Button>{instance.status === "blocked" ? <Button disabled={isBusy} size="sm" onClick={() => void updateLifecycle(instance, "unblock")} variant="outline" className="h-8 border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100 hover:bg-cyan-300/[0.12]">Unblock</Button> : <Button disabled={isBusy} size="sm" onClick={() => setConfirmation({ action: "block", instance })} variant="outline" className="h-8 border-violet-300/20 bg-violet-300/[0.06] text-violet-100 hover:bg-violet-300/[0.12]"><Ban className="h-3.5 w-3.5" />Block</Button>}<Button disabled={isBusy} size="sm" onClick={() => setConfirmation({ action: "delete", instance })} variant="outline" className="h-8 border-rose-300/20 bg-rose-300/[0.06] px-2 text-rose-200 hover:bg-rose-300/[0.12]" aria-label={`Delete ${instance.name}`}><Trash2 className="h-3.5 w-3.5" /></Button></div></article>;
      })}</div> : <div className="px-5 py-14 text-center"><Server className="mx-auto h-6 w-6 text-slate-600" /><p className="mt-3 text-sm text-slate-400">No agents are registered yet.</p><p className="mt-1 text-xs text-slate-600">Download and deploy a provisioning Dockerfile to add the first instance automatically.</p></div>}</section></div>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(null); }}><AlertDialogContent className="border-white/10 bg-[#101822] text-slate-100"><AlertDialogHeader><AlertDialogTitle>{dialogIsDelete ? "Permanently delete this instance?" : "Block this instance from routing?"}</AlertDialogTitle><AlertDialogDescription className="leading-6 text-slate-400">{dialogIsDelete ? <><strong className="font-medium text-slate-200">{confirmation?.instance.name}</strong> will be removed from the controller registry. Its deployed agent may re-enroll if it still has valid enrollment credentials.</> : <><strong className="font-medium text-slate-200">{confirmation?.instance.name}</strong> will remain registered, but the controller will never route new commands to it until you explicitly unblock it.</>}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white">Cancel</AlertDialogCancel><AlertDialogAction onClick={runConfirmedAction} className={dialogIsDelete ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-violet-500 text-white hover:bg-violet-400"}>{dialogIsDelete ? "Delete instance" : "Block instance"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <section className="rounded-2xl border border-white/8 bg-[#0d141e] p-4"><div className="flex items-center gap-2 text-slate-500"><span className="text-emerald-300">{icon}</span><p className="font-mono text-[10px] uppercase tracking-[0.14em]">{label}</p></div><p className="mt-3 text-xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></section>;
}

function Resource({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg bg-white/[0.035] px-2 py-1.5"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">{label}</p><p className="mt-0.5 text-slate-200">{value}</p><p className="mt-0.5 text-[10px] text-slate-500">{detail}</p></div>;
}

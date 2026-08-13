import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Clipboard, Copy, Cpu, ExternalLink, FileCode2, HardDrive, History, Loader2, MoreHorizontal, Play, Plus, Radio, RefreshCw, SendHorizontal, Server, Trash2, TriangleAlert } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StreamEvent = {
  sessionId: string;
  sequence: number;
  kind: "stdout" | "stderr" | "stdin" | "status";
  payload: string;
  createdAt: Date | string;
};

function statusTone(status: string) {
  if (status === "online") return "bg-emerald-400";
  if (status === "pending") return "bg-amber-400";
  return "bg-slate-500";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not yet seen";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function meterColor(value: number) {
  if (value >= 85) return "bg-rose-400";
  if (value >= 65) return "bg-amber-400";
  return "bg-emerald-400";
}

export default function Home() {
  const utils = trpc.useUtils();
  const instancesQuery = trpc.controller.instances.list.useQuery(undefined, { refetchInterval: 20_000 });
  const instances = instancesQuery.data ?? [];
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | undefined>();
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [generatedDockerfile, setGeneratedDockerfile] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [command, setCommand] = useState("");
  const [stdin, setStdin] = useState("");
  const [routeTarget, setRouteTarget] = useState("least-loaded");
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamState, setStreamState] = useState<"idle" | "live" | "reconnecting" | "disconnected">("idle");
  const [streamReconnect, setStreamReconnect] = useState(0);

  useEffect(() => {
    if (!selectedInstanceId && instances[0]) {
      setSelectedInstanceId(instances[0].id);
      setRouteTarget(String(instances[0].id));
    }
    if (selectedInstanceId && !instances.some(instance => instance.id === selectedInstanceId)) {
      setSelectedInstanceId(instances[0]?.id);
      setRouteTarget(instances[0] ? String(instances[0].id) : "least-loaded");
    }
  }, [instances, selectedInstanceId]);

  const selectedInstance = instances.find(instance => instance.id === selectedInstanceId);
  const detailsQuery = trpc.controller.instances.details.useQuery({ id: selectedInstanceId ?? 0 }, { enabled: Boolean(selectedInstanceId) });
  const sessions = detailsQuery.data?.sessions ?? [];
  const selectedSession = sessions.find(session => session.id === selectedSessionId) ?? sessions[0];
  const historyQuery = trpc.controller.sessions.history.useQuery({ sessionId: selectedSession?.id ?? "" }, { enabled: Boolean(selectedSession?.id) });

  useEffect(() => {
    if (selectedSession && selectedSessionId !== selectedSession.id) setSelectedSessionId(selectedSession.id);
  }, [selectedSession, selectedSessionId]);

  useEffect(() => {
    if (!historyQuery.data) return;
    setStreamEvents(historyQuery.data.events.map(event => ({ ...event, createdAt: event.createdAt })));
  }, [historyQuery.data]);

  useEffect(() => {
    if (!selectedSession?.id) return;
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let retries = 0;
    const connect = async () => {
      if (stopped) return;
      setStreamState(retries ? "reconnecting" : "idle");
      try {
        const check = await fetch(`/api/sessions/${selectedSession.id}/stream?preflight=1`);
        if (!check.ok) {
          setStreamState("disconnected");
          return;
        }
      } catch {
        if (retries >= 2) { setStreamState("disconnected"); return; }
        retries += 1;
        setStreamState("reconnecting");
        retryTimer = setTimeout(() => { void connect(); }, Math.min(10_000, 1_000 * retries));
        return;
      }
      if (stopped) return;
      source = new EventSource(`/api/sessions/${selectedSession.id}/stream`);
      source.onopen = () => { retries = 0; setStreamState("live"); };
      source.addEventListener("terminal", ((message: MessageEvent<string>) => {
        const event = JSON.parse(message.data) as StreamEvent;
        setStreamEvents(current => {
          const fingerprint = `${event.sequence}-${event.kind}-${event.payload}`;
          return current.some(item => `${item.sequence}-${item.kind}-${item.payload}` === fingerprint) ? current : [...current, event];
        });
      }) as EventListener);
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        retries += 1;
        setStreamState("reconnecting");
        if (retries >= 3) { setStreamState("disconnected"); return; }
        retryTimer = setTimeout(() => { void connect(); }, Math.min(10_000, 1_000 * retries));
      };
    };
    void connect();
    return () => { stopped = true; source?.close(); if (retryTimer) clearTimeout(retryTimer); };
  }, [selectedSession?.id, streamReconnect]);

  const registerMutation = trpc.controller.instances.register.useMutation({
    onSuccess: result => {
      utils.controller.instances.list.invalidate();
      setSelectedInstanceId(result.instance.id);
      setRouteTarget(String(result.instance.id));
      setGeneratedDockerfile(result.dockerfile);
      setInstanceName("");
      setInstanceUrl("");
      setRegisterOpen(false);
      setProtocolOpen(true);
      if (result.deliveryStatus === "sent") toast.success("Dockerfile communication protocol sent to the instance URL.");
      else toast.warning("Dockerfile generated; the instance URL did not acknowledge delivery.");
    },
    onError: error => toast.error(error.message),
  });

  const executeMutation = trpc.controller.sessions.create.useMutation({
    onSuccess: result => {
      setCommand("");
      setSelectedInstanceId(result.instanceId);
      setRouteTarget(String(result.instanceId));
      setSelectedSessionId(result.sessionId);
      void utils.controller.instances.details.invalidate();
      void utils.controller.instances.list.invalidate();
      toast.success(`Command routed to ${result.route}.`);
    },
    onError: error => toast.error(error.message),
  });

  const stdinMutation = trpc.controller.sessions.stdin.useMutation({
    onSuccess: () => setStdin(""),
    onError: error => toast.error(error.message),
  });

  const renameMutation = trpc.controller.instances.rename.useMutation({ onSuccess: () => { void utils.controller.instances.list.invalidate(); void utils.controller.instances.details.invalidate(); } });
  const removeMutation = trpc.controller.instances.remove.useMutation({
    onSuccess: () => { setSelectedInstanceId(undefined); setSelectedSessionId(undefined); void utils.controller.instances.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  const onlineCount = useMemo(() => instances.filter(instance => instance.status === "online").length, [instances]);
  const running = selectedSession?.state === "running";

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    registerMutation.mutate({ name: instanceName, instanceUrl });
  }

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim()) return;
    executeMutation.mutate({ command, instanceId: routeTarget === "least-loaded" ? undefined : Number(routeTarget) });
  }

  function submitStdin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession || !stdin) return;
    stdinMutation.mutate({ sessionId: selectedSession.id, input: stdin });
  }

  function downloadDockerfile() {
    const blob = new Blob([generatedDockerfile], { type: "text/plain;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "Dockerfile.terminal-kit";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-2 pt-4 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Registered instances</span>
          <span className="rounded-full border border-emerald-300/15 bg-emerald-300/5 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">{onlineCount}/{instances.length}</span>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="space-y-1 pb-4">
          {instancesQuery.isLoading ? <div className="px-3 py-5 text-xs text-slate-500">Loading instances…</div> : null}
          {instancesQuery.isError ? <div className="px-3 py-5 text-xs text-rose-300 group-data-[collapsible=icon]:hidden"><TriangleAlert className="mb-2 h-4 w-4" />Could not load instances.<button onClick={() => instancesQuery.refetch()} className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-emerald-300 hover:text-emerald-200">Retry</button></div> : null}
          {!instancesQuery.isLoading && instances.length === 0 ? <div className="px-3 py-5 text-xs leading-5 text-slate-500 group-data-[collapsible=icon]:hidden">No registered instances.</div> : null}
          {instances.map(instance => (
            <button key={instance.id} onClick={() => { setSelectedInstanceId(instance.id); setRouteTarget(String(instance.id)); setSelectedSessionId(undefined); }} className={cn("group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.985] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0", instance.id === selectedInstanceId ? "bg-white/[0.08] text-white shadow-inner shadow-black/10" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-200") }>
              <span className={cn("h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor]", statusTone(instance.status), instance.status === "online" ? "text-emerald-400" : "text-slate-500")} />
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-xs font-medium">{instance.name}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-slate-500">CPU {instance.cpuPercent}% · MEM {instance.memoryPercent}%</span>
              </span>
              {instance.id === selectedInstanceId ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-emerald-300 group-data-[collapsible=icon]:hidden" /> : null}
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-white/8 p-2">
        <Button onClick={() => setRegisterOpen(true)} className="h-10 w-full rounded-xl bg-white/[0.07] text-xs font-medium text-slate-200 hover:bg-white/[0.12] group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:px-0" variant="ghost"><Plus className="h-4 w-4 shrink-0" /><span className="group-data-[collapsible=icon]:hidden">Register instance</span></Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout sidebar={sidebar}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_87%_-8%,rgba(16,185,129,0.09),transparent_28%),radial-gradient(circle_at_56%_25%,rgba(38,88,115,0.08),transparent_36%),#080b10] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
        <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/70"><Radio className="h-3.5 w-3.5" /> Controller online</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Command center</h1>
            <p className="mt-1 text-sm text-slate-500">Manage remote instances and orchestrate terminal sessions.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 sm:block"><span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Fleet</span><span className="ml-3 text-sm font-medium text-slate-200">{onlineCount} <span className="text-slate-500">online</span></span></div>
            <Button onClick={() => setRegisterOpen(true)} className="h-10 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-[#062018] shadow-[0_12px_30px_rgba(52,211,153,0.14)] hover:bg-emerald-300"><Plus className="h-4 w-4" /> Register instance</Button>
          </div>
        </header>

        {!selectedInstance ? (
          <section className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed border-white/12 bg-white/[0.018] p-8 text-center">
            <div className="max-w-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/5 text-emerald-300"><Server className="h-6 w-6" /></div>
              <h2 className="mt-5 text-lg font-semibold text-white">Register your first instance</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Enter an instance name and URL. Terminal-Kit generates and sends the Dockerfile as the communication protocol.</p>
              <Button onClick={() => setRegisterOpen(true)} className="mt-6 rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">Register instance</Button>
            </div>
          </section>
        ) : (
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-white/9 bg-[#0d131c]/80 shadow-2xl shadow-black/15 backdrop-blur-sm">
              <div className="flex flex-col gap-4 border-b border-white/8 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", statusTone(selectedInstance.status))} /><h2 className="truncate text-sm font-semibold text-white">{selectedInstance.name}</h2><Badge className="border-0 bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] font-normal text-slate-400 hover:bg-white/[0.07]">{selectedInstance.status}</Badge></div>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{selectedInstance.instanceUrl}</p>
                </div>
                <div className="flex items-center gap-2"><span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{selectedSession ? selectedSession.state : "No active session"}</span>{selectedSession ? <span className={cn("h-1.5 w-1.5 rounded-full", streamState === "live" ? "bg-emerald-400 animate-pulse" : streamState === "reconnecting" ? "bg-amber-400 animate-pulse" : "bg-slate-600")} /> : null}</div>
              </div>
              <ScrollArea className="h-[410px] bg-[#070a0f] sm:h-[460px]">
                <div className="min-h-full p-4 font-mono text-[12px] leading-6 text-slate-300 sm:p-5">
                  {historyQuery.isLoading ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading terminal history</div> : null}
                  {historyQuery.isError ? <div className="flex items-center gap-2 text-rose-300"><TriangleAlert className="h-3.5 w-3.5" /> Terminal history could not load.<button onClick={() => historyQuery.refetch()} className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Retry</button></div> : null}
                  {streamState === "reconnecting" ? <div className="mb-3 flex items-center gap-2 text-amber-300"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Reconnecting live terminal stream…</div> : null}
                  {streamState === "disconnected" ? <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-rose-200"><span className="flex items-center gap-2 text-xs"><TriangleAlert className="h-3.5 w-3.5" /> Live terminal stream disconnected.</span><button onClick={() => { setStreamState("idle"); setStreamReconnect(value => value + 1); }} className="font-mono text-[10px] uppercase tracking-wider text-emerald-300 hover:text-emerald-200">Reconnect</button></div> : null}
                  {!historyQuery.isLoading && !selectedSession ? <div className="flex h-[330px] flex-col items-center justify-center text-center text-slate-600"><TerminalSquareIcon /><p className="mt-3 text-xs">Execute a command to begin a terminal session.</p></div> : null}
                  {selectedSession ? <><div className="mb-3 flex items-center gap-2 text-emerald-300/80"><span>›</span><span className="break-all text-emerald-200">{selectedSession.command}</span></div>{streamEvents.length === 0 ? <span className="text-slate-600">Waiting for stdout and stderr output…</span> : streamEvents.map((event, index) => <TerminalLine key={`${event.sequence}-${event.kind}-${index}`} event={event} />)}</> : null}
                </div>
              </ScrollArea>
              <div className="border-t border-white/8 bg-[#0b1018] px-4 py-3 sm:px-5">
                <form onSubmit={submitStdin} className="flex gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3"><span className="font-mono text-xs text-emerald-300">stdin</span><Input value={stdin} onChange={event => setStdin(event.target.value)} disabled={!running || stdinMutation.isPending} placeholder={running ? "Send input to the running process" : "Interactive stdin available while a session is running"} className="h-10 border-0 bg-transparent px-0 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-0" /></div>
                  <Button disabled={!running || !stdin || stdinMutation.isPending} type="submit" className="h-10 rounded-xl bg-white/[0.08] px-3 text-slate-200 hover:bg-white/[0.13]"><SendHorizontal className="h-4 w-4" /></Button>
                </form>
              </div>
              <form onSubmit={submitCommand} className="border-t border-white/8 bg-[#101722] p-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Textarea value={command} onChange={event => setCommand(event.target.value)} placeholder="Enter a shell command" className="min-h-11 flex-1 resize-none border-white/10 bg-[#090d13] py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-400/40" />
                  <div className="flex gap-2 sm:w-[260px] sm:flex-col"><Select value={routeTarget} onValueChange={setRouteTarget}><SelectTrigger className="h-10 flex-1 border-white/10 bg-[#090d13] text-xs text-slate-300 focus:ring-emerald-400/40"><SelectValue /></SelectTrigger><SelectContent className="border-white/10 bg-[#111822] text-slate-200"><SelectItem value="least-loaded">Least-loaded instance</SelectItem>{instances.map(instance => <SelectItem value={String(instance.id)} key={instance.id} disabled={instance.status !== "online"}>{instance.name} · {instance.status}</SelectItem>)}</SelectContent></Select><Button disabled={!command.trim() || executeMutation.isPending} type="submit" className="h-10 rounded-xl bg-emerald-400 px-4 font-semibold text-[#062018] hover:bg-emerald-300">{executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}<span className="sm:hidden">Run</span></Button></div>
                </div>
              </form>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-white/9 bg-[#0d131c]/80 p-5">
                {detailsQuery.isError ? <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-400/15 bg-rose-400/5 p-3 text-xs text-rose-200"><span className="flex items-center gap-2"><TriangleAlert className="h-3.5 w-3.5" /> Instance details could not load.</span><button onClick={() => detailsQuery.refetch()} className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Retry</button></div> : null}
                <div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Instance details</p><h3 className="mt-1 text-sm font-semibold text-white">{selectedInstance.name}</h3></div><button onClick={() => { const name = window.prompt("Instance name", selectedInstance.name); if (name?.trim()) renameMutation.mutate({ id: selectedInstance.id, name: name.trim() }); }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-slate-200"><MoreHorizontal className="h-4 w-4" /></button></div>
                <div className="mt-5 space-y-4"><MetricRow icon={<Cpu className="h-4 w-4" />} label="CPU usage" value={`${selectedInstance.cpuPercent}%`} percent={selectedInstance.cpuPercent} /><MetricRow icon={<HardDrive className="h-4 w-4" />} label="Memory usage" value={`${selectedInstance.memoryPercent}%`} percent={selectedInstance.memoryPercent} /><div className="flex items-center justify-between border-t border-white/7 pt-4 text-xs"><span className="text-slate-500">Last seen</span><span className="text-slate-300">{formatDate(selectedInstance.lastSeenAt)}</span></div><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Active sessions</span><span className="font-mono text-slate-300">{selectedInstance.activeSessions}</span></div></div>
                <a href={selectedInstance.instanceUrl} target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 text-xs text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200"><span className="truncate">{selectedInstance.instanceUrl}</span><ExternalLink className="ml-3 h-3.5 w-3.5 shrink-0" /></a>
                <button onClick={() => { if (window.confirm(`Remove ${selectedInstance.name}?`)) removeMutation.mutate({ id: selectedInstance.id }); }} className="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Remove instance</button>
              </section>
              <section className="overflow-hidden rounded-2xl border border-white/9 bg-[#0d131c]/80"><div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-semibold text-white">Session history</h3></div><span className="font-mono text-[10px] text-slate-500">{sessions.length}</span></div><ScrollArea className="max-h-[235px]"><div className="p-2">{detailsQuery.isLoading ? <div className="px-3 py-4 text-xs text-slate-500">Loading history…</div> : null}{!detailsQuery.isLoading && sessions.length === 0 ? <div className="px-3 py-5 text-xs text-slate-500">No terminal sessions.</div> : null}{sessions.map(session => <button key={session.id} onClick={() => setSelectedSessionId(session.id)} className={cn("w-full rounded-xl px-3 py-2.5 text-left transition", session.id === selectedSession?.id ? "bg-white/[0.075]" : "hover:bg-white/[0.04]")}><div className="flex items-center justify-between gap-3"><span className="truncate font-mono text-[11px] text-slate-300">{session.command}</span><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", session.state === "running" ? "bg-emerald-400" : session.state === "failed" ? "bg-rose-400" : "bg-slate-600")} /></div><p className="mt-1 font-mono text-[10px] text-slate-600">{formatDate(session.createdAt)} · {session.state}</p></button>)}</div></ScrollArea></section>
            </aside>
          </div>
        )}
      </div>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}><DialogContent className="border-white/10 bg-[#101722] text-slate-100 sm:max-w-[480px]"><DialogHeader><DialogTitle className="text-lg">Register instance</DialogTitle><DialogDescription className="text-slate-500">Enter an instance name and URL. The Dockerfile as communication protocol is generated and sent to the instance URL.</DialogDescription></DialogHeader><form onSubmit={submitRegistration} className="space-y-4 pt-2"><div className="space-y-2"><label className="text-xs font-medium text-slate-300">Instance name</label><Input value={instanceName} onChange={event => setInstanceName(event.target.value)} required placeholder="Production agent" className="border-white/10 bg-[#090d13] text-slate-100 placeholder:text-slate-600" /></div><div className="space-y-2"><label className="text-xs font-medium text-slate-300">Instance URL</label><Input value={instanceUrl} onChange={event => setInstanceUrl(event.target.value)} type="url" required placeholder="https://instance.onrender.com" className="border-white/10 bg-[#090d13] font-mono text-xs text-slate-100 placeholder:text-slate-600" /></div><DialogFooter className="pt-2"><Button type="button" variant="ghost" onClick={() => setRegisterOpen(false)} className="text-slate-400 hover:bg-white/[0.07] hover:text-slate-200">Cancel</Button><Button disabled={registerMutation.isPending} type="submit" className="bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">{registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}Generate and send Dockerfile</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}><DialogContent className="border-white/10 bg-[#101722] text-slate-100 sm:max-w-3xl"><DialogHeader><DialogTitle>Dockerfile communication protocol</DialogTitle><DialogDescription className="text-slate-500">A protected, one-time enrollment credential has been embedded for this instance. Keep this Dockerfile private.</DialogDescription></DialogHeader><div className="relative mt-2 overflow-hidden rounded-xl border border-white/8 bg-[#070a0f]"><ScrollArea className="h-[300px]"><pre className="p-4 font-mono text-[11px] leading-5 text-emerald-100/80">{generatedDockerfile}</pre></ScrollArea><button onClick={() => { void navigator.clipboard.writeText(generatedDockerfile); toast.success("Dockerfile copied."); }} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-[#101722] text-slate-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></button></div><DialogFooter><Button onClick={downloadDockerfile} className="bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300"><FileCode2 className="h-4 w-4" /> Download Dockerfile</Button></DialogFooter></DialogContent></Dialog>
    </DashboardLayout>
  );
}

function TerminalSquareIcon() {
  return <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[0.025] text-slate-600"><Server className="h-4 w-4" /></div>;
}

function TerminalLine({ event }: { event: StreamEvent }) {
  const prefix = event.kind === "stderr" ? "!" : event.kind === "stdin" ? "‹" : event.kind === "status" ? "·" : "›";
  return <div className={cn("whitespace-pre-wrap break-words", event.kind === "stderr" ? "text-rose-300" : event.kind === "stdin" ? "text-sky-300" : event.kind === "status" ? "text-slate-500" : "text-slate-300")}><span className="mr-2 select-none text-slate-600">{prefix}</span>{event.payload}</div>;
}

function MetricRow({ icon, label, value, percent }: { icon: React.ReactNode; label: string; value: string; percent: number }) {
  return <div><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500">{icon}{label}</span><span className="font-mono text-slate-300">{value}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className={cn("h-full rounded-full transition-all", meterColor(percent))} style={{ width: `${Math.min(100, percent)}%` }} /></div></div>;
}

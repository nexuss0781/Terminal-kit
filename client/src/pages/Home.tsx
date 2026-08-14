import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Check, Clipboard, Copy, FileCode2, Loader2, Server, TerminalSquare, TriangleAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function Home() {
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [dockerfile, setDockerfile] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<"sent" | "pending" | undefined>();
  const [deliveryError, setDeliveryError] = useState<string | undefined>();
  const register = trpc.controller.instances.register.useMutation({
    onSuccess: result => {
      setDockerfile(result.dockerfile);
      setDeliveryStatus(result.deliveryStatus);
      setDeliveryError(result.deliveryError);
      setName("");
      setInstanceUrl("");
      result.deliveryStatus === "sent"
        ? toast.success("Dockerfile communication protocol sent to the instance URL.")
        : toast.warning("Dockerfile generated; the remote URL has not acknowledged delivery.");
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate({ name, instanceUrl });
  }

  function copyDockerfile() {
    void navigator.clipboard.writeText(dockerfile);
    toast.success("Dockerfile copied.");
  }

  function downloadDockerfile() {
    const blob = new Blob([dockerfile], { type: "text/plain;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "Dockerfile.terminal-kit";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  if (loading) return <div className="min-h-screen bg-[#070b10]" />;

  if (!user) {
    return <main className="grid min-h-screen place-items-center bg-[#070b10] px-6 text-slate-100"><section className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-[#0f1722] p-9 shadow-2xl shadow-black/40"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20"><TerminalSquare className="h-6 w-6" /></div><p className="mt-7 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Terminal Kit</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Instance enrollment</h1><p className="mt-3 text-sm leading-6 text-slate-400">Sign in to generate a Dockerfile communication protocol for a remote instance.</p><Button onClick={() => startLogin()} className="mt-8 h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">Sign in</Button></section></main>;
  }

  return <main className="min-h-screen bg-[radial-gradient(circle_at_77%_0%,rgba(16,185,129,0.1),transparent_28%),#070b10] px-5 py-8 text-slate-100 sm:px-8 sm:py-12"><div className="mx-auto max-w-4xl"><header className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-[#062018] shadow-[0_0_24px_rgba(52,211,153,0.16)]"><TerminalSquare className="h-5 w-5" /></div><div><p className="text-sm font-semibold tracking-tight text-white">Terminal Kit</p><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Instance enrollment</p></div></header>
    <section className="mt-16 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"><div className="pt-2"><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Dockerfile communication protocol</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">Connect a remote instance.</h1><p className="mt-5 max-w-md text-base leading-7 text-slate-400">Enter the public instance URL and name. Terminal-Kit generates the communication Dockerfile and sends it to the instance URL.</p></div>
      <section className="rounded-[1.5rem] border border-white/10 bg-[#0d141e]/90 p-5 shadow-2xl shadow-black/15 sm:p-7"><form onSubmit={submit} className="space-y-5"><div><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Instance name</label><Input value={name} onChange={event => setName(event.target.value)} required placeholder="Nexuss worker one" className="mt-2 h-11 border-white/10 bg-[#070b10] text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/45" /></div><div><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Instance URL</label><Input value={instanceUrl} onChange={event => setInstanceUrl(event.target.value)} required type="url" placeholder="https://instance.onrender.com" className="mt-2 h-11 border-white/10 bg-[#070b10] font-mono text-xs text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/45" /></div><Button disabled={register.isPending || !name.trim() || !instanceUrl.trim()} type="submit" className="h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">{register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}Generate and send Dockerfile</Button></form></section></section>
    {dockerfile ? <section className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0d141e]/90 shadow-xl shadow-black/10"><div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-3">{deliveryStatus === "sent" ? <Check className="h-4 w-4 text-emerald-300" /> : <TriangleAlert className="h-4 w-4 text-amber-300" />}<div><p className="text-sm font-semibold text-white">Dockerfile communication protocol</p><p className="mt-0.5 text-xs text-slate-500">{deliveryStatus === "sent" ? "Remote instance acknowledged Dockerfile delivery." : deliveryError || "Download and deploy the generated Dockerfile."}</p></div></div><div className="flex gap-2"><Button onClick={copyDockerfile} variant="ghost" className="h-9 rounded-lg bg-white/[0.05] text-xs text-slate-300 hover:bg-white/[0.1] hover:text-white"><Copy className="h-3.5 w-3.5" /> Copy</Button><Button onClick={downloadDockerfile} className="h-9 rounded-lg bg-white/[0.08] text-xs text-slate-200 hover:bg-white/[0.14]"><Clipboard className="h-3.5 w-3.5" /> Download</Button></div></div><ScrollArea className="h-[360px] bg-[#05080c]"><pre className="p-5 font-mono text-[11px] leading-5 text-emerald-100/80 sm:p-6">{dockerfile}</pre></ScrollArea></section> : null}
    <footer className="mt-12 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600"><Server className="h-3.5 w-3.5" /> Backend control plane available through the authenticated API</footer></div></main>;
}

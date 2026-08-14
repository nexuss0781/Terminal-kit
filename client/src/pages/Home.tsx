import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Clipboard, Copy, FileCode2, KeyRound, Loader2, Server, TerminalSquare, TriangleAlert } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type RegistrationResponse = {
  data?: {
    dockerfile: string;
    deliveryStatus: "sent" | "pending";
    deliveryError?: string;
  };
  error?: { message?: string };
};

export default function Home() {
  const [controllerKey, setControllerKey] = useState("");
  const [name, setName] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [dockerfile, setDockerfile] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<"sent" | "pending" | undefined>();
  const [deliveryError, setDeliveryError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/instances", {
        method: "POST",
        headers: {
          authorization: `Bearer ${controllerKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name, instanceUrl }),
      });
      const result = await response.json().catch(() => ({})) as RegistrationResponse;
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "The controller could not register this instance.");
      setDockerfile(result.data.dockerfile);
      setDeliveryStatus(result.data.deliveryStatus);
      setDeliveryError(result.data.deliveryError);
      setName("");
      setInstanceUrl("");
      result.data.deliveryStatus === "sent"
        ? toast.success("Dockerfile communication protocol sent to the instance URL.")
        : toast.warning("Dockerfile generated; the remote URL has not acknowledged delivery.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
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

  return <main className="min-h-screen bg-[radial-gradient(circle_at_77%_0%,rgba(16,185,129,0.1),transparent_28%),#070b10] px-5 py-8 text-slate-100 sm:px-8 sm:py-12"><div className="mx-auto max-w-4xl"><header className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 text-[#062018] shadow-[0_0_24px_rgba(52,211,153,0.16)]"><TerminalSquare className="h-5 w-5" /></div><div><p className="text-sm font-semibold tracking-tight text-white">Terminal Kit</p><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Instance enrollment</p></div></header>
    <section className="mt-16 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"><div className="pt-2"><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Dockerfile communication protocol</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">Connect a remote instance.</h1><p className="mt-5 max-w-md text-base leading-7 text-slate-400">Enter the controller key, public instance URL, and instance name. Terminal-Kit generates the communication Dockerfile and sends it to the instance.</p><div className="mt-7 flex gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4 text-sm leading-6 text-slate-400"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p>The controller key remains only in this browser tab’s memory and is sent only to this controller.</p></div></div>
      <section className="rounded-[1.5rem] border border-white/10 bg-[#0d141e]/90 p-5 shadow-2xl shadow-black/15 sm:p-7"><form onSubmit={submit} className="space-y-5"><div><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Controller API key</label><Input value={controllerKey} onChange={event => setControllerKey(event.target.value)} required type="password" autoComplete="off" placeholder="tkctl_..." className="mt-2 h-11 border-white/10 bg-[#070b10] font-mono text-xs text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/45" /></div><div><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Instance name</label><Input value={name} onChange={event => setName(event.target.value)} required placeholder="Nexuss worker one" className="mt-2 h-11 border-white/10 bg-[#070b10] text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/45" /></div><div><label className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Instance URL</label><Input value={instanceUrl} onChange={event => setInstanceUrl(event.target.value)} required type="url" placeholder="https://instance.onrender.com" className="mt-2 h-11 border-white/10 bg-[#070b10] font-mono text-xs text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/45" /></div><Button disabled={isSubmitting || !controllerKey.trim() || !name.trim() || !instanceUrl.trim()} type="submit" className="h-11 w-full rounded-xl bg-emerald-400 font-semibold text-[#062018] hover:bg-emerald-300">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}Generate and send Dockerfile</Button></form></section></section>
    {dockerfile ? <section className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0d141e]/90 shadow-xl shadow-black/10"><div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-3">{deliveryStatus === "sent" ? <Check className="h-4 w-4 text-emerald-300" /> : <TriangleAlert className="h-4 w-4 text-amber-300" />}<div><p className="text-sm font-semibold text-white">Dockerfile communication protocol</p><p className="mt-0.5 text-xs text-slate-500">{deliveryStatus === "sent" ? "Remote instance acknowledged Dockerfile delivery." : deliveryError || "Download and deploy the generated Dockerfile."}</p></div></div><div className="flex gap-2"><Button onClick={copyDockerfile} variant="ghost" className="h-9 rounded-lg bg-white/[0.05] text-xs text-slate-300 hover:bg-white/[0.1] hover:text-white"><Copy className="h-3.5 w-3.5" /> Copy</Button><Button onClick={downloadDockerfile} className="h-9 rounded-lg bg-white/[0.08] text-xs text-slate-200 hover:bg-white/[0.14]"><Clipboard className="h-3.5 w-3.5" /> Download</Button></div></div><ScrollArea className="h-[360px] bg-[#05080c]"><pre className="p-5 font-mono text-[11px] leading-5 text-emerald-100/80 sm:p-6">{dockerfile}</pre></ScrollArea></section> : null}
    <footer className="mt-12 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600"><Server className="h-3.5 w-3.5" /> Backend control plane protected by controller API key</footer></div></main>;
}

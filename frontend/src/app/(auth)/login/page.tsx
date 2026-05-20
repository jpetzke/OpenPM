"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types/project";

const schema = z.object({
  email: z.string().email("Ungültige E-Mail"),
  password: z.string().min(1, "Passwort erforderlich"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { access_token } = await api.post<{ access_token: string; token_type: string }>(
        "/api/auth/login",
        { email: data.email, password: data.password }
      );
      const user = await api.getWithToken<User>("/api/auth/me", access_token);
      setAuth(user, access_token);
      router.push("/projects");
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || "Anmeldung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>OpenPM</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Anmelden</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder="name@firma.de"
            />
            {errors.email && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Passwort
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium transition-default disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--primary-foreground)" }}
          >
            {loading ? "..." : "Anmelden"}
          </button>
        </form>
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Noch kein Konto?{" "}
          <Link href="/register" style={{ color: "var(--accent)" }}>Registrieren</Link>
        </p>
      </div>
    </div>
  );
}

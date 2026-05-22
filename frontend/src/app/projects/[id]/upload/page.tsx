"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UploadRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    // Preserve the #docs hash via a client-side navigation so the cockpit's
    // DocumentsPanel opens the upload zone automatically.
    router.replace(`/projects/${id}#docs`);
  }, [id, router]);
  return null;
}

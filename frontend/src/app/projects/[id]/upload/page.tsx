"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UploadRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects/${id}#docs`);
  }, [id, router]);
  return null;
}

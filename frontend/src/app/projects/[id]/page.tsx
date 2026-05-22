"use client";

import { use } from "react";
import { CockpitLayout } from "@/components/cockpit/CockpitLayout";

export default function CockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CockpitLayout projectId={id} />;
}

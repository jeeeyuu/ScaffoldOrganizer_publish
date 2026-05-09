import { AppShell } from "@/components/app-shell";
import { getBootstrapPayload } from "@/lib/repository";

export default async function HomePage() {
  const initialData = await getBootstrapPayload();
  return <AppShell initialData={initialData} />;
}

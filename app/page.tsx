import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getBootstrapPayload } from "@/lib/repository";

export default async function HomePage() {
  const user = await getCurrentUser();
  const initialData = await getBootstrapPayload(user);
  return <AppShell initialData={initialData} />;
}

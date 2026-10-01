// /partners (self-hosted, AGPL, written for this fork): the partner program is a
// papermark.com service.
import AppLayout from "@/components/layouts/app";

export default function PartnerProgram() {
  return (
    <AppLayout>
      <main className="p-10 text-sm text-muted-foreground">
        The partner program is not available in self-hosted mode.
      </main>
    </AppLayout>
  );
}

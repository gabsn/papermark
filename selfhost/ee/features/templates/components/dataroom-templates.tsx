// Self-hosted edition: data room templates are switched off.
import { NotAvailableCard } from "../../workflows/components/_not-available";

export default function DataroomTemplates(_props: { dataroomId: string }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <NotAvailableCard feature="Data room templates" />
    </div>
  );
}

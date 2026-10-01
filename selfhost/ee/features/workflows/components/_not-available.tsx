// Self-hosted edition: placeholders for dashboard pages of features that are switched off.
import AppLayout from "@/components/layouts/app";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const NOT_AVAILABLE_MESSAGE = "Not available in the self-hosted edition";

export function NotAvailableCard({ feature }: { feature: string }) {
  return (
    <Card className="bg-transparent">
      <CardHeader>
        <CardTitle>{feature}</CardTitle>
        <CardDescription>{NOT_AVAILABLE_MESSAGE}.</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function NotAvailablePage({ feature }: { feature: string }) {
  return (
    <AppLayout>
      <div className="relative mx-2 mb-10 mt-4 space-y-6 px-1 sm:mx-3 md:mx-5 md:mt-5 lg:mx-7 lg:mt-8 xl:mx-10">
        <NotAvailableCard feature={feature} />
      </div>
    </AppLayout>
  );
}

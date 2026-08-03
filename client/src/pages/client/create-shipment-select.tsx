import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Plane, DoorOpen, MapPin } from "lucide-react";

interface ClientAccount {
  profile?: string;
}

interface ShipmentTypeOption {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Plane;
  iconWrapClass: string;
  iconClass: string;
}

const shipmentTypes: ShipmentTypeOption[] = [
  {
    key: "local",
    label: "Local Delivery",
    description: "Last-mile delivery within Saudi Arabia through local carriers.",
    href: "/client/local/new",
    icon: MapPin,
    iconWrapClass: "bg-emerald-500/10",
    iconClass: "text-emerald-500",
  },
  {
    key: "ddp",
    label: "Door To Door Freight",
    description: "Import goods with all duties and taxes prepaid on fixed lane pricing.",
    href: "/client/ddp",
    icon: DoorOpen,
    iconWrapClass: "bg-blue-500/10",
    iconClass: "text-blue-500",
  },
  {
    key: "express",
    label: "Express Shipment",
    description: "International & domestic courier delivery via FedEx, DHL and partners.",
    href: "/client/create-shipment",
    icon: Plane,
    iconWrapClass: "bg-primary/10",
    iconClass: "text-primary",
  },
];

export default function CreateShipmentSelect() {
  const [, navigate] = useLocation();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate("/client/shipments")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            data-testid="button-back-shipments"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to shipments
          </button>
          <h1 className="text-2xl font-bold">Create a shipment</h1>
          <p className="text-muted-foreground">
            Choose the type of shipment you want to create.
          </p>
        </div>

        {/* Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {shipmentTypes.map((type) => {
            const Icon = type.icon;
            return (
              <Card
                key={type.key}
                className="group hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => navigate(type.href)}
                data-testid={`card-shipment-type-${type.key}`}
              >
                <CardContent className="p-6 flex flex-col h-full">
                  <div className={`p-4 rounded-full w-fit mb-4 ${type.iconWrapClass}`}>
                    <Icon className={`h-8 w-8 ${type.iconClass}`} />
                  </div>
                  <h3 className="font-semibold mb-1">{type.label}</h3>
                  <p className="text-sm text-muted-foreground flex-1">
                    {type.description}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Continue
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ClientLayout>
  );
}

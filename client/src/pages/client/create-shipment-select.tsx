import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClientLayout } from "@/components/client-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, Plane, DoorOpen, MapPin, AlertTriangle, Lock } from "lucide-react";

interface ClientAccount {
  profile?: string;
}

interface DangerousGoodsAccess {
  enabled: boolean;
  request: { status: string } | null;
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
    key: "express",
    label: "Express Shipment",
    description: "International courier delivery (import & export) via FedEx, DHL and partners.",
    href: "/client/create-shipment",
    icon: Plane,
    iconWrapClass: "bg-primary/10",
    iconClass: "text-primary",
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
    key: "dangerous_goods",
    label: "Dangerous Goods",
    // `?dg=1` starts the express wizard with the declaration steps included and the rate and
    // payment steps removed. Dangerous goods share the addresses, packages and customs of an
    // express shipment, but not its pricing: carriage is arranged with the carrier by email,
    // so the client submits unpriced and is quoted afterwards.
    description: "Regulated goods — batteries, chemicals, aerosols. Declared under IATA rules and quoted by our team.",
    href: "/client/create-shipment?dg=1",
    icon: AlertTriangle,
    iconWrapClass: "bg-amber-500/10",
    iconClass: "text-amber-600",
  },
];

export default function CreateShipmentSelect() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: account } = useQuery<ClientAccount>({ queryKey: ["/api/client/account"] });
  const { data: dangerousGoodsAccess } = useQuery<DangerousGoodsAccess>({
    queryKey: ["/api/client/dangerous-goods"],
  });

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");

  const dangerousGoodsEnabled = dangerousGoodsAccess?.enabled ?? false;
  const dangerousGoodsPending = dangerousGoodsAccess?.request?.status === "pending";

  const requestAccessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client/dangerous-goods/request", {
        reason: requestReason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/dangerous-goods"] });
      setRequestOpen(false);
      setRequestReason("");
      toast({
        title: "Request sent",
        description: "We'll review your dangerous goods training and safety data sheets and come back to you.",
      });
    },
    onError: (error) => {
      toast({
        title: "Couldn't send the request",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <ClientLayout clientProfile={account?.profile}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {shipmentTypes.map((type) => {
            const Icon = type.icon;
            const isDangerousGoods = type.key === "dangerous_goods";
            // The dangerous goods card is always visible so clients know we carry regulated
            // goods, but it is locked until an admin has approved the account. Hiding it
            // outright would leave clients with no way to discover or ask for the service.
            const locked = isDangerousGoods && !dangerousGoodsEnabled;

            return (
              <Card
                key={type.key}
                className="group hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => (locked ? setRequestOpen(true) : navigate(type.href))}
                data-testid={`card-shipment-type-${type.key}`}
              >
                <CardContent className="p-6 flex flex-col h-full">
                  <div className={`p-4 rounded-full w-fit mb-4 ${type.iconWrapClass}`}>
                    <Icon className={`h-8 w-8 ${type.iconClass}`} />
                  </div>
                  <h3 className="font-semibold mb-1">{type.label}</h3>
                  <p className="text-sm text-muted-foreground flex-1">
                    {locked
                      ? "Regulated goods need approval before you can ship them. We'll check your dangerous goods training and safety data sheets."
                      : type.description}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {locked ? (
                      <>
                        <Lock className="h-4 w-4" />
                        {dangerousGoodsPending ? "Request under review" : "Request access"}
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Request dangerous goods access
            </DialogTitle>
            <DialogDescription>
              {dangerousGoodsPending
                ? "Your request is with our team. We'll let you know as soon as it's reviewed."
                : "Tell us what you need to ship. We'll ask for your dangerous goods training certificate and the safety data sheets before approving the account."}
            </DialogDescription>
          </DialogHeader>

          {!dangerousGoodsPending && (
            <div className="py-2">
              <label className="text-sm font-medium">What do you need to ship?</label>
              <Textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                placeholder="e.g. lithium ion batteries in equipment, monthly to the UAE"
                className="mt-1"
                data-testid="input-dg-request-reason"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)} data-testid="button-dg-request-cancel">
              Close
            </Button>
            {!dangerousGoodsPending && (
              <Button
                disabled={requestAccessMutation.isPending}
                onClick={() => requestAccessMutation.mutate()}
                data-testid="button-dg-request-submit"
              >
                {requestAccessMutation.isPending ? "Sending..." : "Send request"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}

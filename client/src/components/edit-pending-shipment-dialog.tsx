import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Trash2 } from "lucide-react";

type Address = {
  name: string; phone: string; email: string; addressLine1: string; addressLine2: string;
  city: string; stateOrProvince: string; postalCode: string; countryCode: string; shortAddress: string;
};
type Package = { weight: number; length: number; width: number; height: number };
type Item = { itemName: string; category: string; countryOfOrigin: string; hsCode: string; price: number; quantity: number; currency: string };

function toAddress(s: any, prefix: "sender" | "recipient"): Address {
  const cap = prefix === "sender" ? "sender" : "recipient";
  return {
    name: s[`${cap}Name`] || "",
    phone: s[`${cap}Phone`] || "",
    email: s[`${cap}Email`] || "",
    addressLine1: s[`${cap}Address`] || "",
    addressLine2: s[`${cap}AddressLine2`] || "",
    city: s[`${cap}City`] || "",
    stateOrProvince: s[`${cap}StateOrProvince`] || "",
    postalCode: s[`${cap}PostalCode`] || "",
    countryCode: (s[`${cap}Country`] || "").toUpperCase(),
    shortAddress: s[`${cap}ShortAddress`] || "",
  };
}
function parseJson<T>(value: any, fallback: T): T {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

/**
 * Edit a payment_pending shipment (addresses, packages, customs items) and re-price. Works for
 * both the client (`/api/client/shipments/:id`) and admin (`/api/admin/shipments/:id`) endpoints.
 */
export function EditPendingShipmentDialog({
  shipment, endpoint, open, onOpenChange, invalidateKeys,
}: {
  shipment: any;
  endpoint: string; // e.g. `/api/client/shipments/${id}` or `/api/admin/shipments/${id}`
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invalidateKeys: string[];
}) {
  const { toast } = useToast();
  const [shipper, setShipper] = useState<Address>(() => toAddress(shipment, "sender"));
  const [recipient, setRecipient] = useState<Address>(() => toAddress(shipment, "recipient"));
  const [packages, setPackages] = useState<Package[]>(() => {
    const parsed = parseJson<Package[]>(shipment.packagesData, []);
    return parsed.length ? parsed.map((p) => ({ weight: Number(p.weight) || 0, length: Number(p.length) || 0, width: Number(p.width) || 0, height: Number(p.height) || 0 })) : [{ weight: Number(shipment.weight) || 1, length: 0, width: 0, height: 0 }];
  });
  const [items, setItems] = useState<Item[]>(() =>
    parseJson<any[]>(shipment.itemsData, []).map((it) => ({
      itemName: it.itemName || "", category: it.category || "", countryOfOrigin: (it.countryOfOrigin || "").toUpperCase(),
      hsCode: it.hsCode || "", price: Number(it.price) || 0, quantity: Number(it.quantity) || 1, currency: it.currency || "SAR",
    })),
  );

  const isInternational = Boolean(shipment.isDdp) || (shipper.countryCode && recipient.countryCode && shipper.countryCode !== recipient.countryCode);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        shipper: { ...shipper, email: shipper.email || undefined },
        recipient: { ...recipient, email: recipient.email || undefined },
        packages: packages.map((p) => ({ weight: Number(p.weight), length: Number(p.length) || 0, width: Number(p.width) || 0, height: Number(p.height) || 0 })),
      };
      if (isInternational) {
        payload.items = items.filter((it) => it.itemName.trim()).map((it) => ({
          itemName: it.itemName, category: it.category || "General", countryOfOrigin: (it.countryOfOrigin || "").toUpperCase(),
          hsCode: it.hsCode || undefined, price: Number(it.price) || 0, quantity: Number(it.quantity) || 1, currency: it.currency || "SAR",
        }));
      }
      const res = await apiRequest("PATCH", endpoint, payload);
      return res.json();
    },
    onSuccess: (updated: any) => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast({ title: "Shipment updated", description: `New total: SAR ${Number(updated?.finalPrice || 0).toFixed(2)}` });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Could not update shipment", description: error.message, variant: "destructive" }),
  });

  const addrForm = (label: string, value: Address, set: (a: Address) => void) => (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Name</Label><Input value={value.name} onChange={(e) => set({ ...value, name: e.target.value })} /></div>
        <div className="space-y-1"><Label>Phone</Label><PhoneInput value={value.phone} onChange={(v) => set({ ...value, phone: v })} defaultCountry={(value as any).countryCode || "SA"} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Input value={value.addressLine1} onChange={(e) => set({ ...value, addressLine1: e.target.value })} /></div>
        <div className="space-y-1"><Label>City</Label><Input value={value.city} onChange={(e) => set({ ...value, city: e.target.value })} /></div>
        <div className="space-y-1"><Label>State / Province</Label><Input value={value.stateOrProvince} onChange={(e) => set({ ...value, stateOrProvince: e.target.value })} /></div>
        <div className="space-y-1"><Label>Postal code</Label><Input value={value.postalCode} onChange={(e) => set({ ...value, postalCode: e.target.value })} /></div>
        <div className="space-y-1"><Label>Country (2-letter)</Label><Input maxLength={2} value={value.countryCode} onChange={(e) => set({ ...value, countryCode: e.target.value.toUpperCase() })} /></div>
        <div className="space-y-1"><Label>Email</Label><Input value={value.email} onChange={(e) => set({ ...value, email: e.target.value })} /></div>
        <div className="space-y-1"><Label>Short address</Label><Input value={value.shortAddress} onChange={(e) => set({ ...value, shortAddress: e.target.value })} /></div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modify shipment {shipment.trackingNumber}</DialogTitle>
          <DialogDescription>Editing re-prices the shipment with live rates. The new total is what's due at payment.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {addrForm("Sender", shipper, setShipper)}
          {addrForm("Recipient", recipient, setRecipient)}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Packages</p>
              <Button variant="outline" size="sm" onClick={() => setPackages([...packages, { weight: 1, length: 0, width: 0, height: 0 }])}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {packages.map((p, i) => (
              <div className="grid grid-cols-5 gap-2" key={i}>
                <Input type="number" min="0.1" step="0.1" placeholder="Weight" value={p.weight} onChange={(e) => setPackages(packages.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
                <Input type="number" min="0" placeholder="L (cm)" value={p.length} onChange={(e) => setPackages(packages.map((x, j) => j === i ? { ...x, length: Number(e.target.value) } : x))} />
                <Input type="number" min="0" placeholder="W (cm)" value={p.width} onChange={(e) => setPackages(packages.map((x, j) => j === i ? { ...x, width: Number(e.target.value) } : x))} />
                <Input type="number" min="0" placeholder="H (cm)" value={p.height} onChange={(e) => setPackages(packages.map((x, j) => j === i ? { ...x, height: Number(e.target.value) } : x))} />
                <Button variant="ghost" size="icon" disabled={packages.length <= 1} onClick={() => setPackages(packages.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>

          {isInternational && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Customs items</p>
                <Button variant="outline" size="sm" onClick={() => setItems([...items, { itemName: "", category: "", countryOfOrigin: "", hsCode: "", price: 0, quantity: 1, currency: "SAR" }])}><Plus className="mr-1 h-4 w-4" />Add</Button>
              </div>
              {items.map((it, i) => (
                <div className="grid grid-cols-6 gap-2" key={i}>
                  <Input placeholder="Item" value={it.itemName} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} />
                  <Input placeholder="Category" value={it.category} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} />
                  <Input placeholder="Origin" maxLength={2} value={it.countryOfOrigin} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, countryOfOrigin: e.target.value.toUpperCase() } : x))} />
                  <Input type="number" min="1" placeholder="Qty" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <Input type="number" min="0" step="0.01" placeholder="Price" value={it.price} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} />
                  <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">HS codes are re-matched automatically on save.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <><LoadingSpinner size="sm" className="mr-2" />Saving…</> : "Save & re-price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

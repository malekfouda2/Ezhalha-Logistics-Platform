import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { ProfileBadge } from "@/components/profile-badge";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Percent, Edit, DollarSign, TrendingUp, Info } from "lucide-react";
import type { PricingRule } from "@shared/schema";

export default function AdminPricing() {
  const { toast } = useToast();
  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newMargin, setNewMargin] = useState("");

  const { data: pricingRules, isLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const updateMarginMutation = useMutation({
    mutationFn: async ({ id, marginPercentage }: { id: string; marginPercentage: string }) => {
      await apiRequest("PATCH", `/api/admin/pricing/${id}`, { marginPercentage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setIsEditOpen(false);
      toast({
        title: "Margin updated",
        description: "The pricing margin has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleEditMargin = (rule: PricingRule) => {
    setSelectedRule(rule);
    setNewMargin(String(rule.marginPercentage));
    setIsEditOpen(true);
  };

  const handleSaveMargin = () => {
    if (selectedRule && newMargin) {
      updateMarginMutation.mutate({
        id: selectedRule.id,
        marginPercentage: newMargin,
      });
    }
  };

  const profileOrder = ["regular", "mid_level", "vip"];
  const sortedRules = pricingRules?.sort(
    (a, b) => profileOrder.indexOf(a.profile) - profileOrder.indexOf(b.profile)
  );

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingScreen message="Loading pricing rules..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Pricing & Margins</h1>
            <p className="text-muted-foreground">
              Configure profit margins for each client tier
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">How pricing works</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The margin percentage is added on top of the carrier's base rate.
                  For example, if the base rate is $100 and the margin is 15%, the
                  client pays $115. Margin changes only apply to new shipments.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sortedRules?.map((rule) => (
            <Card key={rule.id} className="relative overflow-visible">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4">
                  <ProfileBadge profile={rule.profile} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditMargin(rule)}
                    data-testid={`button-edit-${rule.profile}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-5xl font-bold">
                      {Number(rule.marginPercentage).toFixed(0)}
                    </span>
                    <Percent className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mt-2">Profit Margin</p>
                </div>

                <div className="mt-4 p-4 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-2">Example Calculation</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Rate</span>
                      <span>$100.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margin ({rule.marginPercentage}%)</span>
                      <span className="text-green-600 dark:text-green-400">
                        +${((100 * Number(rule.marginPercentage)) / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between font-medium">
                      <span>Client Pays</span>
                      <span>${(100 + (100 * Number(rule.marginPercentage)) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Revenue Impact
              </CardTitle>
              <CardDescription>
                How margins affect your revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sortedRules?.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ProfileBadge profile={rule.profile} showIcon={false} />
                      <span className="text-sm text-muted-foreground">clients</span>
                    </div>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      +{rule.marginPercentage}% per shipment
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Margin Strategy Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">1.</span>
                  <span>VIP clients get lower margins to incentivize volume</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  <span>Regular clients pay standard market rates</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  <span>Upgrade high-volume regulars to Mid-Level for retention</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">4.</span>
                  <span>Margin changes don't affect existing shipments</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Margin Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profit Margin</DialogTitle>
            <DialogDescription>
              Update the margin percentage for{" "}
              {selectedRule?.profile === "mid_level"
                ? "Mid-Level"
                : selectedRule?.profile === "vip"
                ? "VIP"
                : "Regular"}{" "}
              clients
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Margin Percentage
            </label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={newMargin}
                onChange={(e) => setNewMargin(e.target.value)}
                className="pr-10"
                data-testid="input-margin"
              />
              <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This change will only apply to new shipments
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveMargin}
              disabled={updateMarginMutation.isPending || !newMargin}
              data-testid="button-save-margin"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

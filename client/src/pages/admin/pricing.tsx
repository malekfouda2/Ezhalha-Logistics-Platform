import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Percent, Edit, DollarSign, TrendingUp, Info, Plus, Trash2 } from "lucide-react";
import type { PricingRule } from "@shared/schema";

export default function AdminPricing() {
  const { toast } = useToast();
  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<PricingRule | null>(null);
  
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editMargin, setEditMargin] = useState("");
  
  const [newProfile, setNewProfile] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMargin, setNewMargin] = useState("15");

  const { data: pricingRules, isLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: { profile: string; displayName: string; marginPercentage: string }) => {
      const res = await apiRequest("POST", "/api/admin/pricing", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setIsCreateOpen(false);
      setNewProfile("");
      setNewDisplayName("");
      setNewMargin("15");
      toast({ title: "Profile created", description: "New pricing profile has been created." });
    },
    onError: (error) => {
      toast({
        title: "Failed to create profile",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, displayName, marginPercentage }: { id: string; displayName?: string; marginPercentage?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/pricing/${id}`, { displayName, marginPercentage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setIsEditOpen(false);
      toast({ title: "Profile updated", description: "The pricing profile has been updated." });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/pricing/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setDeleteConfirmOpen(false);
      setRuleToDelete(null);
      toast({ title: "Profile deleted", description: "The pricing profile has been removed." });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleEditProfile = (rule: PricingRule) => {
    setSelectedRule(rule);
    setEditDisplayName(rule.displayName || rule.profile);
    setEditMargin(String(rule.marginPercentage));
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (selectedRule) {
      updateProfileMutation.mutate({
        id: selectedRule.id,
        displayName: editDisplayName,
        marginPercentage: editMargin,
      });
    }
  };

  const handleCreateProfile = () => {
    createProfileMutation.mutate({
      profile: newProfile,
      displayName: newDisplayName,
      marginPercentage: newMargin,
    });
  };

  const handleDeleteClick = (rule: PricingRule) => {
    setRuleToDelete(rule);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (ruleToDelete) {
      deleteProfileMutation.mutate(ruleToDelete.id);
    }
  };

  const sortedRules = pricingRules?.sort((a, b) => {
    const order = ["regular", "mid_level", "vip"];
    const aIndex = order.indexOf(a.profile);
    const bIndex = order.indexOf(b.profile);
    if (aIndex === -1 && bIndex === -1) return a.profile.localeCompare(b.profile);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return 1;
    return aIndex - bIndex;
  });

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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Pricing Profiles</h1>
            <p className="text-muted-foreground">
              Create and manage pricing profiles with profit margins
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-profile">
            <Plus className="h-4 w-4 mr-2" />
            Add Profile
          </Button>
        </div>

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedRules?.map((rule) => (
            <Card key={rule.id} className="relative overflow-visible">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Badge variant="secondary" className="w-fit">
                      {rule.displayName || rule.profile}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Key: {rule.profile}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditProfile(rule)}
                      data-testid={`button-edit-${rule.profile}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(rule)}
                      data-testid={`button-delete-${rule.profile}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
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
                      <Badge variant="outline">{rule.displayName || rule.profile}</Badge>
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

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pricing Profile</DialogTitle>
            <DialogDescription>
              Update the name and margin for this profile
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editDisplayName">Display Name</Label>
              <Input
                id="editDisplayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="e.g., VIP, Enterprise"
                data-testid="input-edit-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMargin">Margin Percentage</Label>
              <div className="relative">
                <Input
                  id="editMargin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editMargin}
                  onChange={(e) => setEditMargin(e.target.value)}
                  className="pr-10"
                  data-testid="input-edit-margin"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Changes will only apply to new shipments
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateProfileMutation.isPending || !editDisplayName || !editMargin}
              data-testid="button-save-edit"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Pricing Profile</DialogTitle>
            <DialogDescription>
              Add a new pricing profile for client tiers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newDisplayName">Display Name</Label>
              <Input
                id="newDisplayName"
                value={newDisplayName}
                onChange={(e) => {
                  setNewDisplayName(e.target.value);
                  setNewProfile(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
                }}
                placeholder="e.g., Enterprise, Wholesale"
                data-testid="input-new-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newProfile">Profile Key</Label>
              <Input
                id="newProfile"
                value={newProfile}
                onChange={(e) => setNewProfile(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
                placeholder="e.g., enterprise, wholesale"
                data-testid="input-new-profile"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (lowercase, underscores only)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newMargin">Margin Percentage</Label>
              <div className="relative">
                <Input
                  id="newMargin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={newMargin}
                  onChange={(e) => setNewMargin(e.target.value)}
                  className="pr-10"
                  data-testid="input-new-margin"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProfile}
              disabled={createProfileMutation.isPending || !newProfile || !newDisplayName || !newMargin}
              data-testid="button-create-profile"
            >
              {createProfileMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pricing Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{ruleToDelete?.displayName || ruleToDelete?.profile}" profile.
              You cannot delete profiles that have clients assigned to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProfileMutation.isPending ? "Deleting..." : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

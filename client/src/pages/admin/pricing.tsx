import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
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
import { Percent, Edit, DollarSign, TrendingUp, Info, Plus, Trash2, Settings, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import type { PricingRule, PricingTier } from "@shared/schema";

interface TierFormData {
  minAmount: string;
  marginPercentage: string;
}

export default function AdminPricing() {
  const { toast } = useToast();
  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<PricingRule | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editMargin, setEditMargin] = useState("");
  
  const [newProfile, setNewProfile] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newMargin, setNewMargin] = useState("15");

  const [newTiers, setNewTiers] = useState<TierFormData[]>([{ minAmount: "0", marginPercentage: "15" }]);
  const [editingTiers, setEditingTiers] = useState<(PricingTier & { isNew?: boolean; isDeleted?: boolean })[]>([]);

  const { data: pricingRules, isLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/admin/pricing"],
  });

  const { data: currentTiers, isLoading: tiersLoading } = useQuery<PricingTier[]>({
    queryKey: ["/api/admin/pricing", expandedProfile, "tiers"],
    queryFn: async () => {
      if (!expandedProfile) return [];
      const res = await fetch(`/api/admin/pricing/${expandedProfile}/tiers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tiers");
      return res.json();
    },
    enabled: !!expandedProfile,
  });

  useEffect(() => {
    if (currentTiers && expandedProfile) {
      setEditingTiers(currentTiers.map(t => ({ ...t })));
    }
  }, [currentTiers, expandedProfile]);

  const createProfileMutation = useMutation({
    mutationFn: async (data: { profile: string; displayName: string; marginPercentage: string }) => {
      const res = await apiRequest("POST", "/api/admin/pricing", data);
      return res.json();
    },
    onSuccess: async (newRule) => {
      // Create initial tiers for the new profile
      for (const tier of newTiers) {
        if (tier.minAmount && tier.marginPercentage) {
          await apiRequest("POST", `/api/admin/pricing/${newRule.id}/tiers`, {
            minAmount: parseFloat(tier.minAmount),
            marginPercentage: parseFloat(tier.marginPercentage),
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
      setIsCreateOpen(false);
      setNewProfile("");
      setNewDisplayName("");
      setNewMargin("15");
      setNewTiers([{ minAmount: "0", marginPercentage: "15" }]);
      toast({ title: "Profile created", description: "New pricing profile has been created with tiered pricing." });
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

  const saveTiersMutation = useMutation({
    mutationFn: async ({ profileId, tiers }: { profileId: string; tiers: typeof editingTiers }) => {
      // Delete removed tiers
      for (const tier of tiers.filter(t => t.isDeleted && !t.isNew)) {
        await apiRequest("DELETE", `/api/admin/pricing/tiers/${tier.id}`);
      }
      // Create new tiers
      for (const tier of tiers.filter(t => t.isNew && !t.isDeleted)) {
        await apiRequest("POST", `/api/admin/pricing/${profileId}/tiers`, {
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
      // Update existing tiers
      for (const tier of tiers.filter(t => !t.isNew && !t.isDeleted)) {
        await apiRequest("PATCH", `/api/admin/pricing/tiers/${tier.id}`, {
          minAmount: parseFloat(tier.minAmount as any),
          marginPercentage: parseFloat(tier.marginPercentage as any),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing", expandedProfile, "tiers"] });
      toast({ title: "Tiers saved", description: "Pricing tiers have been updated." });
    },
    onError: (error) => {
      toast({
        title: "Failed to save tiers",
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

  const toggleExpandProfile = (profileId: string) => {
    if (expandedProfile === profileId) {
      setExpandedProfile(null);
      setEditingTiers([]);
    } else {
      setExpandedProfile(profileId);
    }
  };

  const addNewTierToEdit = () => {
    const maxMin = Math.max(...editingTiers.filter(t => !t.isDeleted).map(t => Number(t.minAmount)), 0);
    setEditingTiers([...editingTiers, {
      id: `new-${Date.now()}`,
      profileId: expandedProfile!,
      minAmount: String(maxMin + 100),
      marginPercentage: "10",
      createdAt: new Date(),
      isNew: true,
    }]);
  };

  const updateEditingTier = (index: number, field: "minAmount" | "marginPercentage", value: string) => {
    const updated = [...editingTiers];
    (updated[index] as any)[field] = value;
    setEditingTiers(updated);
  };

  const markTierForDeletion = (index: number) => {
    const updated = [...editingTiers];
    updated[index].isDeleted = true;
    setEditingTiers(updated);
  };

  const addNewTierToCreate = () => {
    const maxMin = Math.max(...newTiers.map(t => Number(t.minAmount) || 0), 0);
    setNewTiers([...newTiers, { minAmount: String(maxMin + 100), marginPercentage: "10" }]);
  };

  const updateNewTier = (index: number, field: keyof TierFormData, value: string) => {
    const updated = [...newTiers];
    updated[index][field] = value;
    setNewTiers(updated);
  };

  const removeNewTier = (index: number) => {
    if (newTiers.length > 1) {
      setNewTiers(newTiers.filter((_, i) => i !== index));
    }
  };

  const handleSaveTiers = () => {
    if (expandedProfile) {
      saveTiersMutation.mutate({ profileId: expandedProfile, tiers: editingTiers });
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
              Create and manage pricing profiles with tiered profit margins
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
                <p className="font-medium">How tiered pricing works</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Each profile can have multiple pricing tiers based on shipment value.
                  For example: shipments under $100 = 100% margin, $100-$500 = 50% margin, over $500 = 25% margin.
                  The system automatically applies the appropriate margin based on the base rate.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {sortedRules?.map((rule) => (
            <Card key={rule.id} className="overflow-visible">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-base px-3 py-1">
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
                      onClick={() => toggleExpandProfile(rule.id)}
                      data-testid={`button-expand-${rule.profile}`}
                    >
                      {expandedProfile === rule.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
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

              {expandedProfile === rule.id && (
                <CardContent className="border-t pt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Pricing Tiers
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addNewTierToEdit}
                        data-testid="button-add-tier"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Tier
                      </Button>
                    </div>

                    {tiersLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {editingTiers.filter(t => !t.isDeleted).length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            <p className="text-sm">No pricing tiers defined.</p>
                            <p className="text-xs">Using default margin of {rule.marginPercentage}% for all shipments.</p>
                          </div>
                        ) : (
                          editingTiers.filter(t => !t.isDeleted).map((tier, index) => {
                            const actualIndex = editingTiers.findIndex(t => t.id === tier.id);
                            return (
                              <div key={tier.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">Shipments</span>
                                  <span className="text-sm font-medium">$</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={tier.minAmount}
                                    onChange={(e) => updateEditingTier(actualIndex, "minAmount", e.target.value)}
                                    className="w-24"
                                    data-testid={`input-tier-min-${index}`}
                                  />
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="1000"
                                    step="0.5"
                                    value={tier.marginPercentage}
                                    onChange={(e) => updateEditingTier(actualIndex, "marginPercentage", e.target.value)}
                                    className="w-20"
                                    data-testid={`input-tier-margin-${index}`}
                                  />
                                  <Percent className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">margin</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => markTierForDeletion(actualIndex)}
                                  data-testid={`button-delete-tier-${index}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleSaveTiers}
                        disabled={saveTiersMutation.isPending}
                        data-testid="button-save-tiers"
                      >
                        {saveTiersMutation.isPending ? "Saving..." : "Save Tiers"}
                      </Button>
                    </div>

                    <div className="mt-4 p-4 rounded-lg border bg-background">
                      <p className="text-sm font-medium mb-3">Example Calculations</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {editingTiers.filter(t => !t.isDeleted).sort((a, b) => Number(a.minAmount) - Number(b.minAmount)).map((tier, i, arr) => {
                          const baseExample = Number(tier.minAmount) + 50;
                          const margin = Number(tier.marginPercentage);
                          const clientPays = baseExample + (baseExample * margin / 100);
                          const nextTier = arr[i + 1];
                          const rangeText = nextTier 
                            ? `$${tier.minAmount} - $${Number(nextTier.minAmount) - 0.01}`
                            : `$${tier.minAmount}+`;
                          return (
                            <div key={tier.id} className="p-3 rounded bg-muted/50">
                              <p className="text-muted-foreground mb-2">{rangeText}</p>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Base Rate</span>
                                  <span>${baseExample.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Margin ({margin}%)</span>
                                  <span className="text-green-600 dark:text-green-400">+${(baseExample * margin / 100).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-medium border-t pt-1">
                                  <span>Client Pays</span>
                                  <span>${clientPays.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
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
                    <span className="text-sm text-muted-foreground">
                      Tiered pricing active
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
                  <span>Higher margins on lower-value shipments (under $100)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">2.</span>
                  <span>Lower margins on high-value shipments to stay competitive</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">3.</span>
                  <span>VIP profiles get lower margins across all tiers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">4.</span>
                  <span>Add more tiers for granular pricing control</span>
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
              Update the name for this profile. Manage tiers by expanding the profile card.
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
              <Label htmlFor="editMargin">Default Margin (fallback)</Label>
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
              <p className="text-xs text-muted-foreground">
                Used when no pricing tiers are defined
              </p>
            </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Pricing Profile</DialogTitle>
            <DialogDescription>
              Add a new pricing profile with tiered margins
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
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
                  placeholder="e.g., enterprise"
                  data-testid="input-new-profile"
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (lowercase, underscores only)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newMargin">Default Margin (fallback)</Label>
              <div className="relative w-32">
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

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label>Pricing Tiers</Label>
                <Button variant="outline" size="sm" onClick={addNewTierToCreate} data-testid="button-add-new-tier">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Tier
                </Button>
              </div>
              
              <div className="space-y-3">
                {newTiers.map((tier, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Shipments</span>
                      <span className="text-sm font-medium">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={tier.minAmount}
                        onChange={(e) => updateNewTier(index, "minAmount", e.target.value)}
                        className="w-24"
                        data-testid={`input-new-tier-min-${index}`}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">and above</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="1000"
                        step="0.5"
                        value={tier.marginPercentage}
                        onChange={(e) => updateNewTier(index, "marginPercentage", e.target.value)}
                        className="w-20"
                        data-testid={`input-new-tier-margin-${index}`}
                      />
                      <Percent className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">margin</span>
                    </div>
                    {newTiers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewTier(index)}
                        data-testid={`button-remove-new-tier-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
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
              This will permanently delete the "{ruleToDelete?.displayName || ruleToDelete?.profile}" profile and all its pricing tiers.
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

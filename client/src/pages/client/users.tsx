import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClientLayout } from "@/components/client-layout";
import { LoadingScreen, LoadingSpinner } from "@/components/loading-spinner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, UserPlus, Shield, Crown, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

const PERMISSIONS = [
  { id: "view_shipments", label: "View Shipments", description: "Can view all shipments" },
  { id: "create_shipments", label: "Create Shipments", description: "Can create new shipments" },
  { id: "view_invoices", label: "View Invoices", description: "Can view invoices and download PDFs" },
  { id: "view_payments", label: "View Payments", description: "Can view payment history" },
  { id: "make_payments", label: "Make Payments", description: "Can make payments for invoices" },
  { id: "manage_users", label: "Manage Users", description: "Can manage team members" },
] as const;

type PermissionId = typeof PERMISSIONS[number]["id"];

interface ClientUser {
  id: string;
  username: string;
  email: string;
  isPrimaryContact: boolean;
  permissions: PermissionId[];
  createdAt: string;
}

interface MyPermissions {
  permissions: PermissionId[];
  isPrimaryContact: boolean;
}

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  permissions: z.array(z.string()),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

type UpdatePermissionsFormData = z.infer<typeof updatePermissionsSchema>;

export default function ClientUsers() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);

  const { data: myPerms, isLoading: permsLoading } = useQuery<MyPermissions>({
    queryKey: ["/api/client/my-permissions"],
  });

  const { data: users, isLoading } = useQuery<ClientUser[]>({
    queryKey: ["/api/client/users"],
    enabled: myPerms?.isPrimaryContact || myPerms?.permissions.includes("manage_users"),
  });

  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      permissions: [],
    },
  });

  const editForm = useForm<UpdatePermissionsFormData>({
    resolver: zodResolver(updatePermissionsSchema),
    defaultValues: {
      permissions: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const res = await apiRequest("POST", "/api/client/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/users"] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "User Created",
        description: "The new team member has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UpdatePermissionsFormData }) => {
      const res = await apiRequest("PATCH", `/api/client/users/${userId}/permissions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/users"] });
      setEditingUser(null);
      toast({
        title: "Permissions Updated",
        description: "User permissions have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/client/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/users"] });
      toast({
        title: "User Removed",
        description: "The team member has been removed from your account.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onCreateSubmit = (data: CreateUserFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: UpdatePermissionsFormData) => {
    if (editingUser) {
      updateMutation.mutate({ userId: editingUser.id, data });
    }
  };

  const openEditDialog = (user: ClientUser) => {
    setEditingUser(user);
    editForm.reset({ permissions: user.permissions });
  };

  if (permsLoading) {
    return <LoadingScreen />;
  }

  const canManageUsers = myPerms?.isPrimaryContact || myPerms?.permissions.includes("manage_users");

  if (isLoading && canManageUsers) {
    return <LoadingScreen />;
  }

  if (!canManageUsers) {
    return (
      <ClientLayout>
        <div className="p-6">
          <Card>
            <CardContent className="py-16 text-center">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-medium">Access Denied</h2>
              <p className="mt-2 text-muted-foreground">
                You don't have permission to manage team members.
              </p>
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Team Members</h1>
            <p className="text-muted-foreground">
              Manage users and their permissions for your account
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>
                  Create a new user account for your team. They will receive login credentials.
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="johndoe" {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="At least 8 characters" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="permissions"
                    render={() => (
                      <FormItem>
                        <FormLabel>Permissions</FormLabel>
                        <FormDescription>
                          Select what this user can do in your account
                        </FormDescription>
                        <div className="space-y-3 mt-2">
                          {PERMISSIONS.map((perm) => (
                            <FormField
                              key={perm.id}
                              control={createForm.control}
                              name="permissions"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(perm.id)}
                                      onCheckedChange={(checked) => {
                                        const newValue = checked
                                          ? [...field.value, perm.id]
                                          : field.value?.filter((v) => v !== perm.id);
                                        field.onChange(newValue);
                                      }}
                                      data-testid={`checkbox-perm-${perm.id}`}
                                    />
                                  </FormControl>
                                  <div className="space-y-0.5">
                                    <FormLabel className="font-normal cursor-pointer">
                                      {perm.label}
                                    </FormLabel>
                                    <FormDescription className="text-xs">
                                      {perm.description}
                                    </FormDescription>
                                  </div>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                      {createMutation.isPending && <LoadingSpinner className="mr-2" />}
                      Create User
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members ({users?.length || 0})
            </CardTitle>
            <CardDescription>
              Users with access to your account and their assigned permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!users || users.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="mx-auto h-10 w-10 mb-3 opacity-50" />
                <p>No team members yet.</p>
                <p className="text-sm">Add team members to collaborate on your account.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {user.username}
                              {user.isPrimaryContact && (
                                <Badge variant="default" className="gap-1">
                                  <Crown className="h-3 w-3" />
                                  Primary
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.isPrimaryContact ? (
                            <Badge variant="secondary">All Permissions</Badge>
                          ) : user.permissions.length === 0 ? (
                            <span className="text-muted-foreground text-sm">No permissions</span>
                          ) : (
                            user.permissions.map((perm) => {
                              const permInfo = PERMISSIONS.find((p) => p.id === perm);
                              return (
                                <Badge key={perm} variant="outline" className="text-xs">
                                  {permInfo?.label || perm}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        {!user.isPrimaryContact && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(user)}
                              data-testid={`button-edit-${user.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  data-testid={`button-delete-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to remove {user.username} from your account?
                                    They will no longer have access to any features.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid="button-confirm-delete"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Permissions</DialogTitle>
              <DialogDescription>
                Update permissions for {editingUser?.username}
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="permissions"
                  render={() => (
                    <FormItem>
                      <div className="space-y-3 mt-2">
                        {PERMISSIONS.map((perm) => (
                          <FormField
                            key={perm.id}
                            control={editForm.control}
                            name="permissions"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(perm.id)}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...field.value, perm.id]
                                        : field.value?.filter((v) => v !== perm.id);
                                      field.onChange(newValue);
                                    }}
                                    data-testid={`checkbox-edit-perm-${perm.id}`}
                                  />
                                </FormControl>
                                <div className="space-y-0.5">
                                  <FormLabel className="font-normal cursor-pointer">
                                    {perm.label}
                                  </FormLabel>
                                  <FormDescription className="text-xs">
                                    {perm.description}
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                    {updateMutation.isPending && <LoadingSpinner className="mr-2" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </ClientLayout>
  );
}

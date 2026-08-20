import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchCurrentUser, requestLoginCode, signIn, signInWithCode, signOut } from "../services/auth";



export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchCurrentUser,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => signIn(username, password),

    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useRequestLoginCode() {
  return useMutation({
    mutationFn: (email: string) => requestLoginCode(email),
  });
}

export function useSignInWithCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      email,
      code,
    }: {
      email: string;
      code: string;
    }) => signInWithCode(email, code),

    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,

    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: authKeys.all,
      });
    },
  });
}
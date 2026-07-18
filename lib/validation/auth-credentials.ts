import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;

export function parseAuthCredentials(
  input: FormData | Record<string, FormDataEntryValue | null | undefined>,
):
  | { success: true; data: AuthCredentials }
  | { success: false; error: "validation" } {
  const email = input instanceof FormData ? input.get("email") : input.email;
  const password =
    input instanceof FormData ? input.get("password") : input.password;

  const result = authCredentialsSchema.safeParse({
    email,
    password,
  });

  if (!result.success) {
    return { success: false, error: "validation" };
  }

  return { success: true, data: result.data };
}

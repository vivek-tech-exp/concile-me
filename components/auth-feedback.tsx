import {
  authErrorMessage,
  authSuccessMessage,
} from "@/lib/auth/messages";

type AuthFeedbackProps = {
  error?: string | string[] | undefined;
  message?: string | string[] | undefined;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function AuthFeedback({ error, message }: AuthFeedbackProps) {
  const errorText = authErrorMessage(firstParam(error));
  const successText = authSuccessMessage(firstParam(message));

  if (!errorText && !successText) {
    return null;
  }

  return (
    <div className="grid gap-2" aria-live="polite">
      {errorText ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorText}
        </p>
      ) : null}
      {successText ? (
        <p
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {successText}
        </p>
      ) : null}
    </div>
  );
}

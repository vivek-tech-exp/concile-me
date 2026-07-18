import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppHomePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application home</CardTitle>
        <CardDescription>
          Placeholder for import, reconciliation, and dashboard workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        You are signed in. CSV import and reconciliation arrive in later stages.
      </CardContent>
    </Card>
  );
}

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
        This route is labelled scaffolding only. Authentication, data import, and
        reconciliation are not implemented in Stage 1.
      </CardContent>
    </Card>
  );
}

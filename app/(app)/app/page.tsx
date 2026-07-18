import { ImportForm } from "@/features/imports/import-form";
import {
  ImportHistory,
  loadOwnedImports,
} from "@/features/imports/import-history";

export default async function AppHomePage() {
  const imports = await loadOwnedImports();

  return (
    <div className="space-y-8">
      <ImportForm />
      <ImportHistory result={imports} />
    </div>
  );
}

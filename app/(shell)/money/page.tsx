import { MoneyApp } from "@/components/money/money-app";

// The ledger: the period's entries, the add form and the accounts.
export default function MoneyPage() {
  return <MoneyApp view="entries" />;
}

import { RulesApp } from "@/components/money/rules";

// "Payee contains X → category Y, tags Z", first match wins (FR-MONEY-13).
export default function MoneyRulesPage() {
  return <RulesApp />;
}

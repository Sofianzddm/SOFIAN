import { Suspense } from "react";
import { LoginScreen } from "@/components/rh/login/LoginScreen";

export default function RhLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

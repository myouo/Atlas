import { AppProviders } from "./providers";
import { AboutPage } from "../features/dashboard/about-page";

export default function Page() {
  return (
    <AppProviders>
      <AboutPage />
    </AppProviders>
  );
}

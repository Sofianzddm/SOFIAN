import CannesCoiffeurBookingClient from "./CannesCoiffeurBookingClient";
import { prisma } from "@/lib/prisma";
import {
  COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
  photoUrlFromStoredValue,
} from "@/lib/cannes-coiffeur/public-profile-setting";

export default async function CannesCoiffeurPublicPage() {
  let seedPortraitUrl: string | null = null;
  try {
    const row = await prisma.cannesSharedSetting.findUnique({
      where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
      select: { value: true },
    });
    seedPortraitUrl = photoUrlFromStoredValue(row?.value);
  } catch {
    seedPortraitUrl = null;
  }

  return <CannesCoiffeurBookingClient seedPortraitUrl={seedPortraitUrl} />;
}

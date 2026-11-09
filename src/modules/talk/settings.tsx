'use client';

import { MediaDevicesCard } from '@/modules/talk/components/settings/media-devices-card';
import { NotificationsCard } from '@/modules/talk/components/settings/notifications-card';
import { SoundsCard } from '@/modules/talk/components/settings/sounds-card';

/** Talk in Settings: the camera and microphone, notifications on this device, and the sounds. */
export default function TalkSettings() {
  return (
    <>
      <MediaDevicesCard />
      <NotificationsCard />
      <SoundsCard />
    </>
  );
}

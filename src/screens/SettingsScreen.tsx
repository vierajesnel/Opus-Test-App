import { useNav } from '../nav/Navigator';
import { Screen } from '../ui/Screen';
import { SettingsList } from './SettingsList';

export function SettingsScreen() {
  const nav = useNav();
  return (
    <Screen title="Settings" subtitle="Tune the sky to taste." onBack={nav.back}>
      <SettingsList />
    </Screen>
  );
}

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ACHIEVEMENTS } from '../content/achievements';
import { SKIN_ORDER, SKINS } from '../game/skins';
import { resetProgress, setSetting, useSave } from '../state/app';
import { SKIN_UNLOCKS, skinUnlocked } from '../state/progress';
import { Button, Panel, SegmentedRow, SliderRow, ToggleRow } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useAmbience } from '../ui/ThemeProvider';
import { radius, space } from '../ui/theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel style={styles.section}>
      <Text variant="label" caps tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </Panel>
  );
}

function CometPicker() {
  const save = useSave((s) => s);
  const { theme } = useAmbience();
  const p = theme.palette;
  const current = save.settings.comet;
  return (
    <View style={styles.skins} accessibilityRole="radiogroup" accessibilityLabel="Comet">
      {SKIN_ORDER.map((skin) => {
        const look = SKINS[skin];
        const open = skinUnlocked(save, skin);
        const selected = skin === current;
        const requirement = SKIN_UNLOCKS[skin];
        const hint = open
          ? look.blurb
          : `Locked. ${ACHIEVEMENTS.find((a) => a.id === requirement)?.secret ? 'A secret.' : ACHIEVEMENTS.find((a) => a.id === requirement)?.blurb ?? ''}`;
        return (
          <Pressable
            key={skin}
            disabled={!open}
            onPress={() => setSetting('comet', skin)}
            accessibilityRole="radio"
            accessibilityLabel={look.name}
            accessibilityHint={hint}
            accessibilityState={{ selected, disabled: !open }}
            style={[styles.skin, { borderColor: selected ? p.accent : p.border, opacity: open ? 1 : 0.5 }]}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: look.trail[theme.name], borderColor: look.head[theme.name] },
                look.aurora && styles.aurora,
              ]}
            >
              {!open && <Icon name="lock" size={14} color={p.text} />}
            </View>
            <Text variant="caption" maxFontSizeMultiplier={1.3}>
              {look.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** All settings, grouped. `inGame` hides the destructive bits. */
export function SettingsList({ inGame = false }: { inGame?: boolean }) {
  const s = useSave((save) => save.settings);
  const [confirming, setConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  return (
    <View style={styles.list}>
      <Section title="Sound">
        <ToggleRow label="Mute everything" detail="Also follows your phone’s silent switch." value={s.muted} onChange={(v) => setSetting('muted', v)} />
        <SliderRow label="Music" value={s.music} onChange={(v) => setSetting('music', v)} />
        <SliderRow label="Sound effects" value={s.sfx} onChange={(v) => setSetting('sfx', v)} />
      </Section>
      <Section title="Feel">
        <ToggleRow label="Haptics" detail="Feel the pull of the sling and the snap of a waking star." value={s.haptics} onChange={(v) => setSetting('haptics', v)} />
        <ToggleRow label="Tilt parallax" detail="Lean your phone; the far sky leans back." value={s.tilt} onChange={(v) => setSetting('tilt', v)} />
      </Section>
      <Section title="Look">
        <SegmentedRow
          label="Sky"
          detail="Midnight glows. Almanac is ink on an old chart. System follows light and dark mode."
          value={s.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'midnight', label: 'Midnight' },
            { value: 'almanac', label: 'Almanac' },
          ]}
          onChange={(v) => setSetting('theme', v)}
        />
        <SegmentedRow
          label="Motion"
          detail="Reduced keeps the sky calm: fewer particles, no tilt, gentle transitions."
          value={s.motion}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={(v) => setSetting('motion', v)}
        />
      </Section>
      <Section title="Play">
        <SegmentedRow
          label="Guidance"
          detail={
            s.guidance === 'adaptive'
              ? 'The aiming guide grows when you’re stuck, and hints unlock after your first fling.'
              : s.guidance === 'generous'
                ? 'Long aiming guides and hints from the start. No shame in a map.'
                : 'Short guides, no hints. Just you and gravity.'
          }
          value={s.guidance}
          options={[
            { value: 'adaptive', label: 'Adaptive' },
            { value: 'generous', label: 'Generous' },
            { value: 'purist', label: 'Purist' },
          ]}
          onChange={(v) => setSetting('guidance', v)}
        />
        <ToggleRow
          label="Precision aim pad"
          detail="Aim with buttons instead of dragging. Always on with a screen reader."
          value={s.aimPad}
          onChange={(v) => setSetting('aimPad', v)}
        />
      </Section>
      <Section title="Comet">
        <CometPicker />
      </Section>
      {!inGame && (
        <Section title="Logbook">
          {resetDone ? (
            <Text variant="bodySmall" tone="muted">
              Done. The stars have gone back to sleep. They don’t hold it against you.
            </Text>
          ) : confirming ? (
            <View style={styles.confirm}>
              <Text variant="bodySmall">
                Forget every sky, streak and achievement? Settings stay. This can’t be undone.
              </Text>
              <View style={styles.confirmRow}>
                <Button style={styles.flex} label="Keep it" onPress={() => setConfirming(false)} compact />
                <Button
                  style={styles.flex}
                  kind="primary"
                  label="Forget it all"
                  onPress={() => {
                    resetProgress();
                    setConfirming(false);
                    setResetDone(true);
                  }}
                  compact
                />
              </View>
            </View>
          ) : (
            <Button icon="trash" label="Reset progress" onPress={() => setConfirming(true)} />
          )}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.lg },
  section: { gap: space.xs },
  skins: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  skin: {
    alignItems: 'center',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minWidth: 72,
    minHeight: 72,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aurora: { backgroundColor: '#9b7bff' },
  confirm: { gap: space.md },
  confirmRow: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});

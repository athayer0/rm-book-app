import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { ColorPalette } from '../constants/colors';

interface Props<T extends string> {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
  /** Killed while a modal dialog is up over the sheet body, so a tab switch can't strand it. */
  disabled?: boolean;
}

/**
 * The tab strip under a `SheetModal` header. Both goal sheets split the same way
 * — weekly on the left, monthly on the right — so the strip is one component
 * rather than a copy each; the two that preceded it had already drifted apart in
 * underline inset.
 *
 * The underline is absolutely positioned inside the active tab rather than being
 * a sliding indicator over the whole strip: there are only ever two or three
 * tabs, and an animated one would need the strip's measured width.
 */
export function SheetTabs<T extends string>({ tabs, active, onChange, disabled }: Props<T>) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.tabBar} pointerEvents={disabled ? 'none' : 'auto'}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tabBtn}
          onPress={() => onChange(tab.key)}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>
            {tab.label}
          </Text>
          {active === tab.key && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    tabBar: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    tabBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      position: 'relative',
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: C.textSecondary,
    },
    tabLabelActive: {
      color: C.control,
    },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 1,
      backgroundColor: C.control,
    },
  });
}

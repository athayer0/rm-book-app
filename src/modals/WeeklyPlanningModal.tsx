import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PLANNING_PROMPTS = [
  'What are my top 3 priorities this week?',
  'Who do I want to connect with?',
  'What spiritual goals will I focus on?',
  'What service opportunities can I pursue?',
  'What am I grateful for this week?',
];

export function WeeklyPlanningModal({ visible, onClose }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <View style={{ width: 60 }} />
        <Text style={styles.headerTitle}>Weekly Planning</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Ionicons name="calendar" size={40} color={Colors.primary} />
          <Text style={styles.introTitle}>Plan Your Week</Text>
          <Text style={styles.introText}>
            Take a few minutes to set intentions and priorities for the week ahead.
          </Text>
        </View>

        {PLANNING_PROMPTS.map((prompt, i) => (
          <View key={i} style={styles.promptCard}>
            <Text style={styles.promptText}>{prompt}</Text>
            <TextInput
              style={styles.answer}
              value={answers[i] ?? ''}
              onChangeText={text => setAnswers(prev => ({ ...prev, [i]: text }))}
              placeholder="Write your thoughts..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Done Planning</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  closeBtn: {
    width: 60,
    alignItems: 'flex-end',
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  intro: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  promptCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  promptText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 10,
  },
  answer: {
    fontSize: 14,
    color: Colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 8,
    lineHeight: 20,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },
});

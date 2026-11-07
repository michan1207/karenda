import { Pressable, StyleSheet, View } from 'react-native';

import { Answer, ReviewTarget } from '../engine';
import { Card, Chip, Text } from './components';
import { dayTitle, titleOf } from './format';
import { useColors } from './theme';

const ANSWERS: [Answer, string][] = [
  ['hard', 'きつかった'],
  ['normal', 'ふつう'],
  ['easy', '平気だった'],
];

/** 終わった予定に「どうだった？」と聞く（3件まで）。答えから予定の重さを覚えていく */
export function ReviewCard({
  reviews,
  onAnswer,
}: {
  reviews: ReviewTarget[];
  onAnswer: (target: ReviewTarget, answer: Answer | null) => void;
}) {
  const colors = useColors();
  return (
    <Card>
      <Text style={[styles.cardTitle, { color: colors.text }]}>予定、どうだった？</Text>
      <Text style={[styles.reviewHelp, { color: colors.muted }]}>答えると予定の重さを覚えて、次のお知らせに生かします。</Text>
      {reviews.map((target) => {
        const name = `${dayTitle(target.date)}「${titleOf(target.title)}」`;
        return (
          <View key={`${target.eventId}|${target.date}`} style={styles.review}>
            <Text style={[styles.detailText, { color: colors.text }]}>{name}</Text>
            <View style={styles.reviewChips}>
              {ANSWERS.map(([answer, label]) => (
                <Chip key={answer} label={label} accessibilityLabel={`${name}は${label}`} tone={colors.pink} onPress={() => onAnswer(target, answer)} />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${name}は答えない`}
                onPress={() => onAnswer(target, null)}
                hitSlop={8}
                style={styles.reviewSkip}
              >
                <Text style={[styles.reviewChipText, { color: colors.muted }]}>答えない</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 16, fontWeight: '700' },
  detailText: { fontSize: 14, lineHeight: 21 },
  reviewHelp: { fontSize: 13 },
  review: { gap: 6 },
  reviewChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  reviewChipText: { fontSize: 13 },
  reviewSkip: { paddingHorizontal: 8, paddingVertical: 6 },
});

import { StyleSheet, View } from 'react-native';

import { PeriodPhase } from '../engine';
import { Card, Heart, PillHeading, Text } from './components';
import { MOOD_NOTES } from './moodNotes';
import { useColors } from './theme';

function Bullet({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletMark}>
        <Heart color={colors.heart} size={9} />
      </View>
      <Text style={[styles.detailText, styles.bulletText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

export function MoodNotesCard({ phase }: { phase: PeriodPhase }) {
  const colors = useColors();
  const note = MOOD_NOTES[phase];
  return (
    <Card>
      <PillHeading text={note.title} />
      <Text style={[styles.detailText, { color: colors.text }]}>{note.summary}</Text>
      <View>
        {note.feelings.map((feeling) => (
          <Bullet key={feeling} text={feeling} />
        ))}
      </View>
      <Text style={[styles.detailZone, { color: colors.muted }]}>
        感じ方には個人差があり、ここに書いたことは目安です。つらさが続く時や生活に支障がある時は、婦人科や心療内科に相談してみてください。
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', gap: 6 },
  bulletMark: { height: 21, justifyContent: 'center' },
  bulletText: { flex: 1 },
  detailZone: { fontSize: 13 },
  detailText: { fontSize: 14, lineHeight: 21 },
});

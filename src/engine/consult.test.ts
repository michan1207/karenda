import { ConsultReason, consultReasons, consultText } from './consult';
import { addDays } from './date';

/** 間隔の日数から開始日の並びを作る */
const fromGaps = (gaps: number[]) => gaps.reduce((starts, days) => [...starts, addDays(starts[starts.length - 1], days)], ['2026-01-05']);

describe('consultReasons', () => {
  it('says nothing until 3 intervals are recorded, or while cycles are steady', () => {
    expect(consultReasons(fromGaps([10, 60]))).toEqual([]);
    expect(consultReasons(fromGaps([28, 29, 27, 28, 30, 28]))).toEqual([]);
  });

  it('notes a wide range between the shortest and longest usual cycle', () => {
    expect(consultReasons(fromGaps([24, 34, 28]))).toEqual(['highSpread']);
    expect(consultReasons(fromGaps([25, 34, 28]))).toEqual([]);
  });

  it('notes very short or long intervals only when there are at least two', () => {
    expect(consultReasons(fromGaps([28, 60, 28, 28]))).toEqual([]);
    expect(consultReasons(fromGaps([28, 60, 28, 10]))).toEqual(['frequentExclusion', 'shortCycle', 'longCycle']);
    expect(consultReasons(fromGaps([50, 28, 60, 28]))).toEqual(['frequentExclusion', 'longCycle']);
  });

  it('looks only at the last 6 intervals', () => {
    expect(consultReasons(fromGaps([10, 10, 28, 28, 29, 28, 27, 28]))).toEqual([]);
  });
});

describe('consultText', () => {
  const all: ConsultReason[][] = [
    ['highSpread'],
    ['frequentExclusion', 'shortCycle'],
    ['frequentExclusion', 'longCycle'],
    ['highSpread', 'frequentExclusion', 'shortCycle', 'longCycle'],
  ];

  it('describes the records and leaves the decision to a doctor', () => {
    expect(consultText(['highSpread'])).toBe(
      '周期の長さのばらつきが大きめです。記録を続けるか、婦人科に相談するという目安もあります。判断は医師にご相談ください。',
    );
    expect(consultText(['frequentExclusion', 'shortCycle', 'longCycle'])).toContain('15日より短い・45日より長い間隔が何度かあります。');
  });

  // 仕様 §6.2: 病名の断定・推測や強い言葉を使わない
  it.each(all)('uses none of the forbidden words (%s)', (...reasons) => {
    const text = consultText(reasons);
    for (const word of ['PMS', 'PMDD', '子宮内膜症', '可能性が高い', '警戒', '警告', '危険', '診断', '治療', '絶対', '100%', '保証', '病気']) {
      expect(text).not.toContain(word);
    }
  });
});

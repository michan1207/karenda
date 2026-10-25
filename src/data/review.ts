import { isAvailableAsync, requestReview } from 'expo-store-review';

export type ReviewPrompt = () => Promise<void>;

/** OS標準のレビュー依頼。実際に出すか・何回までかはOSが決める */
export const deviceReview: ReviewPrompt = async () => {
  if (await isAvailableAsync()) await requestReview();
};

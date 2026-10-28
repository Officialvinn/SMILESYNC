/** Shows a photo stored in the encrypted database. The bytes are decrypted in memory only. */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { CaseRepo } from '../core/caseRepo';
import { toBase64 } from '../core/hex';
import { colors, size } from './theme';

export function Thumbnail({ repo, imageId, big }: { repo: CaseRepo; imageId: string; big?: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void repo.getImageBytes(imageId).then((b) => {
      if (live && b) setUri(`data:image/jpeg;base64,${toBase64(b)}`);
    });
    return () => {
      live = false;
    };
  }, [repo, imageId]);
  const style = big ? s.big : s.small;
  return uri ? <Image source={{ uri }} style={style} accessibilityIgnoresInvertColors /> : <View style={[style, s.empty]} />;
}

const s = StyleSheet.create({
  small: { width: 84, height: 84, borderRadius: size.radius },
  big: { width: '100%', aspectRatio: 4 / 3, borderRadius: size.radius },
  empty: { backgroundColor: colors.border },
});

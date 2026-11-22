/**
 * FR 3.1 camera inside the app, FR 3.2 guidance for each standard view,
 * FR 3.3 compression, FR 4.2 saved to the encrypted database on the phone.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ViewType } from '@smilesync/shared';
import { GENERAL_TIPS, VIEW_GUIDANCE, captureProgress } from '../core/capturePlan';
import type { CaseRepo, ImageMeta } from '../core/caseRepo';
import { discardPhoto, processPhoto, type CameraPhoto } from '../platform/photos';
import { Actions, Banner, BigButton, Body, Screen, StepHeader, TextButton } from '../ui/components';
import { Thumbnail } from '../ui/Thumbnail';
import { colors, size } from '../ui/theme';
import { TOTAL_STEPS } from './ConsentScreen';

type Mode =
  | { kind: 'overview' }
  | { kind: 'camera'; view: ViewType }
  | { kind: 'preview'; view: ViewType; photo: CameraPhoto }
  | { kind: 'saving'; view: ViewType };

const REQUIRED: ViewType[] = ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'];

export function CaptureScreen(props: { caseId: string; repo: CaseRepo; onDone: () => void; onExit: () => void }) {
  const { caseId, repo, onDone, onExit } = props;
  const [images, setImages] = useState<ImageMeta[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'overview' });
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const reload = useCallback(async () => {
    const list = await repo.listImages(caseId);
    setImages(list);
    return list;
  }, [repo, caseId]);

  // On first open, go straight to the camera for the first missing view (NFR 3: fewer taps).
  useEffect(() => {
    void reload().then((list) => {
      const next = captureProgress(list.map((i) => i.viewType)).next;
      if (next) setMode({ kind: 'camera', view: next });
    });
  }, [reload]);

  async function savePhoto(view: ViewType, photo: CameraPhoto) {
    setMode({ kind: 'saving', view });
    setError(null);
    try {
      const { bytes, sha256 } = await processPhoto(photo);
      await repo.saveImage(caseId, { viewType: view, bytes, sha256, capturedAt: new Date().toISOString() });
      const list = await reload();
      const next = captureProgress(list.map((i) => i.viewType)).next;
      // Keep going through the required views; extras and retakes return to the overview.
      setMode(view !== 'EXTRA' && next ? { kind: 'camera', view: next } : { kind: 'overview' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo. Try again.');
      setMode({ kind: 'overview' });
    }
  }

  if (mode.kind !== 'overview' && permission && !permission.granted) {
    return (
      <Screen
        header={<StepHeader step={3} total={TOTAL_STEPS} title="Camera permission" />}
        footer={
          <Actions>
            <BigButton label="Back" kind="secondary" onPress={() => setMode({ kind: 'overview' })} flex={1} />
            {permission.canAskAgain ? (
              <BigButton label="Allow camera" onPress={() => void requestPermission()} flex={2} />
            ) : (
              <BigButton label="Open settings" onPress={() => void Linking.openSettings()} flex={2} />
            )}
          </Actions>
        }
      >
        <Body>SmileSync needs the camera to take photos of the teeth. Photos stay encrypted on this phone.</Body>
      </Screen>
    );
  }

  if (mode.kind === 'camera') {
    return <CameraStep view={mode.view} onTaken={(photo) => setMode({ kind: 'preview', view: mode.view, photo })} onCancel={() => setMode({ kind: 'overview' })} />;
  }

  if (mode.kind === 'preview') {
    const { view, photo } = mode;
    return (
      <SafeAreaView style={s.dark}>
        <Text style={s.darkTitle}>{VIEW_GUIDANCE[view].title}</Text>
        <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="contain" accessibilityLabel="Photo just taken" />
        <Text style={s.darkText}>Are the teeth clear and in focus?</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <BigButton
              label="Retake"
              kind="secondary"
              onPress={() => {
                discardPhoto(photo);
                setMode({ kind: 'camera', view });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <BigButton label="Use photo" onPress={() => void savePhoto(view, photo)} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (mode.kind === 'saving' || images === null) {
    return (
      <SafeAreaView style={[s.dark, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={s.darkText}>Saving photo…</Text>
      </SafeAreaView>
    );
  }

  const progress = captureProgress(images.map((i) => i.viewType));
  const extras = images.filter((i) => i.viewType === 'EXTRA');

  return (
    <Screen
      header={<StepHeader step={3} total={TOTAL_STEPS} title={`Photos: ${progress.done} of ${progress.total} done`} />}
      footer={
        <View style={{ gap: 4 }}>
          <Actions hint={progress.canFinish ? null : `Take the ${progress.total - progress.done} missing ${progress.total - progress.done === 1 ? 'photo' : 'photos'} first`}>
            {progress.canFinish ? (
              <BigButton label="Next: symptoms" onPress={onDone} />
            ) : (
              <BigButton label="Take next photo" onPress={() => setMode({ kind: 'camera', view: progress.next! })} />
            )}
          </Actions>
          <TextButton label="Finish later (saved on this phone)" onPress={onExit} />
            </View>
      }
    >
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={s.tiles}>
        {REQUIRED.map((view) => {
          const img = images.find((i) => i.viewType === view);
          return (
            <View key={view} style={s.tile}>
              {img ? <Thumbnail repo={repo} imageId={img.id} /> : <View style={s.missing}><Text style={s.missingText}>Not taken</Text></View>}
              <Text style={s.viewTitle}>{VIEW_GUIDANCE[view].title.split(',')[0]}</Text>
              {img ? <Text style={s.taken}>✓ Taken</Text> : null}
              <TextButton label={img ? 'Retake' : 'Take photo'} onPress={() => setMode({ kind: 'camera', view })} />
            </View>
          );
        })}
        {extras.map((img, i) => (
          <View key={img.id} style={s.tile}>
            <Thumbnail repo={repo} imageId={img.id} />
            <Text style={s.viewTitle}>Extra {i + 1}</Text>
            <TextButton label="Remove" danger onPress={() => void repo.deleteImage(caseId, img.id).then(reload).catch((e: Error) => setError(e.message))} />
          </View>
        ))}
      </View>
      {progress.canFinish && progress.canAddExtra ? (
        <TextButton label="+ Add an extra photo (optional)" onPress={() => setMode({ kind: 'camera', view: 'EXTRA' })} />
      ) : null}
    </Screen>
  );
}

function CameraStep({ view, onTaken, onCancel }: { view: ViewType; onTaken: (p: CameraPhoto) => void; onCancel: () => void }) {
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [taking, setTaking] = useState(false);
  const guide = VIEW_GUIDANCE[view];

  async function take() {
    if (!camera.current || taking) return;
    setTaking(true);
    try {
      // exif: false — location and device details are not wanted (NFR 6).
      const p = await camera.current.takePictureAsync({ quality: 0.9, exif: false });
      onTaken({ uri: p.uri, width: p.width, height: p.height });
    } finally {
      setTaking(false);
    }
  }

  return (
    <View style={s.dark}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        autofocus="on"
        onCameraReady={() => setReady(true)}
      />
      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <View style={s.guideBox} accessibilityRole="summary">
          <Text style={s.darkTitle}>{guide.title}</Text>
          {[...guide.steps, ...GENERAL_TIPS].map((t) => (
            <Text key={t} style={s.darkText}>
              • {t}
            </Text>
          ))}
        </View>
        <View style={s.frame} pointerEvents="none" />
        <View style={s.controls}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Back" style={s.sideButton}>
            <Text style={s.sideText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={() => void take()}
            disabled={!ready || taking}
            accessibilityRole="button"
            accessibilityLabel={`Take photo: ${guide.title}`}
            style={[s.shutter, (!ready || taking) && { opacity: 0.5 }]}
          >
            <View style={s.shutterInner} />
          </Pressable>
          <Pressable
            onPress={() => setTorch((t) => !t)}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Light"
            style={s.sideButton}
          >
            <Text style={s.sideText}>{torch ? 'Light on' : 'Light off'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.navy, padding: size.gutter, gap: 12 },
  darkTitle: { color: '#fff', fontSize: size.title - 2, fontWeight: '700' },
  darkText: { color: '#fff', fontSize: size.text - 1, lineHeight: 24 },
  preview: { flex: 1, width: '100%' },
  row: { flexDirection: 'row', gap: 12 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  guideBox: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: size.radius, padding: 12, gap: 4 },
  frame: {
    alignSelf: 'center',
    width: '86%',
    aspectRatio: 4 / 3,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 24,
    borderStyle: 'dashed',
  },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  sideButton: {
    minWidth: 96,
    minHeight: size.touch,
    borderRadius: size.radius,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sideText: { color: '#fff', fontSize: size.text, fontWeight: '600' },
  shutter: { width: 88, height: 88, borderRadius: 44, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  tile: { width: '31%', minWidth: 100, alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: size.radius, paddingVertical: 10, paddingHorizontal: 6 },
  viewTitle: { fontSize: size.small + 1, fontWeight: '800', color: colors.text, textAlign: 'center' },
  taken: { fontSize: size.small, fontWeight: '700', color: colors.primary },
  missing: { width: 84, height: 84, borderRadius: size.radius, backgroundColor: colors.bg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  missingText: { fontSize: size.small - 2, color: colors.muted },
});
